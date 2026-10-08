import { describe, expect, it } from 'vitest';
import { nextFloat } from '../sim/rng.js';
import {
  EGGS,
  GAMES,
  GAME_IDS,
  GameSession,
  MERGE_DIRS,
  PEXESO,
  PIPES,
  RUSH,
  dailyGame,
  eggs,
  flow,
  merge,
  pexeso,
  pipes,
  popupAt,
  replay,
  rush,
  solveEggs,
  type GameId,
} from './index.js';

const SEEDS = 1000;

/** A random move for each game, sometimes illegal, the way a child's taps can be. */
function randomMove(id: GameId, r: { rng: number }): unknown {
  const pick = (n: number) => Math.floor(nextFloat(r) * n);
  switch (id) {
    case 'pexeso':
      return { flip: pick(PEXESO.cards) };
    case 'pipes':
      return { rotate: pick(PIPES.w * PIPES.h) };
    case 'merge':
      return { dir: MERGE_DIRS[pick(4)] };
    case 'rush':
      return { tap: pick(RUSH.cols * RUSH.rows) };
    case 'eggs':
      return { from: pick(EGGS.baskets), to: pick(EGGS.baskets) };
  }
}

describe('server replay equals the client score (M3 exit)', () => {
  for (const id of GAME_IDS) {
    it(`${id}: ${SEEDS} random seeds`, () => {
      const game = GAMES[id];
      const r = { rng: 99 };
      for (let i = 0; i < SEEDS; i++) {
        const seed = (nextFloat(r) * 2 ** 32) >>> 0;
        const client = new GameSession(game, seed);
        let at = 0;
        const moves = 20 + Math.floor(nextFloat(r) * 200);
        for (let k = 0; k < moves && !client.over; k++) {
          at += Math.floor(nextFloat(r) * 900) + 40;
          client.move(randomMove(id, r), at);
        }
        // The log travels as JSON.
        const server = replay(game, seed, JSON.parse(JSON.stringify(client.log)));
        expect(server, `${id} seed ${seed}`).toEqual(client.result());
      }
    });
  }

  it('rejects malformed logs', () => {
    expect(() => replay(pexeso, 1, 'nope')).toThrow();
    expect(() => replay(pexeso, 1, [[5, { flip: 99 }]])).toThrow();
    expect(() => replay(pexeso, 1, [[5, { flip: 1 }], [4, { flip: 2 }]])).toThrow(/time/);
    expect(() => replay(rush, 1, [[31_000, { tap: 1 }]])).toThrow(/time/);
    expect(() => replay(merge, 1, [[1.5, { dir: 'up' }]])).toThrow(/time/);
  });
});

describe('a 7-year-old can finish every board', () => {
  const KID_MS = 2000; // one move every 2 s

  it('pexeso: a player with a fair memory finishes in time', () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const s = new GameSession(pexeso, seed);
      const seen = new Map<number, number>(); // position -> face
      let at = 0;
      const flip = (i: number) => {
        s.move({ flip: i }, (at += KID_MS));
        seen.set(i, s.state.cards[i]!);
      };
      while (!s.over) {
        const open = (i: number) => !s.state.matched[i];
        const known = [...seen].filter(([i]) => open(i));
        const pair = known.find(([i, f]) => known.some(([j, g]) => j !== i && g === f));
        if (pair) {
          const other = known.find(([j, g]) => j !== pair[0] && g === pair[1])!;
          flip(pair[0]);
          flip(other[0]);
          continue;
        }
        const unknown = Array.from({ length: PEXESO.cards }, (_, i) => i).filter((i) => open(i) && !seen.has(i));
        flip(unknown[0]!);
        const face = s.state.cards[unknown[0]!]!;
        const match = known.find(([, f]) => f === face);
        flip(match ? match[0] : unknown[1]!);
      }
      expect(s.result().done).toBe(true);
      expect(at).toBeLessThan(pexeso.limitMs);
    }
  });

  it('pipes: the solution takes few turns, and the board starts unsolved', () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const s = new GameSession(pipes, seed);
      expect(flow(s.state).solved).toBe(false);
      let at = 0;
      // Turn every tile back to its original orientation.
      s.state.rots.forEach((rot, i) => {
        for (let q = rot; q % 4 !== 0; q++) s.move({ rotate: i }, (at += KID_MS));
      });
      expect(s.result().done).toBe(true);
      expect(at).toBeLessThan(pipes.limitMs);
    }
  });

  it('eggs: every board is solvable in kid time', () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const s = new GameSession(eggs, seed);
      const solution = solveEggs(s.state.baskets.map((b) => [...b]))!;
      let at = 0;
      for (const m of solution) s.move(m, (at += KID_MS));
      expect(s.result().done, `seed ${seed}`).toBe(true);
      expect(at).toBeLessThan(eggs.limitMs);
    }
  });

  it('rush: tapping only ripe crops scores well; pop-ups never overlap in a cell', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = new GameSession(rush, seed);
      for (const p of s.state.popups) {
        if (p.kind === 'ripe') s.move({ tap: p.cell }, p.from + 700); // a slow reaction
      }
      expect(s.state.misses).toBe(0);
      expect(s.result().score).toBeGreaterThanOrEqual(rush.par * 0.8);
      for (const p of s.state.popups) expect(popupAt(s.state, p.cell, p.from)).toBe(s.state.popups.indexOf(p));
    }
  });

  it('merge: always ends or runs to the time limit', () => {
    const s = new GameSession(merge, 5);
    let at = 0;
    for (let k = 0; k < 2000 && !s.over; k++) s.move({ dir: MERGE_DIRS[k % 4]! }, (at += 100));
    expect(s.over).toBe(true);
    expect(s.result().score).toBeGreaterThan(0);
  });
});

describe('daily rotation', () => {
  it('cycles through all five games, one per day', () => {
    const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];
    expect(new Set(days.map(dailyGame)).size).toBe(5);
    expect(dailyGame('2026-10-10')).toBe(dailyGame('2026-10-05'));
  });
});
