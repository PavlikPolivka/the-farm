import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  GameSession,
  apply,
  dailyGame,
  dayKey,
  pexeso,
  startGame,
  type DailyInfo,
  type DailyStart,
  type FamilyMember,
  type GamesInfo,
  type PlayResult,
} from '@pixel-farm/shared';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb, type DB } from './db.js';
import { REWARDED_PLAYS, dailySeed } from './games.js';
import { createSession } from './sessions.js';
import { upsertUser } from './users.js';

const NOW = Date.UTC(2026, 9, 8, 10); // a Thursday morning in Prague
let app: FastifyInstance | undefined;
let now = NOW;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function setup() {
  const db = openDb(':memory:');
  now = NOW;
  app = await buildApp(loadConfig({ NODE_ENV: 'test', DAILY_SECRET: 'test-daily-secret' }), db, () => now);
  return { app, db };
}

function player(db: DB, name: string) {
  const id = upsertUser(db, { sub: name, displayName: name, locale: 'cs', isAdmin: false });
  return { id, cookies: { pf_session: createSession(db, id) } };
}

/** A finished pexeso log for any seed: flip every pair, knowing the board. */
function solvedPexeso(seed: number) {
  const s = new GameSession(pexeso, seed);
  let at = 1000;
  for (let face = 0; face < 8; face++) {
    const [a, b] = s.state.cards.flatMap((f, i) => (f === face ? [i] : []));
    s.move({ flip: a! }, (at += 800));
    s.move({ flip: b! }, (at += 800));
  }
  return s;
}

describe('free play', () => {
  it('replays the log, rewards five plays per game per day, then it is practice', async () => {
    const { app, db } = await setup();
    const p = player(db, 'Kid');
    const results: PlayResult[] = [];
    for (let i = 0; i < REWARDED_PLAYS + 1; i++) {
      const s = solvedPexeso(100 + i);
      const res = await app.inject({ method: 'POST', url: '/api/minigame/result', cookies: p.cookies, payload: { game: 'pexeso', seed: 100 + i, log: s.log } });
      expect(res.statusCode).toBe(200);
      results.push(res.json());
      expect(results[i]!.score).toBe(s.result().score);
    }
    expect(results.slice(0, 5).every((r) => r.reward && r.reward.coins >= 30 && r.reward.xp > 0)).toBe(true);
    expect(results[5]!.reward).toBeNull();
    expect(results.map((r) => r.rewardsLeft)).toEqual([4, 3, 2, 1, 0, 0]);

    // Next day the rewards are back.
    now += 86_400_000;
    const info = (await app.inject({ url: '/api/games', cookies: p.cookies })).json<GamesInfo>();
    expect(info.games.find((g) => g.id === 'pexeso')).toMatchObject({ rewardsLeft: 5, best: Math.max(...results.map((r) => r.score)) });
  });

  it('refuses a log the engine cannot replay', async () => {
    const { app, db } = await setup();
    const p = player(db, 'Kid');
    const res = await app.inject({ method: 'POST', url: '/api/minigame/result', cookies: p.cookies, payload: { game: 'pexeso', seed: 1, log: [[5, { flip: 77 }]] } });
    expect(res.statusCode).toBe(400);
    const bad = await app.inject({ method: 'POST', url: '/api/minigame/result', cookies: p.cookies, payload: { game: 'chess', seed: 1, log: [] } });
    expect(bad.statusCode).toBe(400);
  });

  it('lets the save carry granted rewards and clamps invented ones', async () => {
    const { app, db } = await setup();
    const p = player(db, 'Kid');
    const farm = startGame(now, 1);
    const s = solvedPexeso(5);
    const { reward } = (
      await app.inject({ method: 'POST', url: '/api/minigame/result', cookies: p.cookies, payload: { game: 'pexeso', seed: 5, log: s.log } })
    ).json<PlayResult>();
    apply(farm, { type: 'reward', at: now, ...reward! });
    let res = await app.inject({ method: 'PUT', url: '/api/save', cookies: p.cookies, payload: { baseVersion: 0, state: farm } });
    expect(res.json()).toEqual({ version: 1, clamped: [] });

    apply(farm, { type: 'reward', at: now, id: 999, coins: 1e6, xp: 1e4 });
    res = await app.inject({ method: 'PUT', url: '/api/save', cookies: p.cookies, payload: { baseVersion: 1, state: farm } });
    expect(res.json().clamped).toEqual(expect.arrayContaining(['rewards', 'coins']));
  });
});

