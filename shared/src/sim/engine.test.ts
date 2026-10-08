import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../config/economy.js';
import { formatDuration, formatNumber } from '../format.js';
import { advance, apply, startGame, type Action } from './engine.js';
import { comboMult, fieldCost, growMs, levelOf, tapCost, xpForLevel } from './rules.js';
import { clone, migrate, type FarmState } from './state.js';

const T0 = Date.UTC(2026, 9, 8, 8, 0, 0);
const SEC = 1000;

/** A started game with coins and wheat already in the barn, for tests that need resources. */
function rich(coins = 1e6): FarmState {
  const s = startGame(T0, 42);
  s.coins = coins;
  s.xp = xpForLevel(10);
  return s;
}

function scripted(seed: number): FarmState {
  const s = startGame(T0, seed);
  const actions: Action[] = [];
  for (let i = 0; i < 30; i++) actions.push({ type: 'tap', at: T0 + i * 200 });
  actions.push({ type: 'plant', at: T0 + 7 * SEC, field: 0, crop: 'wheat' });
  actions.push({ type: 'plant', at: T0 + 7 * SEC, field: 1, crop: 'wheat' });
  actions.push({ type: 'buyField', at: T0 + 8 * SEC });
  actions.push({ type: 'harvest', at: T0 + 14 * SEC, field: 0 });
  actions.push({ type: 'harvest', at: T0 + 15 * SEC, field: 1 });
  actions.push({ type: 'buyHelper', at: T0 + 16 * SEC, helper: 'farmhand' });
  for (const a of actions) apply(s, a);
  advance(s, T0 + 3600 * SEC);
  return s;
}

describe('determinism', () => {
  it('gives identical state for identical seed and actions', () => {
    expect(scripted(7)).toEqual(scripted(7));
  });

  it('orders depend on the seed', () => {
    const a = startGame(T0, 1).orders.map((o) => o.lines);
    const b = startGame(T0, 2).orders.map((o) => o.lines);
    expect(startGame(T0, 1).orders).toEqual(startGame(T0, 1).orders);
    expect(a.length).toBe(ECONOMY.orders.slots);
    expect(b.length).toBe(ECONOMY.orders.slots);
  });

  it('does not depend on how often the clock is advanced', () => {
    const setup = () => {
      const s = rich();
      apply(s, { type: 'plant', at: T0, field: 0, crop: 'wheat' });
      apply(s, { type: 'buyHelper', at: T0, helper: 'farmhand' });
      apply(s, { type: 'buyAnimal', at: T0, animal: 'chicken' });
      apply(s, { type: 'buyHelper', at: T0, helper: 'mill' });
      return s;
    };
    const once = setup();
    advance(once, T0 + 2 * 3600 * SEC);
    const often = setup();
    for (let t = T0; t <= T0 + 2 * 3600 * SEC; t += 1000) advance(often, t);
    expect(often).toEqual(once);
  });

  it('survives a JSON save/load round trip mid-game', () => {
    const straight = scripted(3);
    advance(straight, straight.t + 600 * SEC);
    const saved = migrate(JSON.parse(JSON.stringify(scripted(3))));
    advance(saved, saved.t + 600 * SEC);
    expect(saved).toEqual(straight);
  });

  it('rejects unknown save versions', () => {
    expect(() => migrate({ v: 99 })).toThrow();
    expect(() => migrate(null)).toThrow();
  });
});

