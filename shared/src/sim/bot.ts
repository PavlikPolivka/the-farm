/**
 * A simple greedy player used by the balance sim and the balance tests. It plays in sessions
 * (taps, harvests, plants, sells, delivers, buys the cheapest useful thing) and lets the
 * idle simulation run in between.
 */
import { ANIMALS, CROPS, CROP_IDS, GOOD_IDS, HELPERS, HELPER_IDS, type ItemId } from '../config/economy.js';
import { advance, apply, startGame, type Action } from './engine.js';
import {
  animalCost,
  feedNeeds,
  fieldCost,
  helperCost,
  helperLevel,
  helperMax,
  isRipe,
  landCost,
  landLevel,
  level,
  maxFields,
  orderNeeds,
  tapCost,
  unlockedAnimals,
  unlockedCrops,
} from './rules.js';
import type { FarmState } from './state.js';

export interface Profile {
  name: string;
  /** Sessions as [start hour of day, minutes]; repeated every day. */
  sessions: [number, number][];
  tapsPerSec: number;
  days: number;
}

export const PROFILES: Profile[] = [
  { name: 'active', sessions: [[0, 120]], tapsPerSec: 3, days: 1 },
  { name: 'casual', sessions: [[8, 5], [13, 5], [19, 5]], tapsPerSec: 2, days: 6 },
  { name: 'kid', sessions: [[7.5, 10], [17, 10]], tapsPerSec: 4, days: 6 },
];

export interface Milestones {
  firstPurchase?: number;
  firstHelper?: number;
  level: Record<number, number>;
  land2?: number;
  /** Seconds actually spent in sessions. */
  playedSec?: number;
}

const FRAME_MS = 250;
const T0 = Date.UTC(2026, 0, 5, 0, 0, 0); // a Monday, midnight UTC

/**
 * Runs a profile; milestone times are wall-clock seconds since the first session started.
 * `onFrame` sees the state after every played frame and at the start of every session.
 */
export function simulate(
  p: Profile,
  untilSec = p.days * 86_400,
  onFrame?: (s: FarmState) => void,
): { state: FarmState; milestones: Milestones } {
  const s = startGame(T0, 12345);
  const m: Milestones = { level: {} };
  const first = T0 + (p.sessions[0]?.[0] ?? 0) * 3_600_000;
  const mark = (at: number) => (at - first) / 1000;
  let tapDebt = 0;

  for (let day = 0; day < p.days; day++) {
    for (const [hour, minutes] of p.sessions) {
      const start = T0 + day * 86_400_000 + hour * 3_600_000;
      const end = start + minutes * 60_000;
      if (mark(start) >= untilSec) break;
      m.playedSec ??= 0;
      advance(s, start);
      onFrame?.(s);
      for (let t = start; t < end && mark(t) < untilSec; t += FRAME_MS) {
        tapDebt += (p.tapsPerSec * FRAME_MS) / 1000;
        const before = { coins: s.coins, fh: helperLevel(s, 'farmhand') };
        playFrame(s, t, tapDebt >= 1);
        m.playedSec! += FRAME_MS / 1000;
        if (tapDebt >= 1) tapDebt -= 1;
        if (m.firstPurchase === undefined && s.coins < before.coins - 0.001) m.firstPurchase = mark(t);
        if (m.firstHelper === undefined && helperLevel(s, 'farmhand') > before.fh) m.firstHelper = mark(t);
        const lvl = level(s);
        for (let l = 2; l <= lvl; l++) m.level[l] ??= mark(t);
        if (m.land2 === undefined && s.land >= 2) m.land2 = mark(t);
        onFrame?.(s);
      }
    }
  }
  advance(s, Math.min(T0 + untilSec * 1000, T0 + p.days * 86_400_000));
  return { state: s, milestones: m };
}

function playFrame(s: FarmState, at: number, tap: boolean): void {
  const act = (a: Action) => apply(s, a).ok;

  s.fields.forEach((f, i) => {
    if (f.crop && isRipe(s, f, at)) act({ type: 'harvest', at, field: i });
  });

  for (const o of [...s.orders]) act({ type: 'deliver', at, order: o.id });

  // Sell what neither the animals nor the open orders need.
  for (const item of [...CROP_IDS, ...GOOD_IDS] as ItemId[]) {
    const keep = orderNeeds(s, item) + (item in CROPS ? feedNeeds(s, item as (typeof CROP_IDS)[number]) : 0);
    const extra = s.inv[item] - keep;
    if (extra > 0) act({ type: 'sell', at, item, qty: extra });
  }

  buyCheapest(s, at);

  const best = [...unlockedCrops(s)].reverse().find((c) => CROPS[c].seedCost <= s.coins / 4) ?? 'wheat';
  s.fields.forEach((f, i) => {
    if (!f.crop && !f.auto) act({ type: 'plant', at, field: i, crop: best });
    if (f.auto && f.autoCrop !== best && CROPS[best].seedCost <= s.coins / 10) act({ type: 'setAutoCrop', at, field: i, crop: best });
  });

  if (tap) act({ type: 'tap', at });
}

function buyCheapest(s: FarmState, at: number): void {
  const options: { cost: number; action: Action }[] = [];
  if (s.fields.length < maxFields(s)) options.push({ cost: fieldCost(s), action: { type: 'buyField', at } });
  const need = landLevel(s);
  if (need !== null && level(s) >= need) options.push({ cost: landCost(s), action: { type: 'buyLand', at } });
  options.push({ cost: tapCost(s) * 3, action: { type: 'buyTap', at } }); // taps matter less over time
  for (const a of unlockedAnimals(s)) {
    const feed = ANIMALS[a].feed;
    if (feed && !unlockedCrops(s).includes(feed)) continue;
    options.push({ cost: animalCost(s, a), action: { type: 'buyAnimal', at, animal: a } });
  }
  for (const h of HELPER_IDS) {
    if (level(s) < HELPERS[h].unlockLevel || helperLevel(s, h) >= helperMax(s, h)) continue;
    options.push({ cost: helperCost(s, h), action: { type: 'buyHelper', at, helper: h } });
  }
  options.sort((a, b) => a.cost - b.cost);
  const pick = options[0];
  if (!pick) return;
  if (s.coins >= (pick.action.type === 'buyTap' ? tapCost(s) : pick.cost)) apply(s, pick.action);
}


export { formatDuration } from '../format.js';
