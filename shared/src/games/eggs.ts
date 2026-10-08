/**
 * Egg Sort: move eggs between baskets until each basket holds one kind. An egg may go onto an
 * empty basket or onto an egg of the same kind. Every board is checked solvable when it's made.
 */
import { isInt, rng, shuffle, timeBonus, type Game } from './engine.js';

export const EGGS = { kinds: 4, capacity: 4, baskets: 6 } as const;

export interface EggsState {
  /** Bottom to top. */
  baskets: number[][];
  moves: number;
  finishedAt: number | null;
}

export type EggsMove = { from: number; to: number };

const sorted = (b: number[][]) => b.every((x) => x.length === 0 || (x.length === EGGS.capacity && x.every((e) => e === x[0])));

export function canPour(b: number[][], from: number, to: number): boolean {
  const src = b[from]!, dst = b[to]!;
  if (from === to || !src.length || dst.length >= EGGS.capacity) return false;
  return !dst.length || dst[dst.length - 1] === src[src.length - 1];
}

/** Depth-first search for any solution; null when none is found within `budget` states. */
export function solveEggs(start: number[][], budget = 50_000): EggsMove[] | null {
  const seen = new Set<string>();
  const key = (b: number[][]) => b.map((x) => x.join('')).sort().join('|');
  const path: EggsMove[] = [];
  const dfs = (b: number[][]): boolean => {
    if (sorted(b)) return true;
    const k = key(b);
    if (seen.has(k) || seen.size >= budget) return false;
    seen.add(k);
    for (let from = 0; from < b.length; from++) {
      const src = b[from]!;
      // Moving a basket of one kind into an empty one changes nothing.
      const uniform = src.every((e) => e === src[0]);
      for (let to = 0; to < b.length; to++) {
        if (!canPour(b, from, to) || (uniform && !b[to]!.length)) continue;
        const next = b.map((x) => [...x]);
        next[to]!.push(next[from]!.pop()!);
        path.push({ from, to });
        if (dfs(next)) return true;
        path.pop();
      }
    }
    return false;
  };
  return dfs(start) ? path : null;
}

export const eggs: Game<EggsState, EggsMove> = {
  id: 'eggs',
  limitMs: 300_000,
  par: 1100,
  init(seed) {
    const r = rng(seed);
    for (;;) {
      const all = shuffle(r, Array.from({ length: EGGS.kinds * EGGS.capacity }, (_, i) => i % EGGS.kinds));
      const baskets = Array.from({ length: EGGS.baskets }, (_, i) => (i < EGGS.kinds ? all.slice(i * EGGS.capacity, (i + 1) * EGGS.capacity) : []));
      const anyDone = baskets.some((b) => b.length === EGGS.capacity && b.every((e) => e === b[0]));
      if (!anyDone && solveEggs(baskets)) return { baskets, moves: 0, finishedAt: null };
    }
  },
  parseMove: (m) => {
    const mm = m as EggsMove;
    return typeof m === 'object' && m !== null && isInt(mm.from, 0, EGGS.baskets - 1) && isInt(mm.to, 0, EGGS.baskets - 1) ? { from: mm.from, to: mm.to } : null;
  },
  move(s, { from, to }, at) {
    if (s.finishedAt !== null || !canPour(s.baskets, from, to)) return false;
    s.baskets[to]!.push(s.baskets[from]!.pop()!);
    s.moves++;
    if (sorted(s.baskets)) s.finishedAt = at;
    return true;
  },
  done: (s) => s.finishedAt !== null,
  score(s) {
    if (s.finishedAt === null) return s.baskets.filter((b) => b.length === EGGS.capacity && b.every((e) => e === b[0])).length * 100;
    return 600 + Math.max(0, 400 - 10 * Math.max(0, s.moves - 20)) + timeBonus(s.finishedAt, 300, 2);
  },
};
