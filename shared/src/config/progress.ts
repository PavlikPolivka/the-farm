/**
 * Prestige, perks and collections as data (docs/DESIGN.md, "Progression, prestige and
 * collections"). Tune here; `pnpm balance` prints the effect on time-to-prestige.
 */
import type { AnimalId } from './economy.js';
import type { GameId } from '../games/engine.js';

export const PRESTIGE = {
  /** Golden Seeds for a run: floor(sqrt(coins earned this run / coinsPerSeed)). */
  coinsPerSeed: 1_000_000,
  /** The first move needs a run worth this many seeds; each later move `needGrowth`x more. */
  minSeeds: 15,
  needGrowth: 1.1,
  /** Every Golden Seed ever earned adds this much to all production (spent ones too). */
  seedBonus: 0.02,
} as const;

export const PERK_IDS = ['soil', 'arms', 'night', 'friend', 'market', 'clover'] as const;
export type PerkId = (typeof PERK_IDS)[number];

/**
 * Bought with Golden Seeds; `costs[n]` is the price of level n + 1.
 * soil: production +`soil` per level. arms: tap power +`arms` per level. night: offline
 * progress up to `nightHours`. friend: each level starts a run with one more farmhand.
 * market: a 4th order slot. clover: rare drops +`clover` per level.
 */
export const PERKS: Record<PerkId, { costs: readonly number[] }> = {
  soil: { costs: [2, 3, 4, 5, 6, 8, 10, 12, 15, 20] },
  arms: { costs: [1, 2, 3, 4, 5] },
  night: { costs: [4] },
  friend: { costs: [3, 6] },
  market: { costs: [5] },
  clover: { costs: [2, 4, 6] },
};

export const PERK_EFFECT = { soil: 0.1, arms: 0.5, nightHours: 48, clover: 0.5 } as const;

// ---------------------------------------------------------------- collections

export interface BreedDef {
  id: string;
  animal: AnimalId;
  /** Common breeds join the book when the farm owns this many of the animal; rare ones drop. */
  count: number | null;
}

/** 24 animals: 18 common breeds (bought) and 6 rare ones (minigames, orders, daily wins). */
export const BREEDS: readonly BreedDef[] = [
  { id: 'hen-white', animal: 'chicken', count: 1 },
  { id: 'hen-brown', animal: 'chicken', count: 3 },
  { id: 'hen-black', animal: 'chicken', count: 6 },
  { id: 'hen-speckled', animal: 'chicken', count: 10 },
  { id: 'rooster', animal: 'chicken', count: 15 },
  { id: 'sheep-white', animal: 'sheep', count: 1 },
  { id: 'sheep-cream', animal: 'sheep', count: 3 },
  { id: 'sheep-grey', animal: 'sheep', count: 6 },
  { id: 'sheep-brown', animal: 'sheep', count: 10 },
  { id: 'ram', animal: 'sheep', count: 15 },
  { id: 'cow-spotted', animal: 'cow', count: 1 },
  { id: 'cow-brown', animal: 'cow', count: 3 },
  { id: 'cow-black', animal: 'cow', count: 6 },
  { id: 'cow-red', animal: 'cow', count: 10 },
  { id: 'bees-honey', animal: 'bees', count: 1 },
  { id: 'bees-meadow', animal: 'bees', count: 2 },
  { id: 'bees-forest', animal: 'bees', count: 4 },
  { id: 'bees-mountain', animal: 'bees', count: 6 },
  { id: 'hen-golden', animal: 'chicken', count: null },
  { id: 'sheep-black', animal: 'sheep', count: null },
  { id: 'cow-highland', animal: 'cow', count: null },
  { id: 'bees-royal', animal: 'bees', count: null },
  { id: 'piglet', animal: 'cow', count: null },
  { id: 'bunny', animal: 'chicken', count: null },
];
export const BREED_IDS = BREEDS.map((b) => b.id);
export const RARE_BREEDS = BREEDS.filter((b) => b.count === null).map((b) => b.id);

export type DecorPool = 'garden' | 'village' | 'fair' | 'cup';