describe('tapping and buying', () => {
  it('taps pay tap power and upgrades raise it', () => {
    const s = startGame(T0, 1);
    for (let i = 0; i < 10; i++) apply(s, { type: 'tap', at: T0 + i * 100 });
    expect(s.coins).toBe(10);
    expect(tapCost(s)).toBe(10);
    expect(apply(s, { type: 'buyTap', at: T0 + SEC }).ok).toBe(true);
    apply(s, { type: 'tap', at: T0 + 2 * SEC });
    expect(s.coins).toBe(3); // (1 + 1)^1.5 rounded
  });

  it('refuses purchases it cannot afford and leaves the state alone', () => {
    const s = startGame(T0, 1);
    const before = clone(s);
    const r = apply(s, { type: 'buyField', at: T0 });
    expect(r.ok).toBe(false);
    expect(r.events).toContainEqual({ type: 'fail', reason: 'coins' });
    expect(s).toEqual(before);
  });

  it('caps fields at the land size and gates land on level', () => {
    const s = rich();
    s.xp = 0;
    while (apply(s, { type: 'buyField', at: T0 }).ok);
    expect(s.fields.length).toBe(ECONOMY.fieldsPerLand);
    expect(apply(s, { type: 'buyLand', at: T0 }).events).toContainEqual({ type: 'fail', reason: 'locked' });
    s.xp = xpForLevel(ECONOMY.land.levelPerTile);
    expect(apply(s, { type: 'buyLand', at: T0 }).ok).toBe(true);
    expect(fieldCost(s)).toBeGreaterThan(0);
  });

  it('locks crops below their level', () => {
    const s = startGame(T0, 1);
    s.coins = 1000;
    expect(apply(s, { type: 'plant', at: T0, field: 0, crop: 'cabbage' }).events).toContainEqual({ type: 'fail', reason: 'locked' });
  });
});

describe('harvesting', () => {
  it('only harvests ripe crops', () => {
    const s = startGame(T0, 1);
    apply(s, { type: 'plant', at: T0, field: 0, crop: 'wheat' });
    expect(apply(s, { type: 'harvest', at: T0 + 5 * SEC, field: 0 }).ok).toBe(false);
    expect(apply(s, { type: 'harvest', at: T0 + 6 * SEC, field: 0 }).ok).toBe(true);
    expect(s.inv.wheat).toBe(1);
    expect(s.fields[0]!.crop).toBeNull();
  });

  it('builds a combo for harvests within 1.5 s, capped at x2', () => {
    const s = rich();
    for (let i = 0; i < 16; i++) s.fields.push({ crop: 'wheat', plantedAt: T0, auto: false, autoCrop: 'wheat' });
    const mults: number[] = [];
    s.fields.forEach((_, i) => {
      if (i < 2) return;
      const r = apply(s, { type: 'harvest', at: T0 + 10 * SEC + i * 1000, field: i });
      const h = r.events.find((e) => e.type === 'harvest');
      if (h?.type === 'harvest') mults.push(h.combo);
    });
    expect(mults[0]).toBe(1);
    expect(mults[1]).toBeCloseTo(1.1);
    expect(Math.max(...mults)).toBe(2);
    expect(comboMult(100)).toBe(2);
    apply(s, { type: 'plant', at: T0 + 40 * SEC, field: 2, crop: 'wheat' });
    const late = apply(s, { type: 'harvest', at: T0 + 60 * SEC, field: 2 }).events.find((e) => e.type === 'harvest');
    expect(late?.type === 'harvest' && late.combo).toBe(1);
  });

  it('levels up from harvest XP', () => {
    const s = startGame(T0, 1);
    for (let i = 0; i < xpForLevel(2); i++) {
      apply(s, { type: 'plant', at: T0 + i * 10 * SEC, field: 0, crop: 'wheat' });
      const r = apply(s, { type: 'harvest', at: T0 + i * 10 * SEC + 6 * SEC, field: 0 });
      if (i === xpForLevel(2) - 1) expect(r.events.some((e) => e.type === 'levelUp' && e.level === 2)).toBe(true);
    }
    expect(levelOf(s.xp)).toBe(2);
  });
});

