/** Derived values for prestige, perks, achievements and the Collection Book. No mutation here. */
import { ECONOMY } from '../config/economy.js';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_IDS,
  BREEDS,
  BREED_IDS,
  DECOR,
  DECOR_IDS,
  PERKS,
  PERK_IDS,
  PRESTIGE,
  SKINS,
  SKIN_IDS,
  type AchievementId,
  type PerkId,
  type SkinSlot,
} from '../config/progress.js';
import { farmhands, level } from './rules.js';
import type { FarmState } from './state.js';

/** Golden Seeds a run worth `runCoins` gives. */
export const seedsFor = (runCoins: number) => Math.floor(Math.sqrt(Math.max(0, runCoins) / PRESTIGE.coinsPerSeed));

/** Seeds the current run must be worth before the farm can move to new land. */
export const prestigeNeed = (s: FarmState) => Math.ceil(PRESTIGE.minSeeds * Math.pow(PRESTIGE.needGrowth, s.prestige.level));

export const canPrestige = (s: FarmState) => seedsFor(s.runCoins) >= prestigeNeed(s);

/** Price of the next level of a perk, or null at the top. */
export const perkCost = (s: FarmState, p: PerkId): number | null => PERKS[p].costs[s.perks[p]] ?? null;

/** Seeds spent on everything bought so far. */
export const perkSpend = (perks: Record<PerkId, number>) =>
  PERK_IDS.reduce((sum, p) => sum + PERKS[p].costs.slice(0, perks[p]).reduce((a, b) => a + b, 0), 0);

// ---------------------------------------------------------------- achievements

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

/** The number each achievement counts. Everything here survives prestige. */
export function achievementValue(s: FarmState, id: AchievementId): number {
  const st = s.stats;
  switch (id) {
    case 'harvest': return sum(st.harvested);
    case 'taps': return st.taps;
    case 'orders': return st.ordersDone;
    case 'eggs': return st.produced.egg;
    case 'wool': return st.produced.wool;
    case 'milk': return st.produced.milk;
    case 'honey': return st.produced.honey;
    case 'level': return Math.max(st.bestLevel, level(s));
    case 'coins': return s.lifetimeCoins;
    case 'fields': return Math.max(st.bestFields, s.fields.length);
    case 'farmhands': return Math.max(st.bestFarmhands, farmhands(s));
    case 'games': return st.games;
    case 'crowns': return st.crowns;
    case 'trophies': return s.trophies.length;
    case 'gifts': return st.giftsSent;
    case 'flowers': return st.flowers;
    case 'prestige': return s.prestige.level;
    case 'seeds': return s.prestige.seedsEarned;
    case 'decor': return s.found.decor.length;
    case 'breeds': return s.found.animals.length;
  }
}

/** 0 = none yet, 1 = bronze, 2 = silver, 3 = gold. */
export function achievementTier(s: FarmState, id: AchievementId): 0 | 1 | 2 | 3 {
  const v = achievementValue(s, id);
  return ACHIEVEMENTS[id].filter((n) => v >= n).length as 0 | 1 | 2 | 3;
}

/** Achievements unlocked: every tier counts, so 60 at most. */
export const medals = (s: FarmState) => ACHIEVEMENT_IDS.reduce((n, id) => n + achievementTier(s, id), 0);

/** Medal counts by colour, for the profile badge. */
export function medalCounts(s: FarmState): { bronze: number; silver: number; gold: number } {
  const tiers = ACHIEVEMENT_IDS.map((id) => achievementTier(s, id));
  return { bronze: tiers.filter((t) => t >= 1).length, silver: tiers.filter((t) => t >= 2).length, gold: tiers.filter((t) => t >= 3).length };
}

// ---------------------------------------------------------------- skins and the book

export function skinUnlocked(s: FarmState, id: string): boolean {
  const skin = SKINS.find((k) => k.id === id);
  if (!skin) return false;
  const u = skin.unlock;
  return 'achievement' in u ? achievementTier(s, u.achievement) >= u.tier : s.stats.plays[u.game] >= u.plays;
}

export const unlockedSkins = (s: FarmState) => SKIN_IDS.filter((id) => skinUnlocked(s, id));

/** Sprite for a building: the skin in use, or the original. */
export function skinSprite(s: FarmState, slot: SkinSlot): string | null {
  const id = s.skins?.[slot];
  return id && skinUnlocked(s, id) ? id : null;
}

/** Items in the whole book: animals, decorations, skins and achievement tiers. */
export const COLLECTION_SIZE = BREED_IDS.length + DECOR_IDS.length + SKIN_IDS.length + ACHIEVEMENT_IDS.length * 3;

export const collectionCount = (s: FarmState) => s.found.animals.length + s.found.decor.length + unlockedSkins(s).length + medals(s);

/** 0–100, one decimal: the Collector board. */
export const collectionPct = (s: FarmState) => Math.round((collectionCount(s) / COLLECTION_SIZE) * 1000) / 10;

/** Common breeds the farm qualifies for but hasn't recorded yet. */
export const breedsDue = (s: FarmState) =>
  BREEDS.filter((b) => b.count !== null && s.animals[b.animal].count >= b.count && !s.found.animals.includes(b.id)).map((b) => b.id);

/** Cups the trophy count has earned but the book doesn't show yet. */
export const cupsDue = (s: FarmState) =>
  DECOR.filter((d) => d.trophies !== undefined && s.trophies.length >= d.trophies && !s.found.decor.includes(d.id)).map((d) => d.id);

export const isBreed = (id: string) => BREED_IDS.includes(id);
export const isDecor = (id: string) => DECOR_IDS.includes(id);
export const isFound = (s: FarmState, id: string) => s.found.animals.includes(id) || s.found.decor.includes(id);

export const startFarmhands = (s: FarmState) => Math.min(s.perks.friend, ECONOMY.startFields);
