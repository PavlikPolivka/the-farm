import { describe, expect, it } from 'vitest';
import { PROFILES, simulate } from './bot.js';
import { advance, apply, startGame } from './engine.js';
import { clone, type FarmState } from './state.js';
import { assetSpend, checkSave, parseSave, wealth } from './validate.js';

const T0 = Date.UTC(2026, 0, 5);
const json = (s: FarmState) => JSON.parse(JSON.stringify(s)) as unknown;

/** Plays a profile and uploads a save every `everySec` of game time, like the client does. */
function syncs(profile: string, untilSec: number, everySec: number) {
  const p = PROFILES.find((x) => x.name === profile)!;
  let server: FarmState | null = null;
  const verdicts: { at: number; clamped: string[]; rejected?: string }[] = [];
  simulate(p, untilSec, (s) => {
    if (server && s.t - server.t < everySec * 1000) return;
    const v = checkSave(server, parseSave(json(s)), s.t);
    verdicts.push(v.ok ? { at: s.t, clamped: v.clamped } : { at: s.t, clamped: [], rejected: v.reason });
    if (v.ok) server = v.state;
  });
  return verdicts;
}

describe('parseSave', () => {
  it('round-trips a real save', () => {
    const s = startGame(T0, 7);
    apply(s, { type: 'tap', at: T0 + 100 });
    expect(parseSave(json(s))).toEqual(s);
  });

  it('drops unknown keys and rejects malformed saves', () => {
    const s = json(startGame(T0, 7)) as Record<string, unknown>;
    expect(parseSave({ ...s, extra: 'x' })).not.toHaveProperty('extra');
    expect(() => parseSave({ ...s, v: 3 })).toThrow(/version/);
    expect(() => parseSave({ ...s, coins: -1 })).toThrow(/coins/);
    expect(() => parseSave({ ...s, coins: 'lots' })).toThrow(/coins/);
    expect(() => parseSave({ ...s, land: 99 })).toThrow(/land/);
    expect(() => parseSave({ ...s, fields: Array(9).fill((s.fields as unknown[])[0]) })).toThrow(/fields/);
    expect(() => parseSave(null)).toThrow();
  });
});

describe('checkSave: legit play is never clamped', () => {
  // Active: 2 h straight with syncs every 30 s. Casual and kid: two days of sessions and idle gaps.
  for (const [profile, until, every] of [
    ['active', 2 * 3600, 30],
    ['casual', 2 * 86_400, 30],
    ['kid', 2 * 86_400, 30],
    ['casual', 3 * 86_400, 6 * 3600],
  ] as const) {
    it(`${profile}, ${until / 3600} h, sync every ${every} s`, () => {
      const verdicts = syncs(profile, until, every);
      expect(verdicts.length).toBeGreaterThan(5);
      expect(verdicts.filter((v) => v.rejected || v.clamped.length)).toEqual([]);
    });
  }
});

describe('checkSave: doctored saves', () => {
  /** Ten minutes of the active bot, then a sync 30 s later. */
  function played(): { prev: FarmState; next: FarmState } {
    let prev: FarmState | null = null;
    let next: FarmState | null = null;
    simulate(PROFILES.find((p) => p.name === 'active')!, 630, (s) => {
      if (!prev && s.t >= T0 + 600_000) prev = clone(s);
      next = clone(s);
    });
    return { prev: prev!, next: next! };
  }

  it('clamps extra coins back to what the farm could have earned', () => {
    const { prev, next } = played();
    const honest = next.lifetimeCoins;
    next.coins += 1_000_000;
    next.lifetimeCoins += 1_000_000;
    const v = checkSave(prev, next, next.t);
    expect(v.ok && v.clamped).toContain('coins');
    if (!v.ok) return;
    expect(v.state.lifetimeCoins).toBeLessThan(honest + 50_000);
    expect(wealth(v.state)).toBeLessThan(wealth(next));
  });

  it('clamps a stuffed barn', () => {
    const { prev, next } = played();
    next.inv.honey += 5000;
    const v = checkSave(prev, next, next.t);
    expect(v.ok && v.clamped).toContain('coins');
    if (v.ok) expect(v.state.inv.honey).toBeLessThan(100);
  });

  it('clamps XP and orders', () => {
    const { prev, next } = played();
    next.xp += 1_000_000;
    next.stats.ordersDone += 1000;
    const v = checkSave(prev, next, next.t);
    expect(v.ok && v.clamped).toEqual(expect.arrayContaining(['xp', 'orders']));
  });

  it('rejects upgrades that were never paid for', () => {
    const { prev, next } = played();
    next.tapLevel = 40;
    expect(checkSave(prev, next, next.t)).toEqual({ ok: false, reason: 'unpaid' });
    const { next: n2 } = played();
    n2.animals.cow.count = 50;
    expect(checkSave(prev, n2, n2.t).ok).toBe(false);
  });

  it('gives no extra time for a clock set in the future', () => {
    const { prev, next } = played();
    const later = clone(next);
    advance(later, next.t + 86_400_000);
    later.coins += 1_000_000;
    later.lifetimeCoins += 1_000_000;
    const v = checkSave(prev, later, next.t);
    expect(v.ok && v.clamped).toContain('coins');
  });

  it('accepts a first upload of a fresh farm, and caps its claimed age', () => {
    const fresh = startGame(T0, 1);
    expect(checkSave(null, fresh, T0)).toEqual({ ok: true, state: fresh, clamped: [] });
    const old = startGame(T0 - 365 * 86_400_000, 1);
    old.coins = old.lifetimeCoins = 1e12;
    expect(checkSave(null, old, T0)).toMatchObject({ ok: true, clamped: ['coins'] });
  });

  it('accepts minigame rewards the server granted, and no more', () => {
    const { prev, next } = played();
    const big = { coins: 500_000, xp: 50_000 };
    apply(next, { type: 'reward', at: next.t, id: 1, ...big });
    expect(checkSave(prev, next, next.t, big)).toMatchObject({ ok: true, clamped: [] });
    const v = checkSave(prev, next, next.t, { coins: 100, xp: 10 });
    expect(v.ok && v.clamped).toEqual(expect.arrayContaining(['rewards', 'coins', 'xp']));
  });

  it('reads v1 saves from before the reward ledger', () => {
    const v1 = json(startGame(T0, 3)) as Record<string, unknown> & { stats: Record<string, unknown> };
    v1.v = 1;
    delete v1.lastRewardId;
    delete v1.stats.rewardCoins;
    delete v1.stats.rewardXp;
    expect(parseSave(v1)).toMatchObject({ v: 2, lastRewardId: 0, stats: { rewardCoins: 0, rewardXp: 0 } });
  });

  it('assetSpend matches what the engine charged', () => {
    const { next } = played();
    expect(assetSpend(next)).toBeLessThanOrEqual(next.lifetimeCoins - next.coins + 1e-6);
    expect(assetSpend(next)).toBeGreaterThan(0);
  });
});