/** 40 decorations. garden: rare harvest drops; village: orders; fair: minigames; cup: weekly wins. */
export const DECOR: readonly { id: string; pool: DecorPool; trophies?: number }[] = [
  ...['sunflower', 'mushrooms', 'berry-bush', 'pine', 'apple-tree', 'orange-pine', 'sapling', 'boulder', 'pot-red', 'pot-yellow', 'pot-blue', 'gnome-red', 'gnome-blue', 'birdbath'].map(
    (id) => ({ id, pool: 'garden' as const }),
  ),
  ...['barrel', 'watering-can', 'hay-bale', 'crate', 'sack', 'bucket', 'target', 'wheelbarrow', 'logs', 'lantern', 'bench', 'mailbox', 'birdhouse', 'bunting'].map(
    (id) => ({ id, pool: 'village' as const }),
  ),
  ...['balloon-red', 'balloon-blue', 'pinwheel-red', 'pinwheel-blue', 'kite-red', 'kite-blue', 'flag-red', 'flag-blue'].map((id) => ({ id, pool: 'fair' as const })),
  { id: 'cup-bronze', pool: 'cup', trophies: 1 },
  { id: 'cup-silver', pool: 'cup', trophies: 3 },
  { id: 'cup-gold', pool: 'cup', trophies: 6 },
  { id: 'cup-diamond', pool: 'cup', trophies: 10 },
];
export const DECOR_IDS = DECOR.map((d) => d.id);
export const decorPool = (pool: DecorPool) => DECOR.filter((d) => d.pool === pool).map((d) => d.id);

/** Chances per event, before the clover perk. */
export const DROPS = {
  /** Per hand harvest: a garden decoration. */
  harvest: 0.001,
  /** Per new order: it also pays a village decoration or a rare animal. */
  order: 0.03,
  /** Per rewarded minigame play: a fair decoration or a rare animal. */
  minigame: 0.25,
} as const;

/** Every decoration found adds this much to production; every animal breed `breedBonus`. */
export const COLLECTION_BONUS = { decor: 0.005, breed: 0.01 } as const;

// ---------------------------------------------------------------- achievements and skins

export const ACHIEVEMENT_IDS = [
  'harvest', 'taps', 'orders', 'eggs', 'wool', 'milk', 'honey', 'level', 'coins', 'fields',
  'farmhands', 'games', 'crowns', 'trophies', 'gifts', 'flowers', 'prestige', 'seeds', 'decor', 'breeds',
] as const;
export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

/** Bronze, silver and gold thresholds: 20 x 3 = 60 achievements. */
export const ACHIEVEMENTS: Record<AchievementId, readonly [number, number, number]> = {
  harvest: [100, 1_000, 10_000],
  taps: [100, 1_000, 10_000],
  orders: [10, 50, 250],
  eggs: [50, 500, 5_000],
  wool: [20, 200, 2_000],
  milk: [10, 100, 1_000],
  honey: [5, 50, 500],
  level: [5, 10, 15],
  coins: [10_000, 1_000_000, 100_000_000],
  fields: [8, 16, 32],
  farmhands: [1, 8, 24],
  games: [5, 50, 250],
  crowns: [1, 5, 20],
  trophies: [1, 3, 10],
  gifts: [1, 10, 50],
  flowers: [1, 10, 50],
  prestige: [1, 3, 10],
  seeds: [10, 50, 200],
  decor: [5, 20, 40],
  breeds: [5, 12, 24],
};

export const SKIN_SLOTS = ['barn', 'windmill', 'fence'] as const;
export type SkinSlot = (typeof SKIN_SLOTS)[number];

export type SkinUnlock = { achievement: AchievementId; tier: 1 | 2 | 3 } | { game: GameId; plays: number };

/** 15 building skins: barns and windmills from achievements, fences from minigame milestones. */
export const SKINS: readonly { id: string; slot: SkinSlot; unlock: SkinUnlock }[] = [
  { id: 'barn-blue', slot: 'barn', unlock: { achievement: 'orders', tier: 1 } },
  { id: 'barn-green', slot: 'barn', unlock: { achievement: 'harvest', tier: 2 } },
  { id: 'barn-yellow', slot: 'barn', unlock: { achievement: 'coins', tier: 2 } },
  { id: 'barn-stone', slot: 'barn', unlock: { achievement: 'prestige', tier: 1 } },
  { id: 'barn-wood', slot: 'barn', unlock: { achievement: 'orders', tier: 3 } },
  { id: 'windmill-blue', slot: 'windmill', unlock: { achievement: 'taps', tier: 1 } },
  { id: 'windmill-green', slot: 'windmill', unlock: { achievement: 'taps', tier: 2 } },
  { id: 'windmill-yellow', slot: 'windmill', unlock: { achievement: 'taps', tier: 3 } },
  { id: 'windmill-stone', slot: 'windmill', unlock: { achievement: 'level', tier: 2 } },
  { id: 'windmill-brown', slot: 'windmill', unlock: { achievement: 'farmhands', tier: 2 } },
  { id: 'fence-white', slot: 'fence', unlock: { game: 'pexeso', plays: 10 } },
  { id: 'fence-blue', slot: 'fence', unlock: { game: 'pipes', plays: 10 } },
  { id: 'fence-green', slot: 'fence', unlock: { game: 'merge', plays: 10 } },
  { id: 'fence-red', slot: 'fence', unlock: { game: 'rush', plays: 10 } },
  { id: 'fence-yellow', slot: 'fence', unlock: { game: 'eggs', plays: 10 } },
];
export const SKIN_IDS = SKINS.map((s) => s.id);
