import {
  ANIMAL_IDS,
  CROP_IDS,
  ECONOMY,
  GOOD_IDS,
  type AnimalId,
  type CropId,
  type GoodId,
  type HelperId,
  type ItemId,
} from '../config/economy.js';
import { BREEDS, PERK_IDS, type PerkId, type SkinSlot } from '../config/progress.js';
import { levelOf } from './rules.js';
import { GAME_IDS, type GameId } from '../games/engine.js';

export interface Field {
  /** Crop growing now, or null when empty. */
  crop: CropId | null;
  plantedAt: number;
  /** Worked by a farmhand: replanted and harvested automatically. */
  auto: boolean;
  /** What the farmhand plants here. */
  autoCrop: CropId;
}

export interface OrderLine {
  item: ItemId;
  qty: number;
}

export interface Order {
  id: number;
  lines: OrderLine[];
  coins: number;
  xp: number;
  /** A collectible that comes with the order (decoration or rare animal id), if any. */
  drop?: string;
}

export const TUTORIAL_STEPS = ['tap', 'plant', 'harvest', 'sell', 'buy', 'order'] as const;
export type TutorialStep = (typeof TUTORIAL_STEPS)[number];
export const TUTORIAL_DONE = TUTORIAL_STEPS.length;

/** The whole single-player save. Plain JSON: no classes, no Dates. */
export interface FarmState {
  v: 4;
  /** Simulation clock, ms since epoch. */
  t: number;
  createdAt: number;
  rng: number;
  coins: number;
  lifetimeCoins: number;
  /** Coins earned since the last prestige. */
  runCoins: number;
  xp: number;
  tapLevel: number;
  land: number;
  fields: Field[];
  inv: Record<ItemId, number>;
  animals: Record<AnimalId, { count: number; progressMs: number }>;
  helpers: Record<Exclude<HelperId, 'farmhand'>, number>;
  /** Fractional scarecrow bonus waiting to become a whole crop. */
  yieldCarry: number;
  orders: Order[];
  nextOrderId: number;
  combo: { n: number; lastAt: number };
  lastCrop: CropId;
  tutorial: number;
  /** Id of the last minigame reward applied, so a reward is never applied twice. */
  lastRewardId: number;
  /** Id of the last prize (daily crown, weekly trophy) claimed. */
  lastPrizeId: number;
  /** Golden Seeds not spent on perks yet. */
  seeds: number;
  /** Times moved to new land, and Golden Seeds earned over all of them. */
  prestige: { level: number; seedsEarned: number };
  perks: Record<PerkId, number>;
  /** The Collection Book: animal breeds and decorations found. Kept across prestige. */
  found: { animals: string[]; decor: string[] };
  /** Building skin in use per building; null = the original look. */
  skins: Record<SkinSlot, string | null>;
  /** Weeks (Monday keys) this player won the weekly board: the trophy cabinet. */
  trophies: string[];
  /** Lifetime counters; kept across prestige. Achievements are computed from these. */
  stats: {
    taps: number;
    harvested: Record<CropId, number>;
    produced: Record<GoodId, number>;
    ordersDone: number;
    /** Minigame rewards received in total; the server checks them against what it granted. */
    rewardCoins: number;
    rewardXp: number;
    /** Gifts claimed and sent, valued at base sell price; the server checks the claimed side. */
    giftValueIn: number;
    giftValueOut: number;
    /** Flowers received: free gifts worth nothing, kept for fun (and achievements). */
    flowers: number;
    giftsSent: number;
    /** Rewarded minigame plays, in total and per game. */
    games: number;
    plays: Record<GameId, number>;
    /** Daily challenges won. */
    crowns: number;
    /** Best level, field count and farmhand count reached in any run. */
    bestLevel: number;
    bestFields: number;
    bestFarmhands: number;
  };
}

const zero = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

export function newGame(now: number, seed: number): FarmState {
  const s: FarmState = {
    v: 4,
    t: now,
    createdAt: now,
    rng: seed | 0,
    coins: 0,
    lifetimeCoins: 0,
    runCoins: 0,
    xp: 0,
    tapLevel: 0,
    land: 1,
    fields: Array.from({ length: ECONOMY.startFields }, () => emptyField()),
    inv: zero<ItemId>([...CROP_IDS, ...GOOD_IDS]),
    animals: Object.fromEntries(ANIMAL_IDS.map((a) => [a, { count: 0, progressMs: 0 }])) as FarmState['animals'],
    helpers: { sprinkler: 0, scarecrow: 0, mill: 0 },
    yieldCarry: 0,
    orders: [],
    nextOrderId: 1,
    combo: { n: 0, lastAt: 0 },
    lastCrop: 'wheat',
    tutorial: 0,
    lastRewardId: 0,
    lastPrizeId: 0,
    seeds: 0,
    prestige: { level: 0, seedsEarned: 0 },
    perks: zero(PERK_IDS),
    found: { animals: [], decor: [] },
    skins: { barn: null, windmill: null, fence: null },
    trophies: [],
    stats: {
      taps: 0,
      harvested: zero(CROP_IDS),
      produced: zero(GOOD_IDS),
      ordersDone: 0,
      rewardCoins: 0,
      rewardXp: 0,
      giftValueIn: 0,
      giftValueOut: 0,
      flowers: 0,
      giftsSent: 0,
      games: 0,
      plays: zero(GAME_IDS),
      crowns: 0,
      bestLevel: 1,
      bestFields: ECONOMY.startFields,
      bestFarmhands: 0,
    },
  };
  return s;
}

export function emptyField(): Field {
  return { crop: null, plantedAt: 0, auto: false, autoCrop: 'wheat' };
}

/** Upgrades older saves to the current shape. Unknown future versions are rejected. */
export function migrate(raw: unknown): FarmState {
  const s = raw as Omit<FarmState, 'v'> & { v: number };
  if (!s || typeof s !== 'object' || ![1, 2, 3, 4].includes(s.v)) throw new Error('unsupported save version');
  if (s.v === 1) {
    // v2 (M3): minigame reward ledger.
    s.v = 2;
    s.lastRewardId = 0;
    s.stats.rewardCoins = 0;
    s.stats.rewardXp = 0;
  }
  if (s.v === 2) {
    // v3 (M4): gifts.
    s.v = 3;
    s.stats.giftValueIn = 0;
    s.stats.giftValueOut = 0;
    s.stats.flowers = 0;
  }
  if (s.v === 3) {
    // v4 (M5): prestige, perks, collections, achievements.
    s.v = 4;
    upgradeV4(s as FarmState);
  }
  return s as FarmState;
}

/** Fills the v4 fields from what a v3 farm already has. */
function upgradeV4(s: FarmState): void {
  s.lastPrizeId = 0;
  s.seeds = 0;
  s.prestige = { level: 0, seedsEarned: 0 };
  s.perks = zero(PERK_IDS);
  // Breeds the farm already qualifies for.
  s.found = { animals: BREEDS.filter((b) => b.count !== null && s.animals[b.animal].count >= b.count).map((b) => b.id), decor: [] };
  s.skins = { barn: null, windmill: null, fence: null };
  s.trophies = [];
  s.stats.giftsSent = 0;
  s.stats.games = 0;
  s.stats.plays = zero(GAME_IDS);
  s.stats.crowns = 0;
  s.stats.bestLevel = levelOf(s.xp);
  s.stats.bestFields = s.fields.length;
  s.stats.bestFarmhands = s.fields.filter((f) => f.auto).length;
}

export const clone = (s: FarmState): FarmState => JSON.parse(JSON.stringify(s)) as FarmState;
