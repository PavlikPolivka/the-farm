/**
 * The farm simulation. Deterministic: the same start state and the same timed actions always
 * give the same result, on the client and on the server.
 *
 * `apply` mutates the state in place (the client holds one state object) and returns events
 * for the UI. Every action first advances the clock to its timestamp.
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
  type GoodId,
  type HelperId,
  type ItemId,
} from '../config/economy.js';
import { DROPS, PERK_IDS, RARE_BREEDS, SKINS, decorPool, type PerkId, type SkinSlot } from '../config/progress.js';
import { GAME_IDS, type GameId } from '../games/engine.js';
import { nextFloat } from './rng.js';
import { breedsDue, canPrestige, cupsDue, isBreed, isDecor, isFound, perkCost, seedsFor, skinUnlocked, startFarmhands } from './progress.js';
import {
  animalCost,
  dropMult,
  comboMult,
  feedNeeds,
  fieldCost,
  growMs,
  helperCost,
  helperLevel,
  helperMax,
  isCrop,
  isRipe,
  landCost,
  landLevel,
  level,
  levelOf,
  maxFields,
  offlineCapMs,
  orderNeeds,
  orderSlots,
  animalPeriodMs,
  farmhands,
  sellPrice,
  tapCost,
  tapPower,
  unlockedAnimals,
  unlockedCrops,
  unlocksAt,
} from './rules.js';
import { emptyField, newGame, TUTORIAL_DONE, type FarmState, type Order } from './state.js';
import { giftValue, type Gift } from './social.js';

export type Action =
  | { type: 'tap'; at: number }
  | { type: 'plant'; at: number; field: number; crop: CropId }
  | { type: 'harvest'; at: number; field: number }
  | { type: 'sell'; at: number; item: ItemId; qty: number }
  | { type: 'buyField'; at: number }
  | { type: 'buyLand'; at: number }
  | { type: 'buyTap'; at: number }
  | { type: 'buyAnimal'; at: number; animal: AnimalId }
  | { type: 'buyHelper'; at: number; helper: HelperId }
  | { type: 'setAutoCrop'; at: number; field: number; crop: CropId }
  | { type: 'deliver'; at: number; order: number }
  | { type: 'tutorial'; at: number; step: number }
  /** A minigame reward granted by the server (ids increase per player), maybe with a collectible. */
  | { type: 'reward'; at: number; id: number; coins: number; xp: number; game?: GameId; item?: string | null }
  /** A prize from the server: a daily challenge win or a weekly trophy. */
  | { type: 'prize'; at: number; id: number; prize: Prize }
  /** Move to new land: trade this run for Golden Seeds. */
  | { type: 'prestige'; at: number }
  | { type: 'buyPerk'; at: number; perk: PerkId }
  | { type: 'setSkin'; at: number; slot: SkinSlot; skin: string | null }
  /** A gift the server accepted from this player: the items leave the barn. */
  | { type: 'giftSend'; at: number; gift: Gift }
  /** A gift this player claimed from the inbox. */
  | { type: 'giftClaim'; at: number; gift: Gift };

/** A daily challenge win (with a collectible, if any was left) or a weekly trophy. */
export type Prize = { kind: 'crown'; day: string; item: string | null } | { kind: 'trophy'; week: string };

export type FailReason = 'coins' | 'seeds' | 'locked' | 'max' | 'busy' | 'empty' | 'unripe' | 'items' | 'invalid';

export type SimEvent =
  | { type: 'coins'; amount: number; source: 'tap' | 'harvest' | 'sell' | 'order' | 'mill' | 'minigame' }
  | { type: 'harvest'; field: number; crop: CropId; qty: number; combo: number; auto: boolean }
  | { type: 'produce'; good: GoodId; qty: number }
  | { type: 'levelUp'; level: number; unlocks: string[] }
  | { type: 'orderDone'; id: number }
  | { type: 'bought'; what: string }
  /** A new entry in the Collection Book. */
  | { type: 'found'; id: string }
  | { type: 'prestige'; seeds: number }
  | { type: 'fail'; reason: FailReason };

export interface Result {
  ok: boolean;
  events: SimEvent[];
}

/** A fresh game with its first orders. */
export function startGame(now: number, seed: number): FarmState {
  const s = newGame(now, seed);
  fillOrders(s);
  return s;
}

