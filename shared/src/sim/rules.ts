/** Pure derived values: costs, levels, timings. No mutation here. */
import {
  ANIMALS,
  ANIMAL_IDS,
  CROPS,
  CROP_IDS,
  ECONOMY,
  GOODS,
  HELPERS,
  type AnimalId,
  type CropId,
  type HelperId,
  type ItemId,
} from '../config/economy.js';
import type { Field, FarmState } from './state.js';

export const isCrop = (item: ItemId): item is CropId => item in CROPS;

/** Total XP needed to reach `level` (geometric series). */
export const xpForLevel = (level: number) =>
  Math.floor((ECONOMY.level.base * (Math.pow(ECONOMY.level.growth, level - 1) - 1)) / (ECONOMY.level.growth - 1));

export function levelOf(xp: number): number {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  return level;
}

export const level = (s: FarmState) => levelOf(s.xp);

export const growMs = (s: FarmState, crop: CropId) =>
  (CROPS[crop].growSec * 1000) / (1 + ECONOMY.sprinklerSpeed * s.helpers.sprinkler);

export const isRipe = (s: FarmState, f: Field, at = s.t) => f.crop !== null && at >= f.plantedAt + growMs(s, f.crop);

/** 0..1 growth progress, for the sprite stage. */
export function growth(s: FarmState, f: Field, at = s.t): number {
  if (!f.crop) return 0;
  return Math.min(1, Math.max(0, (at - f.plantedAt) / growMs(s, f.crop)));
}

export const sellPrice = (s: FarmState, item: ItemId) =>
  (isCrop(item) ? CROPS[item].sellPrice : GOODS[item].sellPrice) * (1 + ECONOMY.millPrice * s.helpers.mill);

export const tapPower = (s: FarmState) => Math.round(Math.pow(s.tapLevel + 1, ECONOMY.tap.powerExp));
export const tapCost = (s: FarmState) => Math.round(ECONOMY.tap.costBase * Math.pow(ECONOMY.tap.costGrowth, s.tapLevel));

export const maxFields = (s: FarmState) => s.land * ECONOMY.fieldsPerLand;
export const fieldCost = (s: FarmState) =>
  Math.round(ECONOMY.field.baseCost * Math.pow(ECONOMY.field.costGrowth, s.fields.length - ECONOMY.startFields));

/** Level needed to buy the next land tile, or null at the cap. */
export const landLevel = (s: FarmState) => (s.land >= ECONOMY.maxLand ? null : s.land * ECONOMY.land.levelPerTile);
export const landCost = (s: FarmState) => Math.round(ECONOMY.land.baseCost * Math.pow(ECONOMY.land.costGrowth, s.land - 1));

export const animalCost = (s: FarmState, a: AnimalId) =>
  Math.round(ANIMALS[a].baseCost * Math.pow(ANIMALS[a].costGrowth, s.animals[a].count));

export const farmhands = (s: FarmState) => s.fields.filter((f) => f.auto).length;
export const helperLevel = (s: FarmState, h: HelperId) => (h === 'farmhand' ? farmhands(s) : s.helpers[h]);
export const helperCost = (s: FarmState, h: HelperId) =>
  Math.round(HELPERS[h].baseCost * Math.pow(HELPERS[h].costGrowth, helperLevel(s, h)));
export const helperMax = (s: FarmState, h: HelperId) => (h === 'farmhand' ? s.fields.length : HELPERS[h].maxLevel);

export const comboMult = (n: number) => Math.min(ECONOMY.combo.max, 1 + ECONOMY.combo.step * n);

export const unlockedCrops = (s: FarmState) => CROP_IDS.filter((c) => CROPS[c].unlockLevel <= level(s));
export const unlockedAnimals = (s: FarmState) => ANIMAL_IDS.filter((a) => ANIMALS[a].unlockLevel <= level(s));

/** Everything a level unlocks, for the level-up toast. */
export function unlocksAt(lvl: number): string[] {
  const out: string[] = [];
  for (const c of CROP_IDS) if (CROPS[c].unlockLevel === lvl) out.push(`crop:${c}`);
  for (const a of ANIMAL_IDS) if (ANIMALS[a].unlockLevel === lvl) out.push(`animal:${a}`);
  for (const [h, d] of Object.entries(HELPERS)) if (d.unlockLevel === lvl && lvl > 1) out.push(`helper:${h}`);
  for (let n = 2; n <= ECONOMY.maxLand; n++) if ((n - 1) * ECONOMY.land.levelPerTile === lvl) out.push('land');
  return out;
}

/** Coins per second the farm makes at base prices with every field on its best crop. */
export function incomeRate(s: FarmState): number {
  const crops = unlockedCrops(s);
  const field = Math.max(...crops.map((c) => CROPS[c].sellPrice / (growMs(s, c) / 1000)));
  let rate = field * s.fields.length;
  for (const a of ANIMAL_IDS) rate += (s.animals[a].count * GOODS[ANIMALS[a].good].sellPrice) / ANIMALS[a].periodSec;
  return rate;
}

/**
 * Coins and XP for a minigame result. A par score pays about a minute and a half of farm
 * income (at least 30 coins) and twice the XP of an order; better scores pay up to 1.5x,
 * and any play pays at least a tenth of that.
 */
export function minigameReward(s: FarmState, score: number, par: number, mult = 1): { coins: number; xp: number } {
  // Trying always earns a little, so a rough game still feels worth it for the kid.
  const q = Math.max(0.1, Math.min(1.5, score / par)) * mult;
  const lvl = level(s);
  return {
    coins: Math.round(q * Math.max(30, 90 * incomeRate(s))),
    xp: Math.round(q * 2 * ECONOMY.orders.xpBase * Math.pow(ECONOMY.orders.xpGrowth, lvl - 1)),
  };
}

/** Items the open orders still need, so the mill doesn't sell them. */
export function orderNeeds(s: FarmState, item: ItemId): number {
  let n = 0;
  for (const o of s.orders) for (const l of o.lines) if (l.item === item) n += l.qty;
  return n;
}

/** Feed the animals need for the next few cycles, so the mill doesn't sell it. */
export function feedNeeds(s: FarmState, crop: CropId): number {
  let n = 0;
  for (const a of ANIMAL_IDS) if (ANIMALS[a].feed === crop) n += s.animals[a].count * ANIMALS[a].feedPer * 4;
  return n;
}

/** Earliest moment a manually planted field becomes ripe, if all of them are planted (for push in M4). */
export function allManualRipeAt(s: FarmState): number | null {
  const manual = s.fields.filter((f) => !f.auto);
  if (!manual.length || manual.some((f) => !f.crop)) return null;
  return Math.max(...manual.map((f) => f.plantedAt + growMs(s, f.crop!)));
}
