import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { advance, apply, startGame, type Board, type FamilyMember, type FarmState } from '@pixel-farm/shared';
import { PROFILES, simulate } from '@pixel-farm/shared/bot';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb, type DB } from './db.js';
import { createSession } from './sessions.js';
import { upsertUser } from './users.js';

const T0 = Date.UTC(2026, 0, 5); // the bot's start: a Monday
let app: FastifyInstance | undefined;
let now = T0;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function setup(): Promise<{ app: FastifyInstance; db: DB }> {
  const db = openDb(':memory:');
  now = T0;
  app = await buildApp(loadConfig({ NODE_ENV: 'test' }), db, () => now);
  return { app, db };
}

function player(db: DB, name: string) {
  const id = upsertUser(db, { sub: name, displayName: name, locale: 'cs', isAdmin: false });
  return { id, cookies: { pf_session: createSession(db, id) } };
}

/** A farm played by the bot for `sec` seconds. */
function farm(profile: string, sec: number): FarmState {
  return simulate(PROFILES.find((p) => p.name === profile)!, sec).state;
}

describe('save sync', () => {
  it('stores a first save, then accepts the next one built on it', async () => {
    const { app, db } = await setup();
    const p = player(db, 'pavel');
    expect((await app.inject({ url: '/api/save', cookies: p.cookies })).json()).toEqual({ version: 0, state: null });

    const s = startGame(T0, 1);
    now = T0 + 5_000;
    for (let i = 0; i < 10; i++) apply(s, { type: 'tap', at: T0 + i * 200 });
    let res = await app.inject({ method: 'PUT', url: '/api/save', cookies: p.cookies, payload: { baseVersion: 0, state: s } });
    expect(res.json()).toEqual({ version: 1, clamped: [] });

    now += 30_000;
    advance(s, now);
    apply(s, { type: 'tap', at: now });
    res = await app.inject({ method: 'PUT', url: '/api/save', cookies: p.cookies, payload: { baseVersion: 1, state: s } });
    expect(res.json()).toEqual({ version: 2, clamped: [] });
    expect((await app.inject({ url: '/api/save', cookies: p.cookies })).json()).toMatchObject({ version: 2, state: { coins: 11 } });
  });

  it('answers a stale upload with the server copy', async () => {
    const { app, db } = await setup();
    const p = player(db, 'pavel');
    const s = startGame(T0, 1);
    await app.inject({ method: 'PUT', url: '/api/save', cookies: p.cookies, payload: { baseVersion: 0, state: s } });
    const res = await app.inject({ method: 'PUT', url: '/api/save', cookies: p.cookies, payload: { baseVersion: 0, state: s } });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ version: 1, state: { createdAt: T0 } });
  });

  it('rejects garbage and requires a login', async () => {
    const { app, db } = await setup();
    const p = player(db, 'pavel');
    const bad = await app.inject({ method: 'PUT', url: '/api/save', cookies: p.cookies, payload: { baseVersion: 0, state: { v: 1, coins: 'x' } } });
    expect(bad.statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/api/save', payload: { baseVersion: 0, state: {} } })).statusCode).toBe(401);
  });

  it('clamps a doctored save and sends the clamped farm back', async () => {
    const { app, db } = await setup();
    const p = player(db, 'pavel');
    const s = farm('active', 600);
    now = s.t;
    await app.inject({ method: 'PUT', url: '/api/save', cookies: p.cookies, payload: { baseVersion: 0, state: s } });

    const doctored = structuredClone(s);
    now += 30_000;
    advance(doctored, now);
    doctored.coins += 1e9;
    doctored.lifetimeCoins += 1e9;
    const res = await app.inject({ method: 'PUT', url: '/api/save', cookies: p.cookies, payload: { baseVersion: 1, state: doctored } });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ version: number; clamped: string[]; state: FarmState }>();
    expect(body.clamped).toContain('coins');
    expect(body.state.lifetimeCoins).toBeLessThan(s.lifetimeCoins + 100_000);

    const allTime = (await app.inject({ url: '/api/leaderboards/allTime', cookies: p.cookies })).json<Board>();
    expect(allTime.sections[0]!.rows[0]!.detail).toBe(body.state.lifetimeCoins);
  });

  it('rejects a farm with upgrades nobody paid for', async () => {
    const { app, db } = await setup();
    const p = player(db, 'pavel');
    const s = startGame(T0, 1);
    s.tapLevel = 30;
    const res = await app.inject({ method: 'PUT', url: '/api/save', cookies: p.cookies, payload: { baseVersion: 0, state: s } });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ reason: 'unpaid', version: 0, state: null });
  });
});

