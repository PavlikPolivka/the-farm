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
}

export const TUTORIAL_STEPS = ['tap', 'plant', 'harvest', 'sell', 'buy', 'order'] as const;
export type TutorialStep = (typeof TUTORIAL_STEPS)[number];
export const TUTORIAL_DONE = TUTORIAL_STEPS.length;

/** The whole single-player save. Plain JSON: no classes, no Dates. */
export interface FarmState {
  v: 3;
  /** Simulation clock, ms since epoch. */
  t: number;
  createdAt: number;
  rng: number;
  coins: number;
  lifetimeCoins: number;
  /** Coins earned since the last prestige (M5). */
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
    /** Flowers received: free gifts worth nothing, kept for fun (and M5's collections). */
    flowers: number;
  };
}

const zero = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

export function newGame(now: number, seed: number): FarmState {
  const s: FarmState = {
    v: 3,
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
    stats: { taps: 0, harvested: zero(CROP_IDS), produced: zero(GOOD_IDS), ordersDone: 0, rewardCoins: 0, rewardXp: 0, giftValueIn: 0, giftValueOut: 0, flowers: 0 },
  };
  return s;
}

export function emptyField(): Field {
  return { crop: null, plantedAt: 0, auto: false, autoCrop: 'wheat' };
}

/** Upgrades older saves to the current shape. Unknown future versions are rejected. */
export function migrate(raw: unknown): FarmState {
  const s = raw as Omit<FarmState, 'v'> & { v: number };
  if (!s || typeof s !== 'object' || ![1, 2, 3].includes(s.v)) throw new Error('unsupported save version');
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
  return s as FarmState;
}

export const clone = (s: FarmState): FarmState => JSON.parse(JSON.stringify(s)) as FarmState;