export function apply(s: FarmState, a: Action): Result {
  const events = advance(s, a.at);
  const fail = (reason: FailReason): Result => ({ ok: false, events: [...events, { type: 'fail', reason }] });

  switch (a.type) {
    case 'tap': {
      const amount = tapPower(s);
      earn(s, amount);
      s.stats.taps++;
      events.push({ type: 'coins', amount, source: 'tap' });
      break;
    }
    case 'plant': {
      const f = s.fields[a.field];
      if (!f) return fail('invalid');
      if (f.crop) return fail('busy');
      if (!unlockedCrops(s).includes(a.crop)) return fail('locked');
      if (!spend(s, CROPS[a.crop].seedCost)) return fail('coins');
      f.crop = a.crop;
      f.plantedAt = s.t;
      s.lastCrop = a.crop;
      if (f.auto) f.autoCrop = a.crop;
      break;
    }
    case 'harvest': {
      const f = s.fields[a.field];
      if (!f) return fail('invalid');
      if (!f.crop) return fail('empty');
      if (!isRipe(s, f)) return fail('unripe');
      const crop = f.crop;
      s.combo.n = s.t - s.combo.lastAt <= ECONOMY.combo.windowMs ? s.combo.n + 1 : 0;
      s.combo.lastAt = s.t;
      const mult = comboMult(s.combo.n);
      const qty = reap(s, crop);
      addXp(s, CROPS[crop].xp, events);
      // A rare find in the soil: only hand harvests, so it rewards playing.
      if (nextFloat(s) < DROPS.harvest * dropMult(s)) pickDrop(s, decorPool('garden'), events);
      const coins = CROPS[crop].sellPrice * ECONOMY.harvestCoinShare * mult;
      earn(s, coins);
      f.crop = null;
      events.push({ type: 'harvest', field: a.field, crop, qty, combo: mult, auto: false });
      events.push({ type: 'coins', amount: coins, source: 'harvest' });
      if (f.auto) replant(s, a.field, s.t);
      break;
    }
    case 'sell': {
      const qty = Math.min(Math.floor(a.qty), s.inv[a.item] ?? 0);
      if (qty <= 0) return fail('items');
      s.inv[a.item] -= qty;
      const amount = qty * sellPrice(s, a.item);
      earn(s, amount);
      events.push({ type: 'coins', amount, source: 'sell' });
      break;
    }
    case 'buyField': {
      if (s.fields.length >= maxFields(s)) return fail('max');
      if (!spend(s, fieldCost(s))) return fail('coins');
      s.fields.push(emptyField());
      s.stats.bestFields = Math.max(s.stats.bestFields, s.fields.length);
      events.push({ type: 'bought', what: 'field' });
      break;
    }
    case 'buyLand': {
      const need = landLevel(s);
      if (need === null) return fail('max');
      if (level(s) < need) return fail('locked');
      if (!spend(s, landCost(s))) return fail('coins');
      s.land++;
      events.push({ type: 'bought', what: 'land' });
      break;
    }
    case 'buyTap': {
      if (!spend(s, tapCost(s))) return fail('coins');
      s.tapLevel++;
      events.push({ type: 'bought', what: 'tap' });
      break;
    }
    case 'buyAnimal': {
      if (!ANIMALS[a.animal]) return fail('invalid');
      if (!unlockedAnimals(s).includes(a.animal)) return fail('locked');
      if (!spend(s, animalCost(s, a.animal))) return fail('coins');
      s.animals[a.animal].count++;
      events.push({ type: 'bought', what: `animal:${a.animal}` });
      for (const id of breedsDue(s)) collect(s, id, events);
      break;
    }
    case 'buyHelper': {
      const def = HELPERS[a.helper];
      if (!def) return fail('invalid');
      if (level(s) < def.unlockLevel) return fail('locked');
      if (helperLevel(s, a.helper) >= helperMax(s, a.helper)) return fail('max');
      if (!spend(s, helperCost(s, a.helper))) return fail('coins');
      if (a.helper === 'farmhand') {
        const i = s.fields.findIndex((f) => !f.auto);
        const f = s.fields[i]!;
        f.auto = true;
        f.autoCrop = f.crop ?? s.lastCrop;
        if (!f.crop) replant(s, i, s.t);
        s.stats.bestFarmhands = Math.max(s.stats.bestFarmhands, farmhands(s));
      } else {
        s.helpers[a.helper]++;
      }
      events.push({ type: 'bought', what: `helper:${a.helper}` });
      break;
    }
    case 'setAutoCrop': {
      const f = s.fields[a.field];
      if (!f?.auto) return fail('invalid');
      if (!unlockedCrops(s).includes(a.crop)) return fail('locked');
      f.autoCrop = a.crop;
      if (!f.crop) replant(s, a.field, s.t);
      break;
    }
    case 'deliver': {
      const i = s.orders.findIndex((o) => o.id === a.order);
      const o = s.orders[i];
      if (!o) return fail('invalid');
      if (o.lines.some((l) => (s.inv[l.item] ?? 0) < l.qty)) return fail('items');
      for (const l of o.lines) s.inv[l.item] -= l.qty;
      earn(s, o.coins);
      s.stats.ordersDone++;
      s.orders.splice(i, 1);
      events.push({ type: 'coins', amount: o.coins, source: 'order' }, { type: 'orderDone', id: o.id });
      if (o.drop) collect(s, o.drop, events);
      addXp(s, o.xp, events);
      fillOrders(s);
      break;
    }
    case 'reward': {
      if (!(a.id > s.lastRewardId) || !(a.coins >= 0) || !(a.xp >= 0)) return fail('invalid');
      s.lastRewardId = a.id;
      earn(s, a.coins);
      s.stats.rewardCoins += a.coins;
      s.stats.rewardXp += a.xp;
      if (a.game && GAME_IDS.includes(a.game)) {
        s.stats.games++;
        s.stats.plays[a.game]++;
      }
      events.push({ type: 'coins', amount: a.coins, source: 'minigame' });
      if (a.item) collect(s, a.item, events);
      addXp(s, a.xp, events);
      break;
    }
    case 'prize': {
      if (!(a.id > s.lastPrizeId)) return fail('invalid');
      s.lastPrizeId = a.id;
      if (a.prize.kind === 'crown') {
        s.stats.crowns++;
        if (a.prize.item) collect(s, a.prize.item, events);
      } else if (!s.trophies.includes(a.prize.week)) {
        s.trophies.push(a.prize.week);
        for (const id of cupsDue(s)) collect(s, id, events);
      }
      break;
    }
    case 'prestige': {
      if (!canPrestige(s)) return fail('locked');
      const seeds = seedsFor(s.runCoins);
      newRun(s);
      s.seeds += seeds;
      s.prestige.level++;
      s.prestige.seedsEarned += seeds;
      events.push({ type: 'prestige', seeds });
      break;
    }
    case 'buyPerk': {
      if (!PERK_IDS.includes(a.perk)) return fail('invalid');
      const cost = perkCost(s, a.perk);
      if (cost === null) return fail('max');
      if (s.seeds < cost) return fail('seeds');
      s.seeds -= cost;
      s.perks[a.perk]++;
      events.push({ type: 'bought', what: `perk:${a.perk}` });
      // A new order slot opens right away.
      if (a.perk === 'market') fillOrders(s);
      break;
    }
    case 'setSkin': {
      if (!(a.slot in s.skins)) return fail('invalid');
      if (a.skin !== null && (SKINS.find((k) => k.id === a.skin)?.slot !== a.slot || !skinUnlocked(s, a.skin))) return fail('locked');
      s.skins[a.slot] = a.skin;
      break;
    }
    case 'giftSend': {
      if (a.gift.kind === 'item') {
        if ((s.inv[a.gift.item] ?? 0) < a.gift.qty) return fail('items');
        s.inv[a.gift.item] -= a.gift.qty;
        s.stats.giftValueOut += giftValue(a.gift);
      }
      s.stats.giftsSent++;
      break;
    }
    case 'giftClaim': {
      if (a.gift.kind === 'flower') {
        s.stats.flowers++;
        break;
      }
      s.inv[a.gift.item] += a.gift.qty;
      s.stats.giftValueIn += giftValue(a.gift);
      break;
    }
    case 'tutorial': {
      s.tutorial = Math.max(0, Math.min(TUTORIAL_DONE, Math.floor(a.step)));
      break;
    }
    default:
      return fail('invalid');
  }
  return { ok: true, events };
}

