import type { GameId } from '@pixel-farm/shared';
import { eggsBoard } from './eggs.js';
import { mergeBoard } from './merge.js';
import { pexesoBoard } from './pexeso.js';
import { pipesBoard } from './pipes.js';
import { rushBoard } from './rush.js';
import type { Renderer } from './types.js';

export const BOARDS: Record<GameId, Renderer<unknown, unknown>> = {
  pexeso: pexesoBoard as Renderer<unknown, unknown>,
  pipes: pipesBoard as Renderer<unknown, unknown>,
  merge: mergeBoard as Renderer<unknown, unknown>,
  rush: rushBoard as Renderer<unknown, unknown>,
  eggs: eggsBoard as Renderer<unknown, unknown>,
};

/** Icon per game, for the games sheet and boards. */
export const GAME_ICON: Record<GameId, string> = {
  pexeso: 'card-back',
  pipes: 'pipe-corner-wet',
  merge: 'wheat-1',
  rush: 'carrot-3',
  eggs: 'egg-0',
};
