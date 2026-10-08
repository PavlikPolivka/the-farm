/** Pexeso: flip pairs of farm cards. 4×4 cards, 8 pairs. */
import { isInt, rng, shuffle, timeBonus, type Game } from './engine.js';

export const PEXESO = { cards: 16, pairs: 8, faces: ['wheat', 'carrot', 'corn', 'tomato', 'cabbage', 'chicken', 'sheep', 'cow'] } as const;

export interface PexesoState {
  /** Face index per card position. */
  cards: number[];
  matched: boolean[];
  /** Face-up cards that aren't matched yet (0–2). Two of them stay up until the next flip. */
  up: number[];
  turns: number;
  pairs: number;
  finishedAt: number | null;
}

export type PexesoMove = { flip: number };

export const pexeso: Game<PexesoState, PexesoMove> = {
  id: 'pexeso',
  limitMs: 300_000,
  par: 1100,
  init(seed) {
    const r = rng(seed);
    const cards = shuffle(r, Array.from({ length: PEXESO.cards }, (_, i) => i % PEXESO.pairs));
    return { cards, matched: cards.map(() => false), up: [], turns: 0, pairs: 0, finishedAt: null };
  },
  parseMove: (m) => (typeof m === 'object' && m !== null && isInt((m as PexesoMove).flip, 0, PEXESO.cards - 1) ? { flip: (m as PexesoMove).flip } : null),
  move(s, { flip }, at) {
    if (s.finishedAt !== null) return false;
    // A wrong pair stays visible until the next tap, which turns it back over.
    if (s.up.length === 2) s.up = [];
    if (s.matched[flip] || s.up.includes(flip)) return false;
    s.up.push(flip);
    if (s.up.length < 2) return true;
    s.turns++;
    const [a, b] = s.up as [number, number];
    if (s.cards[a] === s.cards[b]) {
      s.matched[a] = s.matched[b] = true;
      s.up = [];
      if (++s.pairs === PEXESO.pairs) s.finishedAt = at;
    }
    return true;
  },
  done: (s) => s.finishedAt !== null,
  score(s) {
    if (s.finishedAt === null) return s.pairs * 50;
    return 800 + Math.max(0, 400 - 25 * Math.max(0, s.turns - PEXESO.pairs)) + timeBonus(s.finishedAt, 300, 2);
  },
};