/**
 * Runs helpers, animals and the mill up to `to`. Steps are at most `tickMs` long, so the result
 * doesn't depend on how often the client calls this. Gaps longer than the offline cap only
 * simulate the capped part; the clock still jumps to `to`.
 */
export function advance(s: FarmState, to: number): SimEvent[] {
  const events: SimEvent[] = [];
  if (!(to > s.t)) return events;
  const capped = Math.min(to, s.t + offlineCapMs(s));
  while (s.t < capped) {
    const dt = Math.min(ECONOMY.tickMs, capped - s.t);
    s.t += dt;
    step(s, dt, events);
  }
  if (to > s.t) shiftClock(s, to - s.t);
  return events;
}

/** Time beyond the offline cap passes without production: move every timestamp along with the clock. */
function shiftClock(s: FarmState, by: number): void {
  s.t += by;
  for (const f of s.fields) if (f.auto && f.crop) f.plantedAt += by;
}

function step(s: FarmState, dt: number, events: SimEvent[]): void {
  s.fields.forEach((f, i) => {
    if (!f.auto) return;
    // A farmhand may complete several short crops within one step.
    for (let guard = 0; guard < 64; guard++) {
      if (!f.crop) {
        if (!replant(s, i, s.t)) return;
        continue;
      }
      const ripeAt = f.plantedAt + growMs(s, f.crop);
      if (ripeAt > s.t) return;
      const crop = f.crop;
      const qty = reap(s, crop);
      f.crop = null;
      events.push({ type: 'harvest', field: i, crop, qty, combo: 1, auto: true });
      if (!replant(s, i, ripeAt)) return;
    }
  });

  for (const a of ANIMAL_IDS) {
    const herd = s.animals[a];
    if (!herd.count) continue;
    const def = ANIMALS[a];
    herd.progressMs += dt;
    const period = animalPeriodMs(s, a);
    while (herd.progressMs >= period) {
      herd.progressMs -= period;
      const fed = def.feed ? Math.min(herd.count, Math.floor(s.inv[def.feed] / def.feedPer)) : herd.count;
      if (fed <= 0) continue;
      if (def.feed) s.inv[def.feed] -= fed * def.feedPer;
      s.inv[def.good] += fed;
      s.stats.produced[def.good] += fed;
      events.push({ type: 'produce', good: def.good, qty: fed });
    }
  }

  if (s.helpers.mill > 0) {
    let amount = 0;
    for (const item of [...CROP_IDS, ...GOOD_IDS] as ItemId[]) {
      const keep = ECONOMY.millReserve + orderNeeds(s, item) + (isCrop(item) ? feedNeeds(s, item) : 0);
      const extra = s.inv[item] - keep;
      if (extra > 0) {
        s.inv[item] -= extra;
        amount += extra * sellPrice(s, item);
      }
    }
    if (amount > 0) {
      earn(s, amount);
      events.push({ type: 'coins', amount, source: 'mill' });
    }
  }
}

