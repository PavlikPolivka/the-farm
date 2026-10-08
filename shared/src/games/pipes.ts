/**
 * Water Pipes: rotate tiles until water flows from the well (left edge) to the field (right edge).
 * The board is a random spanning tree, so the unscrambled board always works.
 */
import { isInt, randInt, rng, shuffle, timeBonus, type Game, type Rng } from './engine.js';

export const PIPES = { w: 4, h: 5 } as const;
/** Opening bits. */
export const N = 1, E = 2, S = 4, W = 8;

export interface PipesState {
  /** Openings per tile before rotation. */
  masks: number[];
  /** Quarter turns clockwise per tile. */
  rots: number[];
  wellRow: number;
  fieldRow: number;
  turns: number;
  /** Fewest quarter turns that would have solved the board. */
  par: number;
  finishedAt: number | null;
}

export type PipesMove = { rotate: number };

/** Rotates an opening mask clockwise by `q` quarter turns. */
export const rotateMask = (mask: number, q: number) => {
  let m = mask;
  for (let i = 0; i < ((q % 4) + 4) % 4; i++) m = ((m << 1) | (m >> 3)) & 15;
  return m;
};

const DIRS = [
  { bit: N, opp: S, dx: 0, dy: -1 },
  { bit: E, opp: W, dx: 1, dy: 0 },
  { bit: S, opp: N, dx: 0, dy: 1 },
  { bit: W, opp: E, dx: -1, dy: 0 },
];

/** Tiles the water reaches from the well, and whether it gets to the field. */
export function flow(s: PipesState): { wet: boolean[]; solved: boolean } {
  const { w, h } = PIPES;
  const open = (i: number) => rotateMask(s.masks[i]!, s.rots[i]!);
  const wet = s.masks.map(() => false);
  const start = s.wellRow * w;
  if (!(open(start) & W)) return { wet, solved: false };
  const queue = [start];
  wet[start] = true;
  while (queue.length) {
    const i = queue.shift()!;
    const x = i % w, y = Math.floor(i / w);
    for (const d of DIRS) {
      if (!(open(i) & d.bit)) continue;
      const nx = x + d.dx, ny = y + d.dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!wet[j] && open(j) & d.opp) {
        wet[j] = true;
        queue.push(j);
      }
    }
  }
  const end = s.fieldRow * w + (w - 1);
  return { wet, solved: wet[end]! && (open(end) & E) !== 0 };
}

/** Quarter turns that bring a tile back to an equivalent orientation. */
const period = (mask: number) => (rotateMask(mask, 1) === mask ? 1 : rotateMask(mask, 2) === mask ? 2 : 4);

function tree(r: Rng): number[] {
  const { w, h } = PIPES;
  const masks = Array<number>(w * h).fill(0);
  const seen = masks.map(() => false);
  const stack = [randInt(r, w * h)];
  seen[stack[0]!] = true;
  while (stack.length) {
    const i = stack[stack.length - 1]!;
    const x = i % w, y = Math.floor(i / w);
    const options = shuffle(r, [...DIRS]).filter((d) => {
      const nx = x + d.dx, ny = y + d.dy;
      return nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[ny * w + nx];
    });
    const d = options[0];
    if (!d) {
      stack.pop();
      continue;
    }
    const j = (y + d.dy) * w + (x + d.dx);
    masks[i]! |= d.bit;
    masks[j]! |= d.opp;
    seen[j] = true;
    stack.push(j);
  }
  return masks;
}

export const pipes: Game<PipesState, PipesMove> = {
  id: 'pipes',
  limitMs: 300_000,
  par: 1100,
  init(seed) {
    const r = rng(seed);
    const { w, h } = PIPES;
    const masks = tree(r);
    const wellRow = randInt(r, h);
    const fieldRow = randInt(r, h);
    masks[wellRow * w]! |= W;
    masks[fieldRow * w + w - 1]! |= E;
    const s: PipesState = { masks, rots: masks.map(() => 0), wellRow, fieldRow, turns: 0, par: 0, finishedAt: null };
    for (let guard = 0; guard < 20; guard++) {
      s.rots = masks.map(() => randInt(r, 4));
      if (!flow(s).solved) break;
    }
    if (flow(s).solved) s.rots[wellRow * w] = (s.rots[wellRow * w]! + 1) % 4;
    s.par = masks.reduce((sum, m, i) => sum + ((4 - s.rots[i]!) % period(m)), 0);
    return s;
  },
  parseMove: (m) => (typeof m === 'object' && m !== null && isInt((m as PipesMove).rotate, 0, PIPES.w * PIPES.h - 1) ? { rotate: (m as PipesMove).rotate } : null),
  move(s, { rotate }, at) {
    if (s.finishedAt !== null) return false;
    s.rots[rotate] = (s.rots[rotate]! + 1) % 4;
    s.turns++;
    if (flow(s).solved) s.finishedAt = at;
    return true;
  },
  done: (s) => s.finishedAt !== null,
  score(s) {
    if (s.finishedAt === null) return flow(s).wet.filter(Boolean).length * 20;
    return 600 + Math.max(0, 400 - 10 * Math.max(0, s.turns - s.par)) + timeBonus(s.finishedAt, 300, 2);
  },
};
