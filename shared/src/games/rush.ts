/**
 * Harvest Rush: 30 s of tapping ripe crops as they pop up. Weeds and unripe crops cost points.
 * Every pop-up is decided by the seed up front, so the board only depends on the taps.
 */
import { randInt, rng, type Game } from './engine.js';
import { nextFloat } from '../sim/rng.js';

export const RUSH = { cols: 3, rows: 4, crops: ['wheat', 'carrot', 'corn', 'tomato', 'cabbage'] } as const;
const CELLS = RUSH.cols * RUSH.rows;
const LIMIT = 30_000;

export type RushKind = 'ripe' | 'unripe' | 'weed';

export interface Popup {
  cell: number;
  kind: RushKind;
  crop: number;
  from: number;
  until: number;
}

export interface RushState {
  popups: Popup[];
  tapped: boolean[];
  points: number;
  streak: number;
  hits: number;
  misses: number;
}

export type RushMove = { tap: number };

/** Ripe tap: 10 points, +2 per tap in the streak (up to +10). Wrong tap: -5 and the streak ends. */
export const RUSH_POINTS = { ripe: 10, streakStep: 2, streakMax: 10, wrong: 5 } as const;

/** The pop-up active in `cell` at `at`, if any. */
export const popupAt = (s: RushState, cell: number, at: number) =>
  s.popups.findIndex((p) => p.cell === cell && p.from <= at && at < p.until);

export const rush: Game<RushState, RushMove> = {
  id: 'rush',
  limitMs: LIMIT,
  par: 400,
  init(seed) {
    const r = rng(seed);
    const popups: Popup[] = [];
    // Slow start, faster towards the end; still slow enough for a 7-year-old.
    for (let t = 800; t < LIMIT - 600; ) {
      const progress = t / LIMIT;
      const life = Math.round(1700 - 500 * progress);
      const free = Array.from({ length: CELLS }, (_, i) => i).filter((c) => !popups.some((p) => p.cell === c && p.until > t));
      if (free.length) {
        const roll = nextFloat(r);
        popups.push({
          cell: free[randInt(r, free.length)]!,
          kind: roll < 0.7 ? 'ripe' : roll < 0.85 ? 'unripe' : 'weed',
          crop: randInt(r, RUSH.crops.length),
          from: t,
          until: Math.min(LIMIT, t + life),
        });
      }
      t += Math.round(850 - 400 * progress + randInt(r, 200));
    }
    return { popups, tapped: popups.map(() => false), points: 0, streak: 0, hits: 0, misses: 0 };
  },
  parseMove: (m) => (typeof m === 'object' && m !== null && Number.isInteger((m as RushMove).tap) && (m as RushMove).tap >= 0 && (m as RushMove).tap < CELLS ? { tap: (m as RushMove).tap } : null),
  move(s, { tap }, at) {
    const i = popupAt(s, tap, at);
    if (i < 0 || s.tapped[i]) return false;
    s.tapped[i] = true;
    if (s.popups[i]!.kind === 'ripe') {
      s.points += RUSH_POINTS.ripe + Math.min(RUSH_POINTS.streakMax, s.streak * RUSH_POINTS.streakStep);
      s.streak++;
      s.hits++;
    } else {
      s.points = Math.max(0, s.points - RUSH_POINTS.wrong);
      s.streak = 0;
      s.misses++;
    }
    return true;
  },
  // Rush always runs the full 30 s.
  done: () => false,
  score: (s) => s.points,
};