/** Farmhand replant at `at`; pays the seed. Returns false if it can't afford it yet. */
function replant(s: FarmState, i: number, at: number): boolean {
  const f = s.fields[i]!;
  if (!spend(s, CROPS[f.autoCrop].seedCost)) return false;
  f.crop = f.autoCrop;
  f.plantedAt = at;
  return true;
}

/** Adds a harvested crop to the barn, with the scarecrow bonus. XP is the caller's business. */
function reap(s: FarmState, crop: CropId): number {
  s.yieldCarry += ECONOMY.scarecrowYield * s.helpers.scarecrow;
  const bonus = Math.floor(s.yieldCarry);
  s.yieldCarry -= bonus;
  const qty = 1 + bonus;
  s.inv[crop] += qty;
  s.stats.harvested[crop] += qty;
  return qty;
}

function earn(s: FarmState, amount: number): void {
  s.coins += amount;
  s.lifetimeCoins += amount;
  s.runCoins += amount;
}

function spend(s: FarmState, amount: number): boolean {
  if (s.coins < amount) return false;
  s.coins -= amount;
  return true;
}

function addXp(s: FarmState, amount: number, events: SimEvent[]): void {
  const before = levelOf(s.xp);
  s.xp += amount;
  const after = levelOf(s.xp);
  for (let l = before + 1; l <= after; l++) events.push({ type: 'levelUp', level: l, unlocks: unlocksAt(l) });
  s.stats.bestLevel = Math.max(s.stats.bestLevel, after);
}