describe('daily challenge', () => {
  it('everyone gets the same seed; the first attempt is ranked; the winner wears the crown tomorrow', async () => {
    const { app, db } = await setup();
    const day = dayKey(now);
    const [a, b] = [player(db, 'Pavel'), player(db, 'Nikola')];

    const before = (await app.inject({ url: '/api/daily', cookies: a.cookies })).json<DailyInfo>();
    expect(before).toMatchObject({ day, game: dailyGame(day), status: 'open', crown: null });

    const startA = (await app.inject({ method: 'POST', url: '/api/daily/start', cookies: a.cookies })).json<DailyStart>();
    const startB = (await app.inject({ method: 'POST', url: '/api/daily/start', cookies: b.cookies })).json<DailyStart>();
    expect(startA).toEqual(startB);
    expect(startA.seed).toBe(dailySeed('test-daily-secret', day));
    expect((await app.inject({ method: 'POST', url: '/api/daily/start', cookies: a.cookies })).statusCode).toBe(409);

    // Play the day's game with random-but-legal-shaped moves; the server must agree with the client.
    const { GAMES } = await import('@pixel-farm/shared');
    const play = (taps: number) => {
      const s = new GameSession(GAMES[startA.game], startA.seed);
      for (let i = 0; i < taps; i++) s.move(sampleMove(startA.game, i), 500 + i * 700);
      return s;
    };
    const sa = play(40);
    const sb = play(10);
    const ra = (await app.inject({ method: 'POST', url: '/api/daily/result', cookies: a.cookies, payload: { day, log: sa.log } })).json<PlayResult>();
    const rb = (await app.inject({ method: 'POST', url: '/api/daily/result', cookies: b.cookies, payload: { day, log: sb.log } })).json<PlayResult>();
    expect(ra.score).toBe(sa.result().score);
    expect(rb.score).toBe(sb.result().score);
    expect(ra.reward!.coins).toBeGreaterThan(0);
    expect((await app.inject({ method: 'POST', url: '/api/daily/result', cookies: a.cookies, payload: { day, log: sa.log } })).statusCode).toBe(409);

    const winner = ra.score >= rb.score ? a : b;
    now += 86_400_000;
    const next = (await app.inject({ url: '/api/daily', cookies: b.cookies })).json<DailyInfo>();
    if (Math.max(ra.score, rb.score) > 0) expect(next.crown?.userId).toBe(winner.id);
    expect(next.status).toBe('open');
    const fam = (await app.inject({ url: '/api/family', cookies: a.cookies })).json<FamilyMember[]>();
    expect(fam.filter((m) => m.crown).map((m) => m.id)).toEqual(Math.max(ra.score, rb.score) > 0 ? [winner.id] : []);
  });

  it('refuses a result without a start, or long after it', async () => {
    const { app, db } = await setup();
    const p = player(db, 'Kid');
    const day = dayKey(now);
    expect((await app.inject({ method: 'POST', url: '/api/daily/result', cookies: p.cookies, payload: { day, log: [] } })).statusCode).toBe(404);
    await app.inject({ method: 'POST', url: '/api/daily/start', cookies: p.cookies });
    now += 3 * 3600_000;
    expect((await app.inject({ method: 'POST', url: '/api/daily/result', cookies: p.cookies, payload: { day, log: [] } })).statusCode).toBe(410);
  });
});

function sampleMove(game: string, i: number): unknown {
  switch (game) {
    case 'pexeso':
      return { flip: (i * 5) % 16 };
    case 'pipes':
      return { rotate: (i * 3) % 20 };
    case 'merge':
      return { dir: ['up', 'left', 'down', 'right'][i % 4] };
    case 'rush':
      return { tap: i % 12 };
    default:
      return { from: i % 6, to: (i + 1) % 6 };
  }
}
