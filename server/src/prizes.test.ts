import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  GameSession,
  MINIGAME_POOL,
  RARE_BREEDS,
  apply,
  collectionPct,
  pexeso,
  startGame,
  weekKey,
  type Board,
  type FamilyMember,
  type FarmState,
  type Inbox,
  type PlayResult,
  type PrizeClaim,
} from '@pixel-farm/shared';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb, type DB } from './db.js';
import { awardPrizes } from './prizes.js';
import { createSession } from './sessions.js';
import { upsertUser } from './users.js';

// Prague is UTC+2 on these dates; 2026-10-05 is a Monday.
const at = (day: number, h: number, m = 0) => Date.UTC(2026, 9, day, h - 2, m);
let app: FastifyInstance | undefined;
let now = at(8, 10);
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function setup(random?: () => number) {
  const db = openDb(':memory:');
  now = at(8, 10);
  app = await buildApp(loadConfig({ NODE_ENV: 'test' }), db, () => now, random);
  const player = (name: string) => {
    const id = upsertUser(db, { sub: name, displayName: name, locale: 'en', isAdmin: false });
    return { id, cookies: { pf_session: createSession(db, id) } };
  };
  return { app, db, player };
}

type Player = { id: number; cookies: { pf_session: string } };
const inbox = async (p: Player) => (await app!.inject({ url: '/api/inbox', cookies: p.cookies })).json<Inbox>();
const claim = (p: Player, id: number) => app!.inject({ method: 'POST', url: `/api/prizes/${id}/claim`, cookies: p.cookies });
const upload = async (p: Player, s: FarmState, baseVersion = 0) =>
  (await app!.inject({ method: 'PUT', url: '/api/save', cookies: p.cookies, payload: { baseVersion, state: s } })).json<{ version: number; clamped: string[] }>();

function finishDaily(db: DB, userId: number, day: string, score: number, finishedAt: number) {
  db.prepare("INSERT INTO daily_results (user_id, date, game, seed, input_log, score, created_at, finished_at) VALUES (?, ?, 'pexeso', 1, '[]', ?, ?, ?)").run(
    userId,
    day,
    score,
    finishedAt,
    finishedAt,
  );
}

describe('daily challenge prize', () => {
  it("goes to yesterday's winner after the day settles, with a rare animal, once", async () => {
    const { app, db, player } = await setup();
    const [pavel, kid] = [player('Pavel'), player('Kid')];
    finishDaily(db, pavel.id, '2026-10-08', 300, at(8, 18));
    finishDaily(db, kid.id, '2026-10-08', 900, at(8, 19));

    // Just after midnight a late daily could still come in: nothing yet.
    now = at(9, 0, 5);
    expect((await inbox(kid)).prizes).toEqual([]);
    now = at(9, 0, 20);
    const { prizes } = await inbox(kid);
    expect(prizes).toHaveLength(1);
    const prize = prizes[0]!.prize;
    expect(prize).toMatchObject({ kind: 'crown', day: '2026-10-08' });
    expect(RARE_BREEDS).toContain(prize.kind === 'crown' && prize.item);
    expect((await inbox(pavel)).prizes).toEqual([]);
    expect(awardPrizes(db, now)).toEqual([]);

    // A push goes out like a gift.
    const job = db.prepare("SELECT type, payload_json FROM jobs WHERE user_id = ?").get(kid.id) as { type: string; payload_json: string };
    expect(job).toEqual({ type: 'gift', payload_json: '{"prize":"crown"}' });

    const res = await claim(kid, prizes[0]!.id);
    expect(res.json<PrizeClaim>()).toEqual({ seq: 1, prize });
    expect((await claim(kid, prizes[0]!.id)).statusCode).toBe(409);
    expect((await claim(pavel, prizes[0]!.id)).statusCode).toBe(409);
    void app;
  });

  it('the farm carries claimed prizes; invented crowns and trophies are clamped', async () => {
    const { db, player } = await setup();
    const kid = player('Kid');
    finishDaily(db, kid.id, '2026-10-07', 500, at(7, 18));
    const { prizes } = await inbox(kid);
    const { seq, prize } = (await claim(kid, prizes[0]!.id)).json<PrizeClaim>();
    const farm = startGame(now, 1);
    apply(farm, { type: 'prize', at: now, id: seq, prize });
    expect(farm.stats.crowns).toBe(1);
    expect(await upload(kid, farm)).toEqual({ version: 1, clamped: [] });

    apply(farm, { type: 'prize', at: now, id: 7, prize: { kind: 'trophy', week: '2026-09-28' } });
    farm.stats.crowns = 5;
    expect((await upload(kid, farm, 1)).clamped).toEqual(expect.arrayContaining(['crowns', 'trophies']));
  });
});

