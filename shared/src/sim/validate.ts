/**
 * Server-side checks for uploaded saves (docs/DESIGN.md, "Sync and validation").
 *
 * `parseSave` rebuilds a FarmState from untrusted JSON, keeping only known fields.
 * `checkSave` compares it with the last accepted save and clamps progress to what a very good
 * player could have made in the time between the two:
 *
 * - Wealth is lifetime coins plus the barn valued at `VALUE_MULT` x base price. Selling,
 *   orders and the mill never raise it (they pay at most that much), so only production does.
 *   Its growth is capped by the farm's production rate x elapsed time x `SLACK`, plus one
 *   harvest per field and one product per animal that may have been almost done already.
 * - Orders are capped by how many items the farm could make; XP by harvests and those orders.
 * - Everything owned (tap levels, fields, land, animals, helpers) must have been paid for out
 *   of lifetime coins. Prices grow exponentially, so a doctored upgrade can't pay for itself.
 *
 * The result is deterministic: same inputs, same verdict.
 */
import {
  ANIMALS,
  ANIMAL_IDS,
  CROPS,
  CROP_IDS,
  ECONOMY,
  GOODS,
  GOOD_IDS,
  HELPERS,
  type AnimalId,
  type CropId,
  type ItemId,
} from '../config/economy.js';
import { comboMult, growMs, isCrop, levelOf, tapPower, unlockedCrops } from './rules.js';
import { TUTORIAL_DONE, clone, newGame, type FarmState, type Field, type Order } from './state.js';

export const PLAUSIBLE = {
  tapsPerSec: 15,
  /** Headroom over a perfect player: legit play never gets near it (see validate.test.ts). */
  slack: 2,
  /** Covers selling at the best mill price (2x) and orders (1.6x). */
  valueMult: 2,
  clockSkewMs: 2 * 60_000,
  /** A farm's first upload may claim at most this much play time. */
  firstSyncMaxMs: 7 * 86_400_000,
  maxAnimals: 10_000,
  maxTapLevel: 200,
} as const;

export type Verdict =
  | { ok: true; state: FarmState; clamped: string[] }
  | { ok: false; reason: string };

// ---------------------------------------------------------------- parsing

class SaveError extends Error {}

const fail = (what: string): never => {
  throw new SaveError(`bad save: ${what}`);
};
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
function num(v: unknown, what: string, min = 0, max = Number.MAX_VALUE, int = false): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (int && !Number.isInteger(v))) fail(what);
  return v as number;
}
const int = (v: unknown, what: string, min = 0, max = Number.MAX_SAFE_INTEGER) => num(v, what, min, max, true);
function oneOf<T extends string>(v: unknown, list: readonly T[], what: string): T {
  if (!list.includes(v as T)) fail(what);
  return v as T;
}
function record<K extends string>(v: unknown, keys: readonly K[], what: string, max = Number.MAX_VALUE): Record<K, number> {
  if (!isObj(v)) fail(what);
  const o = v as Record<string, unknown>;
  return Object.fromEntries(keys.map((k) => [k, int(o[k], `${what}.${k}`, 0, max)])) as Record<K, number>;
}

const ITEM_IDS = [...CROP_IDS, ...GOOD_IDS] as const;

