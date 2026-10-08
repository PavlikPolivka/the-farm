/** Crop Merge: 2048 on 4×4. Two equal tiles merge into the next stage: seed → sprout → wheat → … */
import { nextFloat } from '../sim/rng.js';
import { randInt, type Game } from './engine.js';

export const MERGE = {
  size: 4,
  /** Tile level n (1-based) is drawn with TILES[n - 1]. */
  tiles: ['seed', 'wheat-1', 'wheat', 'carrot', 'corn', 'tomato', 'cabbage', 'egg', 'wool', 'milk', 'honey', 'trophy'],
} as const;
const MAX_LEVEL = MERGE.tiles.length;

export const MERGE_DIRS = ['up', 'down', 'left', 'right'] as const;
export type MergeDir = (typeof MERGE_DIRS)[number];

export interface MergeState {
  /** 0 = empty, otherwise the tile level. Row-major. */
  grid: number[];
  rng: number;
  points: number;
  moves: number;
  over: boolean;
}

export type MergeMove = { dir: MergeDir };

function spawn(s: MergeState): void {
  const empty = s.grid.flatMap((v, i) => (v ? [] : [i]));
  if (!empty.length) return;
  const cell = empty[randInt(s, empty.length)]!;
  s.grid[cell] = nextFloat(s) < 0.9 ? 1 : 2;
}

/** Cell indices of each line, ordered in the direction tiles slide. */
function lines(dir: MergeDir): number[][] {
  const n = MERGE.size;
  const out: number[][] = [];
  for (let a = 0; a < n; a++) {
    const line: number[] = [];
    for (let b = 0; b < n; b++) {
      if (dir === 'left') line.push(a * n + b);
      if (dir === 'right') line.push(a * n + (n - 1 - b));
      if (dir === 'up') line.push(b * n + a);
      if (dir === 'down') line.push((n - 1 - b) * n + a);
    }
    out.push(line);
  }
  return out;
}

/** Slides the grid; returns points scored, or -1 if nothing moved. */
function slide(grid: number[], dir: MergeDir): number {
  let moved = false;
  let points = 0;
  for (const line of lines(dir)) {
    const tiles = line.map((i) => grid[i]!).filter(Boolean);
    const out: number[] = [];
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] === tiles[i + 1] && tiles[i]! < MAX_LEVEL) {
        const level = tiles[i]! + 1;
        out.push(level);
        points += 2 ** level;
        i++;
      } else out.push(tiles[i]!);
    }
    line.forEach((cell, k) => {
      const v = out[k] ?? 0;
      if (grid[cell] !== v) moved = true;
      grid[cell] = v;
    });
  }
  return moved ? points : -1;
}

const canMove = (grid: number[]) => MERGE_DIRS.some((d) => slide([...grid], d) >= 0);

export const merge: Game<MergeState, MergeMove> = {
  id: 'merge',
  limitMs: 180_000,
  par: 1500,
  init(seed) {
    const s: MergeState = { grid: Array<number>(MERGE.size ** 2).fill(0), rng: seed | 0, points: 0, moves: 0, over: false };
    spawn(s);
    spawn(s);
    return s;
  },
  parseMove: (m) => (typeof m === 'object' && m !== null && MERGE_DIRS.includes((m as MergeMove).dir) ? { dir: (m as MergeMove).dir } : null),
  move(s, { dir }) {
    if (s.over) return false;
    const grid = [...s.grid];
    const points = slide(grid, dir);
    if (points < 0) return false;
    s.grid = grid;
    s.points += points;
    s.moves++;
    spawn(s);
    if (!canMove(s.grid)) s.over = true;
    return true;
  },
  done: (s) => s.over,
  score: (s) => s.points,
};