describe('weekly trophy', () => {
  it("goes to last week's top earner (everyone tied for first) after Monday 00:00", async () => {
    const { db, player } = await setup();
    const [pavel, mum, kid] = [player('Pavel'), player('Nikola'), player('Kid')];
    const week = weekKey(now);
    const coins = db.prepare('INSERT INTO week_coins (user_id, week, coins) VALUES (?, ?, ?)');
    coins.run(pavel.id, week, 5000);
    coins.run(mum.id, week, 5000);
    coins.run(kid.id, week, 1200);

    expect((await inbox(pavel)).prizes).toEqual([]);
    now = at(12, 9); // next Monday
    for (const p of [pavel, mum]) expect((await inbox(p)).prizes.map((x) => x.prize)).toEqual([{ kind: 'trophy', week }]);
    expect((await inbox(kid)).prizes).toEqual([]);
  });

  it('counts coins per week from saves, so last week survives the Monday reset', async () => {
    const { db, player } = await setup();
    const kid = player('Kid');
    const farm = startGame(now - 60_000, 1);
    for (let i = 0; i < 50; i++) apply(farm, { type: 'tap', at: now - 1000 });
    await upload(kid, farm);
    now = at(12, 9);
    for (let i = 0; i < 10; i++) apply(farm, { type: 'tap', at: now - 1000 });
    await upload(kid, farm, 1);
    expect(db.prepare('SELECT week, coins FROM week_coins WHERE user_id = ? ORDER BY week').all(kid.id)).toEqual([
      { week: '2026-10-05', coins: 50 },
      { week: '2026-10-12', coins: 10 },
    ]);
  });
});

describe('collections on the server', () => {
  function pexesoLog(seed: number) {
    const s = new GameSession(pexeso, seed);
    s.move({ flip: 0 }, 1000);
    return s.log;
  }
  const play = async (p: Player) =>
    (await app!.inject({ method: 'POST', url: '/api/minigame/result', cookies: p.cookies, payload: { game: 'pexeso', seed: 3, log: pexesoLog(3) } })).json<PlayResult>();

  it('sometimes pays a minigame reward with a collectible the farm does not have', async () => {
    const lucky = await setup(() => 0);
    const p = lucky.player('Kid');
    const r = await play(p);
    expect(r.reward).toMatchObject({ game: 'pexeso' });
    expect(MINIGAME_POOL).toContain(r.reward!.item);
    await app!.close();
    const unlucky = await setup(() => 0.99);
    expect((await play(unlucky.player('Kid'))).reward).toMatchObject({ item: null });
  });

  it('ranks the Collector and Medals boards from the save and shows the badge in the family bar', async () => {
    const { player } = await setup();
    const kid = player('Kid');
    const farm = startGame(now - 60_000, 1);
    for (let i = 0; i < 100; i++) apply(farm, { type: 'tap', at: now - 1000 });
    farm.found.decor.push('sunflower', 'pot-red');
    await upload(kid, farm);
    const board = (await app!.inject({ url: '/api/leaderboards/collector', cookies: kid.cookies })).json<Board>();
    expect(board.sections[0]!.rows[0]).toMatchObject({ userId: kid.id, value: collectionPct(farm) });
    const medals = (await app!.inject({ url: '/api/leaderboards/achievements', cookies: kid.cookies })).json<Board>();
    expect(medals.sections[0]!.rows[0]).toMatchObject({ value: 1 });
    const fam = (await app!.inject({ url: '/api/family', cookies: kid.cookies })).json<FamilyMember[]>();
    expect(fam[0]).toMatchObject({ prestige: 0, medals: 1 });
  });
});
