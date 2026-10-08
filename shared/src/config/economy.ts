/**
 * Farm economy as data. Tune here; `pnpm balance` prints the effect on time-to-milestone.
 * Times are in seconds, prices in coins.
 */

export const CROP_IDS = ['wheat', 'carrot', 'corn', 'tomato', 'cabbage'] as const;
export const ANIMAL_IDS = ['chicken', 'sheep', 'cow', 'bees'] as const;
export const GOOD_IDS = ['egg', 'wool', 'milk', 'honey'] as const;
export const HELPER_IDS = ['farmhand', 'sprinkler', 'scarecrow', 'mill'] as const;

export type CropId = (typeof CROP_IDS)[number];
export type AnimalId = (typeof ANIMAL_IDS)[number];
export type GoodId = (typeof GOOD_IDS)[number];
export type ItemId = CropId | GoodId;
export type HelperId = (typeof HELPER_IDS)[number];

export interface CropDef {
  growSec: number;
  seedCost: number;
  sellPrice: number;
  xp: number;
  unlockLevel: number;
}

export const CROPS: Record<CropId, CropDef> = {
  wheat: { growSec: 6, seedCost: 0, sellPrice: 2, xp: 1, unlockLevel: 1 },
  carrot: { growSec: 20, seedCost: 4, sellPrice: 11, xp: 3, unlockLevel: 2 },
  corn: { growSec: 60, seedCost: 20, sellPrice: 50, xp: 7, unlockLevel: 4 },
  tomato: { growSec: 180, seedCost: 80, sellPrice: 200, xp: 18, unlockLevel: 6 },
  cabbage: { growSec: 600, seedCost: 300, sellPrice: 800, xp: 50, unlockLevel: 9 },
};

export interface AnimalDef {
  good: GoodId;
  /** Crop eaten per product, taken automatically from the barn. null = needs no feed. */
  feed: CropId | null;
  feedPer: number;
  periodSec: number;
  baseCost: number;
  costGrowth: number;
  unlockLevel: number;
}

export const ANIMALS: Record<AnimalId, AnimalDef> = {
  chicken: { good: 'egg', feed: 'wheat', feedPer: 1, periodSec: 15, baseCost: 50, costGrowth: 1.3, unlockLevel: 2 },
  sheep: { good: 'wool', feed: 'carrot', feedPer: 1, periodSec: 40, baseCost: 250, costGrowth: 1.3, unlockLevel: 3 },
  cow: { good: 'milk', feed: 'corn', feedPer: 1, periodSec: 90, baseCost: 1200, costGrowth: 1.3, unlockLevel: 5 },
  bees: { good: 'honey', feed: null, feedPer: 0, periodSec: 120, baseCost: 6000, costGrowth: 1.35, unlockLevel: 8 },
};

export const GOODS: Record<GoodId, { sellPrice: number }> = {
  egg: { sellPrice: 7 },
  wool: { sellPrice: 30 },
  milk: { sellPrice: 140 },
  honey: { sellPrice: 600 },
};

export interface HelperDef {
  baseCost: number;
  costGrowth: number;
  unlockLevel: number;
  maxLevel: number;
}

/**
 * farmhand: each one plants and harvests one field automatically (max = number of fields).
 * sprinkler: crops grow `SPRINKLER_SPEED` faster per level.
 * scarecrow: `SCARECROW_YIELD` extra crop per harvest per level (fractions carry over).
 * mill: sells surplus automatically, and every level adds `MILL_PRICE` to all sale prices.
 */
export const HELPERS: Record<HelperId, HelperDef> = {
  farmhand: { baseCost: 300, costGrowth: 1.55, unlockLevel: 1, maxLevel: 32 },
  sprinkler: { baseCost: 400, costGrowth: 2.2, unlockLevel: 3, maxLevel: 10 },
  scarecrow: { baseCost: 900, costGrowth: 2.4, unlockLevel: 4, maxLevel: 10 },
  mill: { baseCost: 1500, costGrowth: 2.6, unlockLevel: 5, maxLevel: 10 },
};

export const ECONOMY = {
  startFields: 2,
  fieldsPerLand: 4,
  maxLand: 8,
  field: { baseCost: 12, costGrowth: 1.6 },
  /** Land tile n (2..8) costs base * growth^(n-2) and needs level (n-1) * levelPerTile. */
  land: { baseCost: 500, costGrowth: 4.5, levelPerTile: 3 },
  /** Tap power is (level + 1)^powerExp; costs grow faster, so tapping stays a bonus, not the engine. */
  tap: { costBase: 10, costGrowth: 2.5, powerExp: 1.5 },
  combo: { windowMs: 1500, step: 0.1, max: 2 },
  /** Share of the sell price paid as coins when a crop is harvested by hand (x combo). */
  harvestCoinShare: 0.25,
  /**
   * XP comes only from active play (hand harvests, orders, later minigames), never from idle
   * production, so levels track how much someone plays. Level L+1 needs `growth`x the XP of L.
   */
  level: { base: 15, growth: 1.35 },
  offlineCapHours: 24,
  orders: { slots: 3, baseValue: 25, valueGrowth: 1.3, rewardMult: 1.6, xpBase: 5, xpGrowth: 1.3 },
  sprinklerSpeed: 0.2,
  scarecrowYield: 0.25,
  millPrice: 0.1,
  /** The mill keeps this many of each item (plus what orders and animals need). */
  millReserve: 20,
  tickMs: 1000,
} as const;