/** Validates and copies an uploaded save. Throws on anything malformed. */
export function parseSave(raw: unknown): FarmState {
  if (!isObj(raw)) fail('not an object');
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) fail('version');
  const land = int(r.land, 'land', 1, ECONOMY.maxLand);

  if (!Array.isArray(r.fields) || r.fields.length < 1 || r.fields.length > land * ECONOMY.fieldsPerLand) fail('fields');
  const fields: Field[] = (r.fields as unknown[]).map((f, i) => {
    if (!isObj(f)) fail(`fields[${i}]`);
    const ff = f as Record<string, unknown>;
    return {
      crop: ff.crop === null ? null : oneOf(ff.crop, CROP_IDS, `fields[${i}].crop`),
      plantedAt: num(ff.plantedAt, `fields[${i}].plantedAt`),
      auto: ff.auto === true,
      autoCrop: oneOf(ff.autoCrop, CROP_IDS, `fields[${i}].autoCrop`),
    };
  });

  if (!isObj(r.animals)) fail('animals');
  const animals = Object.fromEntries(
    ANIMAL_IDS.map((a) => {
      const herd = (r.animals as Record<string, unknown>)[a];
      if (!isObj(herd)) fail(`animals.${a}`);
      const hh = herd as Record<string, unknown>;
      return [
        a,
        {
          count: int(hh.count, `animals.${a}.count`, 0, PLAUSIBLE.maxAnimals),
          progressMs: num(hh.progressMs, `animals.${a}.progressMs`, 0, ANIMALS[a].periodSec * 1000),
        },
      ];
    }),
  ) as FarmState['animals'];

  if (!isObj(r.helpers)) fail('helpers');
  const hr = r.helpers as Record<string, unknown>;
  const helpers = {
    sprinkler: int(hr.sprinkler, 'helpers.sprinkler', 0, HELPERS.sprinkler.maxLevel),
    scarecrow: int(hr.scarecrow, 'helpers.scarecrow', 0, HELPERS.scarecrow.maxLevel),
    mill: int(hr.mill, 'helpers.mill', 0, HELPERS.mill.maxLevel),
  };

  if (!Array.isArray(r.orders) || r.orders.length > ECONOMY.orders.slots) fail('orders');
  const orders: Order[] = (r.orders as unknown[]).map((o, i) => {
    if (!isObj(o) || !Array.isArray(o.lines) || o.lines.length < 1 || o.lines.length > 2) fail(`orders[${i}]`);
    const oo = o as Record<string, unknown>;
    return {
      id: int(oo.id, `orders[${i}].id`),
      lines: (oo.lines as unknown[]).map((l, j) => {
        if (!isObj(l)) fail(`orders[${i}].lines[${j}]`);
        const ll = l as Record<string, unknown>;
        return { item: oneOf(ll.item, ITEM_IDS, `orders[${i}].item`), qty: int(ll.qty, `orders[${i}].qty`, 1, 999) };
      }),
      coins: num(oo.coins, `orders[${i}].coins`),
      xp: num(oo.xp, `orders[${i}].xp`),
    };
  });

  if (!isObj(r.combo) || !isObj(r.stats)) fail('combo/stats');
  const combo = r.combo as Record<string, unknown>;
  const stats = r.stats as Record<string, unknown>;

  return {
    v: 1,
    t: num(r.t, 't'),
    createdAt: num(r.createdAt, 'createdAt'),
    rng: int(r.rng, 'rng', -(2 ** 31), 2 ** 32),
    coins: num(r.coins, 'coins'),
    lifetimeCoins: num(r.lifetimeCoins, 'lifetimeCoins'),
    runCoins: num(r.runCoins, 'runCoins'),
    xp: num(r.xp, 'xp'),
    tapLevel: int(r.tapLevel, 'tapLevel', 0, PLAUSIBLE.maxTapLevel),
    land,
    fields,
    inv: record(r.inv, ITEM_IDS, 'inv'),
    animals,
    helpers,
    yieldCarry: num(r.yieldCarry, 'yieldCarry', 0, 1),
    orders,
    nextOrderId: int(r.nextOrderId, 'nextOrderId'),
    combo: { n: int(combo.n, 'combo.n'), lastAt: num(combo.lastAt, 'combo.lastAt') },
    lastCrop: oneOf(r.lastCrop, CROP_IDS, 'lastCrop'),
    tutorial: int(r.tutorial, 'tutorial', 0, TUTORIAL_DONE),
    stats: {
      taps: int(stats.taps, 'stats.taps'),
      harvested: record(stats.harvested, CROP_IDS, 'stats.harvested'),
      produced: record(stats.produced, GOOD_IDS, 'stats.produced'),
      ordersDone: int(stats.ordersDone, 'stats.ordersDone'),
    },
  };
}

export const isSaveError = (err: unknown): err is Error => err instanceof SaveError;

// ---------------------------------------------------------------- economics

const baseValue = (item: ItemId) => (isCrop(item) ? CROPS[item].sellPrice : GOODS[item].sellPrice);

