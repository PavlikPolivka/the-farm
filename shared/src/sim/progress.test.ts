import { describe, expect, it } from 'vitest';
import { PRESTIGE } from '../config/progress.js';
import { apply, startGame, type SimEvent } from './engine.js';
import {
  achievementTier,
  canPrestige,
  collectionPct,
  medals,
  perkSpend,
  prestigeNeed,
  seedsFor,
  skinSprite,
  unlockedSkins,
} from './progress.js';
import { growMs, orderSlots, tapPower } from './rules.js';
import { migrate, type FarmState } from './state.js';

const T0 = Date.UTC(2026, 0, 5);
const found = (events: SimEvent[]) => events.flatMap((e) => (e.type === 'found' ? [e.id] : []));

/** A farm with a run worth `seeds` Golden Seeds and some progress to lose. */
function rich(seeds = 15): FarmState {
  const s = startGame(T0, 1);
  s.runCoins = s.lifetimeCoins = PRESTIGE.coinsPerSeed * seeds * seeds;
  s.coins = 5000;
  s.xp = 5000;
  s.land = 3;
  s.tapLevel = 4;
  s.inv.wheat = 50;
  s.animals.chicken.count = 4;
  s.found.animals.push('hen-white');
  s.stats.taps = 1234;
  return s;
}

describe('prestige', () => {
  it('needs a run worth 15 seeds, then 10 % more each time', () => {
    const s = startGame(T0, 1);
    expect(seedsFor(224_999_999)).toBe(14);
    expect(seedsFor(225_000_000)).toBe(15);
    expect(prestigeNeed(s)).toBe(15);
    s.prestige.level = 3;
    expect(prestigeNeed(s)).toBe(20);
    expect(apply(s, { type: 'prestige', at: T0 }).ok).toBe(false);
  });

  it('trades the run for Golden Seeds and keeps the book, stats and trophies', () => {
    const s = rich(16);
    s.trophies.push('2026-01-05');
    expect(canPrestige(s)).toBe(true);
    const r = apply(s, { type: 'prestige', at: T0 + 1000 });
    expect(r.ok).toBe(true);
    expect(r.events).toContainEqual({ type: 'prestige', seeds: 16 });
    expect(s).toMatchObject({ coins: 0, runCoins: 0, xp: 0, land: 1, tapLevel: 0, seeds: 16, prestige: { level: 1, seedsEarned: 16 } });
    expect(s.fields).toHaveLength(2);
    expect(s.inv.wheat).toBe(0);
    expect(s.animals.chicken.count).toBe(0);
    expect(s.orders).toHaveLength(3);
    expect(s.lifetimeCoins).toBe(PRESTIGE.coinsPerSeed * 256);
    expect(s.found.animals).toEqual(['hen-white']);
    expect(s.stats.taps).toBe(1234);
    expect(s.trophies).toEqual(['2026-01-05']);
  });

  it('Golden Seeds and perks speed up the next run', () => {
    const s = rich();
    const slow = growMs(s, 'wheat');
    const tap = tapPower(s);
    apply(s, { type: 'prestige', at: T0 });
    expect(growMs(s, 'wheat')).toBeCloseTo(slow / (1 + 15 * PRESTIGE.seedBonus), 6);
    for (const perk of ['soil', 'arms', 'market', 'friend'] as const) expect(apply(s, { type: 'buyPerk', at: T0, perk }).ok).toBe(true);
    expect(s.seeds).toBe(15 - 2 - 1 - 5 - 3);
    expect(perkSpend(s.perks)).toBe(11);
    expect(tapPower({ ...s, tapLevel: 4 })).toBe(Math.round(tap * 1.5));
    expect(orderSlots(s)).toBe(4);
    expect(s.orders).toHaveLength(4);
    expect(apply(s, { type: 'buyPerk', at: T0, perk: 'night' })).toMatchObject({ ok: true });
    expect(apply(s, { type: 'buyPerk', at: T0, perk: 'night' }).events).toContainEqual({ type: 'fail', reason: 'max' });
    expect(apply(s, { type: 'buyPerk', at: T0, perk: 'soil' }).events).toContainEqual({ type: 'fail', reason: 'seeds' });
  });

  it('the old-friend perk brings farmhands to the new land', () => {
    const s = rich();
    s.perks.friend = 2;
    s.prestige.seedsEarned = 9;
    apply(s, { type: 'prestige', at: T0 });
    expect(s.fields.map((f) => [f.auto, f.crop])).toEqual([
      [true, 'wheat'],
      [true, 'wheat'],
    ]);
  });
});