/** Adds a breed or decoration to the Collection Book (once). */
function collect(s: FarmState, id: string, events: SimEvent[]): void {
  if (isFound(s, id)) return;
  if (isBreed(id)) s.found.animals.push(id);
  else if (isDecor(id)) s.found.decor.push(id);
  else return;
  events.push({ type: 'found', id });
}

/** Something from `pool` that isn't in the book yet, picked with the farm's rng. */
export function unfound(s: FarmState, pool: readonly string[], reserved: readonly string[] = []): string | null {
  const left = pool.filter((id) => !isFound(s, id) && !reserved.includes(id));
  return left.length ? left[Math.floor(nextFloat(s) * left.length)]! : null;
}

function pickDrop(s: FarmState, pool: readonly string[], events: SimEvent[]): void {
  const id = unfound(s, pool);
  if (id) collect(s, id, events);
}

/** Prestige: a fresh run on new land. Seeds, perks, the book, skins, trophies and stats stay. */
function newRun(s: FarmState): void {
  const fresh = newGame(s.t, 0);
  s.coins = 0;
  s.runCoins = 0;
  s.xp = 0;
  s.tapLevel = 0;
  s.land = 1;
  s.fields = fresh.fields;
  s.inv = fresh.inv;
  s.animals = fresh.animals;
  s.helpers = fresh.helpers;
  s.yieldCarry = 0;
  s.orders = [];
  s.combo = { n: 0, lastAt: 0 };
  s.lastCrop = 'wheat';
  // The "old friend" perk: farmhands that come along to the new land.
  for (let i = 0; i < startFarmhands(s); i++) {
    s.fields[i]!.auto = true;
    replant(s, i, s.t);
  }
  fillOrders(s);
}

/** Keeps the order board full (3 slots, 4 with the market perk), generated from what the player can produce. */
export function fillOrders(s: FarmState): void {
  while (s.orders.length < orderSlots(s)) s.orders.push(makeOrder(s));
}

/** Village decorations and rare animals that orders and minigames can pay. */
export const ORDER_POOL = [...decorPool('village'), ...RARE_BREEDS];
export const MINIGAME_POOL = [...decorPool('fair'), ...RARE_BREEDS];

function makeOrder(s: FarmState): Order {
  const lvl = level(s);
  const items: ItemId[] = [...unlockedCrops(s)];
  for (const a of ANIMAL_IDS) if (s.animals[a].count > 0) items.push(ANIMALS[a].good);
  const taken = new Set(s.orders.flatMap((o) => o.lines.map((l) => l.item)));
  const pool = items.filter((i) => !taken.has(i));
  const from = pool.length ? pool : items;

  const lines = lvl >= 3 && from.length > 1 && nextFloat(s) < 0.5 ? 2 : 1;
  const picked: ItemId[] = [];
  while (picked.length < lines) {
    const item = from[Math.floor(nextFloat(s) * from.length)]!;
    if (!picked.includes(item)) picked.push(item);
  }
  const target = ECONOMY.orders.baseValue * Math.pow(ECONOMY.orders.valueGrowth, lvl - 1);
  const orderLines = picked.map((item) => {
    const base = isCrop(item) ? CROPS[item].sellPrice : GOODS[item].sellPrice;
    return { item, qty: Math.max(2, Math.min(99, Math.round(target / lines / base))) };
  });
  const value = orderLines.reduce((sum, l) => sum + l.qty * (isCrop(l.item) ? CROPS[l.item].sellPrice : GOODS[l.item].sellPrice), 0);
  const order: Order = {
    id: s.nextOrderId++,
    lines: orderLines,
    coins: Math.round(value * ECONOMY.orders.rewardMult),
    xp: Math.round(ECONOMY.orders.xpBase * Math.pow(ECONOMY.orders.xpGrowth, lvl - 1)) + lines * 2,
  };
  if (nextFloat(s) < DROPS.order * dropMult(s)) {
    const drop = unfound(s, ORDER_POOL, s.orders.flatMap((o) => (o.drop ? [o.drop] : [])));
    if (drop) order.drop = drop;
  }
  return order;
}
