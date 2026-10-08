import { dayNumber } from '../time.js';
import { GAME_IDS, type Game, type GameId } from './engine.js';
import { eggs } from './eggs.js';
import { merge } from './merge.js';
import { pexeso } from './pexeso.js';
import { pipes } from './pipes.js';
import { rush } from './rush.js';

export * from './engine.js';
export * from './eggs.js';
export * from './merge.js';
export * from './pexeso.js';
export * from './pipes.js';
export * from './rush.js';

// Each game has its own state and move types; callers go through the Game interface.
export const GAMES: Record<GameId, Game<unknown, unknown>> = {
  pexeso: pexeso as Game<unknown, unknown>,
  pipes: pipes as Game<unknown, unknown>,
  merge: merge as Game<unknown, unknown>,
  rush: rush as Game<unknown, unknown>,
  eggs: eggs as Game<unknown, unknown>,
};

/** The featured daily game rotates through all five, one per Prague day. */
export const dailyGame = (day: string): GameId => GAME_IDS[((dayNumber(day) % GAME_IDS.length) + GAME_IDS.length) % GAME_IDS.length]!;
