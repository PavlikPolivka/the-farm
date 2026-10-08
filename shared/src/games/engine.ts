/**
 * The minigame engine contract (docs/DESIGN.md, "Minigames and daily challenge").
 *
 * A game is a pure state machine: `init(seed)` builds the board, `move(state, move, at)` applies
 * one input at `at` ms after the start. The client records every input as it plays; the server
 * replays that log through the same code and computes the score itself. Nothing reads the
 * clock or Math.random, so a log replays to the same score anywhere.
 */
import { nextFloat } from '../sim/rng.js';

export const GAME_IDS = ['pexeso', 'pipes', 'merge', 'rush', 'eggs'] as const;
export type GameId = (typeof GAME_IDS)[number];

export interface Game<S, M> {
  id: GameId;
  /** Inputs after this many ms are ignored; the client ends the game there. */
  limitMs: number;
  /** A score a 7-year-old reaches on a good run; rewards scale with score / par. */
  par: number;
  init(seed: number): S;
  /** Validates an untrusted move; null if malformed. */
  parseMove(raw: unknown): M | null;
  /** Applies a move. Returns false if it had no effect (not allowed right now). */
  move(s: S, m: M, at: number): boolean;
  done(s: S): boolean;
  score(s: S): number;
}

/** One recorded input: [ms since start, move]. */
export type LogEntry<M = unknown> = [number, M];

export const MAX_LOG = 3000;

export interface ReplayResult {
  score: number;
  done: boolean;
}

/**
 * Plays a game while recording its log. The client drives this; `replay` runs the same steps,
 * so the two can't disagree.
 */
export class GameSession<S, M> {
  readonly state: S;
  readonly log: LogEntry<M>[] = [];
  private lastAt = 0;

  constructor(
    readonly game: Game<S, M>,
    readonly seed: number,
  ) {
    this.state = game.init(seed);
  }

  get over(): boolean {
    return this.game.done(this.state) || this.lastAt >= this.game.limitMs || this.log.length >= MAX_LOG;
  }

  /** Applies a move at `at` ms; returns whether the game accepted it. */
  move(m: M, at: number): boolean {
    at = Math.max(this.lastAt, Math.floor(at));
    if (this.over || at > this.game.limitMs) return false;
    this.lastAt = at;
    this.log.push([at, m]);
    return this.game.move(this.state, m, at);
  }

  result(): ReplayResult {
    return { score: this.game.score(this.state), done: this.game.done(this.state) };
  }
}

/** Server side: replays an untrusted log. Throws on a malformed log. */
export function replay<S, M>(game: Game<S, M>, seed: number, raw: unknown): ReplayResult {
  if (!Array.isArray(raw) || raw.length > MAX_LOG) throw new Error('bad log');
  const session = new GameSession(game, seed);
  let last = 0;
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length !== 2) throw new Error('bad log entry');
    const [at, rawMove] = entry as [unknown, unknown];
    if (typeof at !== 'number' || !Number.isInteger(at) || at < last || at > game.limitMs) throw new Error('bad log time');
    last = at;
    const m = game.parseMove(rawMove);
    if (m === null) throw new Error('bad move');
    if (session.over) break;
    session.move(m, at);
  }
  return session.result();
}

// ---------------------------------------------------------------- helpers for the games

export const rng = (seed: number) => ({ rng: seed | 0 });
export type Rng = { rng: number };
export const randInt = (r: Rng, n: number) => Math.floor(nextFloat(r) * n);

export function shuffle<T>(r: Rng, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = randInt(r, i + 1);
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list;
}

export const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Bonus for finishing fast: `max` at 0 s, minus `perSec` for every second. */
export const timeBonus = (atMs: number, max: number, perSec: number) => Math.max(0, max - Math.floor(atMs / 1000) * perSec);