describe('collections', () => {
  it('records common breeds as the herd grows', () => {
    const s = startGame(T0, 1);
    s.xp = 1e6;
    s.coins = 1e9;
    const got: string[] = [];
    for (let i = 0; i < 6; i++) got.push(...found(apply(s, { type: 'buyAnimal', at: T0, animal: 'chicken' }).events));
    expect(got).toEqual(['hen-white', 'hen-brown', 'hen-black']);
  });

  it('adds minigame drops and prizes once; weekly trophies fill the cups', () => {
    const s = startGame(T0, 1);
    expect(found(apply(s, { type: 'reward', at: T0, id: 1, coins: 1, xp: 1, game: 'rush', item: 'balloon-red' }).events)).toEqual(['balloon-red']);
    expect(found(apply(s, { type: 'reward', at: T0, id: 2, coins: 1, xp: 1, game: 'rush', item: 'balloon-red' }).events)).toEqual([]);
    expect(s.stats).toMatchObject({ games: 2, plays: { rush: 2 } });
    apply(s, { type: 'prize', at: T0, id: 1, prize: { kind: 'crown', day: '2026-01-05', item: 'piglet' } });
    expect(s.found.animals).toContain('piglet');
    expect(s.stats.crowns).toBe(1);
    expect(found(apply(s, { type: 'prize', at: T0, id: 2, prize: { kind: 'trophy', week: '2026-01-05' } }).events)).toEqual(['cup-bronze']);
    expect(apply(s, { type: 'prize', at: T0, id: 2, prize: { kind: 'trophy', week: '2026-01-12' } }).ok).toBe(false);
  });

  it('counts achievements in three tiers and unlocks skins with them', () => {
    const s = startGame(T0, 1);
    expect(medals(s)).toBe(0);
    s.stats.taps = 1000;
    expect(achievementTier(s, 'taps')).toBe(2);
    expect(medals(s)).toBe(2);
    expect(unlockedSkins(s)).toEqual(['windmill-blue', 'windmill-green']);
    expect(apply(s, { type: 'setSkin', at: T0, slot: 'windmill', skin: 'windmill-yellow' }).ok).toBe(false);
    expect(apply(s, { type: 'setSkin', at: T0, slot: 'barn', skin: 'windmill-blue' }).ok).toBe(false);
    expect(apply(s, { type: 'setSkin', at: T0, slot: 'windmill', skin: 'windmill-green' }).ok).toBe(true);
    expect(skinSprite(s, 'windmill')).toBe('windmill-green');
    s.stats.plays.eggs = 10;
    expect(unlockedSkins(s)).toContain('fence-yellow');
    // 2 medals + 3 skins of 139 entries.
    expect(collectionPct(s)).toBe(3.6);
  });

  it('upgrades v3 saves with the breeds they already own', () => {
    const s = startGame(T0, 1) as unknown as Record<string, unknown> & { animals: FarmState['animals']; stats: Record<string, unknown> };
    s.v = 3;
    s.animals.sheep.count = 3;
    s.xp = 100;
    for (const k of ['lastPrizeId', 'seeds', 'prestige', 'perks', 'found', 'skins', 'trophies']) delete s[k];
    const v4 = migrate(JSON.parse(JSON.stringify(s)));
    expect(v4.found.animals).toEqual(['sheep-white', 'sheep-cream']);
    expect(v4.stats.bestLevel).toBeGreaterThan(1);
  });
});