describe('family and boards', () => {
  it('three players see each other ranked', async () => {
    const { app, db } = await setup();
    const players = { pavel: player(db, 'Pavel'), nikola: player(db, 'Nikola'), kid: player(db, 'Kid') };
    // Same play time, different styles: the active player earns most.
    const farms = { pavel: farm('active', 3600), nikola: farm('casual', 3600 * 14), kid: farm('kid', 3600 * 9) };
    for (const [who, s] of Object.entries(farms)) {
      now = Math.max(now, s.t);
      const res = await app.inject({
        method: 'PUT',
        url: '/api/save',
        cookies: players[who as keyof typeof players].cookies,
        payload: { baseVersion: 0, state: s },
      });
      expect(res.json(), who).toMatchObject({ clamped: [] });
    }

    const expected = Object.entries(farms)
      .sort(([, a], [, b]) => b.lifetimeCoins - a.lifetimeCoins)
      .map(([who]) => players[who as keyof typeof players].id);

    for (const viewer of Object.values(players)) {
      const board = (await app.inject({ url: '/api/leaderboards/allTime', cookies: viewer.cookies })).json<Board>();
      expect(board.sections[0]!.rows.map((r) => r.userId)).toEqual(expected);
      expect(board.sections[0]!.rows.map((r) => r.rank)).toEqual([1, 2, 3]);

      const week = (await app.inject({ url: '/api/leaderboards/week', cookies: viewer.cookies })).json<Board>();
      expect(week.sections[0]!.rows.map((r) => r.userId)).toEqual(expected);

      const fam = (await app.inject({ url: '/api/family', cookies: viewer.cookies })).json<FamilyMember[]>();
      expect(fam).toHaveLength(3);
      expect(fam[0]!.id).toBe(viewer.id);
      expect(fam.every((m) => m.lifetimeCoins > 0 && m.lastSeen !== null)).toBe(true);
    }
  });

  it('resets the weekly board on Monday 00:00 Prague and keeps the all-time one', async () => {
    const { app, db } = await setup();
    const p = player(db, 'Pavel');
    const s = startGame(T0, 1);
    now = T0 + 1000;
    for (let i = 0; i < 5; i++) apply(s, { type: 'tap', at: T0 + i * 100 });
    await app.inject({ method: 'PUT', url: '/api/save', cookies: p.cookies, payload: { baseVersion: 0, state: s } });
    const week = async () => (await app.inject({ url: '/api/leaderboards/week', cookies: p.cookies })).json<Board>().sections[0]!.rows[0]!.value;
    expect(await week()).toBe(5);

    // Sunday 2026-01-11 23:30 Prague is 22:30 UTC; Monday starts at 23:00 UTC.
    now = Date.UTC(2026, 0, 11, 22, 30);
    expect(await week()).toBe(5);
    now = Date.UTC(2026, 0, 11, 23, 0);
    expect(await week()).toBe(0);

    advance(s, now);
    apply(s, { type: 'tap', at: now });
    await app.inject({ method: 'PUT', url: '/api/save', cookies: p.cookies, payload: { baseVersion: 1, state: s } });
    expect(await week()).toBe(1);
    const allTime = (await app.inject({ url: '/api/leaderboards/allTime', cookies: p.cookies })).json<Board>();
    expect(allTime.sections[0]!.rows[0]!.detail).toBe(6);
  });

  it('shares ranks on ties and 404s unknown boards', async () => {
    const { app, db } = await setup();
    const a = player(db, 'A');
    player(db, 'B');
    const board = (await app.inject({ url: '/api/leaderboards/collector', cookies: a.cookies })).json<Board>();
    expect(board.sections[0]!.rows.map((r) => r.rank)).toEqual([1, 1]);
    expect((await app.inject({ url: '/api/leaderboards/nope', cookies: a.cookies })).statusCode).toBe(404);
    const games = (await app.inject({ url: '/api/leaderboards/minigames', cookies: a.cookies })).json<Board>();
    expect(games.sections).toEqual([]);
  });
});