/** Lifetime coins plus the barn at `VALUE_MULT` x base price. Only production raises it. */
export function wealth(s: FarmState): number {
  let w = s.lifetimeCoins;
  for (const item of ITEM_IDS) w += PLAUSIBLE.valueMult * s.inv[item] * baseValue(item);
  return w;
}

const series = (base: number, growth: number, from: number, to: number) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += Math.round(base * Math.pow(growth, i));
  return sum;
};

/** Coins spent on everything the farm owns (seeds not included). */
export function assetSpend(s: FarmState): number {
  let sum = series(ECONOMY.tap.costBase, ECONOMY.tap.costGrowth, 0, s.tapLevel);
  sum += series(ECONOMY.field.baseCost, ECONOMY.field.costGrowth, 0, s.fields.length - ECONOMY.startFields);
  sum += series(ECONOMY.land.baseCost, ECONOMY.land.costGrowth, 0, s.land - 1);
  for (const a of ANIMAL_IDS) sum += series(ANIMALS[a].baseCost, ANIMALS[a].costGrowth, 0, s.animals[a].count);
  sum += series(HELPERS.farmhand.baseCost, HELPERS.farmhand.costGrowth, 0, s.fields.filter((f) => f.auto).length);
  for (const h of ['sprinkler', 'scarecrow', 'mill'] as const) sum += series(HELPERS[h].baseCost, HELPERS[h].costGrowth, 0, s.helpers[h]);
  return sum;
}

interface Capacity {
  /** Wealth per second, and wealth that may have been nearly ready at the start. */
  rate: number;
  lump: number;
  /** Items per second and XP per second from harvests, plus XP nearly ready. */
  items: number;
  xpRate: number;
  xpLump: number;
}

/** The best the farm could do at `lvl`: every field on the best crop, max combo, 15 taps/s. */
function capacity(s: FarmState, lvl: number): Capacity {
  const crops = unlockedCrops({ ...s, xp: xpAtLeast(lvl) }) as CropId[];
  const qty = 1 + ECONOMY.scarecrowYield * s.helpers.scarecrow;
  let field = { rate: 0, lump: 0, items: 0, xpRate: 0, xpLump: 0 };
  for (const c of crops) {
    const sec = growMs(s, c) / 1000;
    const value = PLAUSIBLE.valueMult * baseValue(c) * qty + baseValue(c) * ECONOMY.harvestCoinShare * comboMult(Infinity);
    field = {
      rate: Math.max(field.rate, value / sec),
      lump: Math.max(field.lump, value),
      items: Math.max(field.items, qty / sec),
      xpRate: Math.max(field.xpRate, CROPS[c].xp / sec),
      xpLump: Math.max(field.xpLump, CROPS[c].xp),
    };
  }
  const n = s.fields.length;
  const cap: Capacity = {
    rate: field.rate * n + PLAUSIBLE.tapsPerSec * tapPower(s),
    lump: field.lump * n,
    items: field.items * n,
    xpRate: field.xpRate * n,
    xpLump: field.xpLump * n,
  };
  for (const a of ANIMAL_IDS as readonly AnimalId[]) {
    const { count } = s.animals[a];
    const value = PLAUSIBLE.valueMult * baseValue(ANIMALS[a].good) * count;
    cap.rate += value / ANIMALS[a].periodSec;
    cap.lump += value;
    cap.items += count / ANIMALS[a].periodSec;
  }
  return cap;
}