describe('idle production', () => {
  it('a farmhand replants and harvests on its own', () => {
    const s = rich();
    apply(s, { type: 'buyHelper', at: T0, helper: 'farmhand' });
    expect(s.fields[0]!.auto).toBe(true);
    advance(s, T0 + 60 * SEC);
    expect(s.inv.wheat).toBe(10);
  });

  it('sprinklers shorten growth', () => {
    const s = rich();
    const base = growMs(s, 'wheat');
    apply(s, { type: 'buyHelper', at: T0, helper: 'sprinkler' });
    expect(growMs(s, 'wheat')).toBeCloseTo(base / 1.2);
  });

  it('animals eat feed from the barn and stop when it runs out', () => {
    const s = rich();
    apply(s, { type: 'buyAnimal', at: T0, animal: 'chicken' });
    s.inv.wheat = 3;
    advance(s, T0 + 15 * SEC * 5);
    expect(s.inv.egg).toBe(3);
    expect(s.inv.wheat).toBe(0);
  });

  it('the mill sells surplus but keeps the reserve and what orders need', () => {
    const s = rich();
    apply(s, { type: 'buyHelper', at: T0, helper: 'mill' });
    s.orders = [{ id: 99, lines: [{ item: 'carrot', qty: 5 }], coins: 1, xp: 1 }];
    s.inv.wheat = 100;
    s.inv.carrot = 100;
    const before = s.coins;
    advance(s, T0 + SEC);
    expect(s.inv.wheat).toBe(ECONOMY.millReserve);
    expect(s.inv.carrot).toBe(ECONOMY.millReserve + 5);
    expect(s.coins).toBeGreaterThan(before);
  });

  it('caps offline production at 24 h but still moves the clock', () => {
    const run = (hours: number) => {
      const s = rich();
      apply(s, { type: 'buyHelper', at: T0, helper: 'farmhand' });
      advance(s, T0 + hours * 3600 * SEC);
      return s;
    };
    const day = run(24);
    const twoDays = run(48);
    expect(twoDays.inv.wheat).toBe(day.inv.wheat);
    expect(twoDays.t).toBe(T0 + 48 * 3600 * SEC);
    advance(twoDays, twoDays.t + 60 * SEC);
    expect(twoDays.inv.wheat).toBe(day.inv.wheat + 10);
  });

  it('ignores a clock that goes backwards', () => {
    const s = rich();
    advance(s, T0 + 10 * SEC);
    const before = clone(s);
    expect(advance(s, T0)).toEqual([]);
    expect(s).toEqual(before);
  });
});

describe('orders', () => {
  it('always keeps three open, pays on delivery and replaces the delivered one', () => {
    const s = startGame(T0, 5);
    const o = s.orders[0]!;
    expect(apply(s, { type: 'deliver', at: T0, order: o.id }).ok).toBe(false);
    for (const l of o.lines) s.inv[l.item] = l.qty;
    const coins = s.coins;
    const r = apply(s, { type: 'deliver', at: T0, order: o.id });
    expect(r.ok).toBe(true);
    expect(s.coins).toBe(coins + o.coins);
    expect(s.orders).toHaveLength(ECONOMY.orders.slots);
    expect(s.orders.map((x) => x.id)).not.toContain(o.id);
    for (const l of o.lines) expect(s.inv[l.item]).toBe(0);
  });

  it('only asks for things the player can make', () => {
    const s = startGame(T0, 9);
    for (const o of s.orders) for (const l of o.lines) expect(l.item).toBe('wheat');
  });
});

describe('formatting', () => {
  it('writes small numbers with locale separators', () => {
    expect(formatNumber(1234, 'en')).toBe('1,234');
    expect(formatNumber(1234, 'cs').replace(/\s/g, ' ')).toBe('1 234');
    expect(formatNumber(12.9, 'en')).toBe('12');
  });
  it('abbreviates large numbers with short-scale suffixes', () => {
    expect(formatNumber(12_345, 'en')).toBe('12.3K');
    expect(formatNumber(12_345, 'cs')).toBe('12,3K');
    expect(formatNumber(5_600_000_000, 'en')).toBe('5.6B');
    expect(formatNumber(999_999, 'en')).toBe('999K');
    expect(formatNumber(999_950, 'en')).toBe('999K');
  });
  it('formats durations', () => {
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(3725)).toBe('1:02:05');
  });
});