/** Smallest XP total that is at least level `lvl`. */
function xpAtLeast(lvl: number): number {
  let xp = 0;
  while (levelOf(xp) < lvl) xp = xp === 0 ? 1 : xp * 2;
  let lo = 0;
  let hi = xp;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (levelOf(mid) >= lvl) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

const orderXp = (lvl: number) => Math.round(ECONOMY.orders.xpBase * Math.pow(ECONOMY.orders.xpGrowth, lvl - 1)) + 4;

const maxCap = (a: Capacity, b: Capacity): Capacity => ({
  rate: Math.max(a.rate, b.rate),
  lump: Math.max(a.lump, b.lump),
  items: Math.max(a.items, b.items),
  xpRate: Math.max(a.xpRate, b.xpRate),
  xpLump: Math.max(a.xpLump, b.xpLump),
});

// ---------------------------------------------------------------- the check

/**
 * Checks `next` (already parsed) against `prev`, the last accepted save of the same player
 * (null for a first upload), at server time `now`. Returns the possibly clamped state, or a
 * rejection when the farm owns things it could never have paid for.
 */
export function checkSave(prev: FarmState | null, next: FarmState, now: number): Verdict {
  const s = clone(next);
  const base = prev ?? newGame(s.createdAt, 0);
  const clamped: string[] = [];
  const { slack } = PLAUSIBLE;

  if (s.fields.filter((f) => f.auto).length > s.fields.length) return { ok: false, reason: 'farmhands' };

  const end = Math.min(s.t, now + PLAUSIBLE.clockSkewMs);
  const start = prev ? prev.t : Math.max(s.createdAt, now - PLAUSIBLE.firstSyncMaxMs);
  const sec = Math.max(0, end - start) / 1000;

  // Orders and XP. Levels unlock better crops, so raise the level step by step until it settles.
  let lvl = levelOf(base.xp);
  const baseCap = capacity(base, lvl);
  const baseItems = ITEM_IDS.reduce((n, i) => n + base.inv[i], 0);
  let orders = s.stats.ordersDone;
  let xp = s.xp;
  for (let guard = 0; guard < 20; guard++) {
    const cap = maxCap(baseCap, capacity(s, lvl));
    const maxOrders = base.stats.ordersDone + ECONOMY.orders.slots + (baseItems + slack * cap.items * sec) / 2;
    orders = Math.min(s.stats.ordersDone, Math.floor(maxOrders));
    // Best case: all harvest XP first, then every order paying the XP of the level reached so far.
    let maxXp = base.xp + slack * (cap.xpRate * sec + cap.xpLump);
    for (let i = base.stats.ordersDone; i < orders && maxXp < s.xp; i++) maxXp += orderXp(levelOf(maxXp));
    xp = Math.min(s.xp, maxXp);
    const reached = levelOf(xp);
    if (reached <= lvl) break;
    lvl = reached;
  }
  if (orders < s.stats.ordersDone) {
    s.stats.ordersDone = orders;
    clamped.push('orders');
  }
  if (xp < s.xp) {
    s.xp = xp;
    clamped.push('xp');
  }

  // Wealth.
  const cap = maxCap(baseCap, capacity(s, levelOf(s.xp)));
  const maxWealth = wealth(base) + slack * (cap.rate * sec + cap.lump) + 50;
  let excess = wealth(s) - maxWealth;
  if (excess > 0) {
    clamped.push('coins');
    const fromCoins = Math.min(excess, s.coins);
    s.coins -= fromCoins;
    s.lifetimeCoins -= fromCoins;
    excess -= fromCoins;
    // Lifetime coins claimed without the coins to show for them.
    const fromLifetime = Math.max(0, Math.min(excess, s.lifetimeCoins - assetSpend(s) - s.coins));
    s.lifetimeCoins -= fromLifetime;
    excess -= fromLifetime;
    for (const item of [...ITEM_IDS].sort((a, b) => baseValue(b) - baseValue(a))) {
      if (excess <= 0) break;
      const each = PLAUSIBLE.valueMult * baseValue(item);
      const drop = Math.min(s.inv[item], Math.ceil(excess / each));
      s.inv[item] -= drop;
      excess -= drop * each;
    }
    s.runCoins = Math.min(s.runCoins, s.lifetimeCoins);
    if (excess > 0) return { ok: false, reason: 'wealth' };
  }

  // Everything owned must have been paid for.
  if (assetSpend(s) + s.coins > s.lifetimeCoins * (1 + 1e-9) + 1) return { ok: false, reason: 'unpaid' };
  if (s.runCoins > s.lifetimeCoins + 1) {
    s.runCoins = s.lifetimeCoins;
    clamped.push('runCoins');
  }

  return { ok: true, state: s, clamped };
}
