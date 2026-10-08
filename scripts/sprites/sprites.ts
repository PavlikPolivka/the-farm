import type { PaletteKey } from './palette.js';

/** A sprite is a grid of palette keys, one character per pixel. */
export interface SpriteDef {
  name: string;
  rows: string[];
}

export const BARN: SpriteDef = {
  name: 'barn',
  rows: [
    '______kkkk______',
    '____kkrrrrkk____',
    '__kkrrrrrrrrkk__',
    '_krrrrrrrrrrrrk_',
    'kwwwwwwwwwwwwwwk',
    '_krrrrrrrrrrrrk_',
    '_krrkkkkkkkkrrk_',
    '_krrkyywwyykrrk_',
    '_krdkywyywykdrk_',
    '_krdkwyyyywkdrk_',
    '_krdkywyywykdrk_',
    '_krdkyywwyykdrk_',
    '_krdkbbbbbbkdrk_',
    'gkkkkkkkkkkkkkkg',
    'gggGgggggGgggggg',
    'GgggggGggggggGgg',
  ],
};

export const GRASS: SpriteDef = {
  name: 'grass',
  rows: [
    'gggggggggggggggg',
    'gggGgggggggGgggg',
    'gggggggggggggggg',
    'ggggggGgggggggGg',
    'gGgggggggggggggg',
    'gggggggggGgggggg',
    'gggggggggggggggg',
    'gggGgggggggggGgg',
    'gggggggGgggggggg',
    'gggggggggggggggg',
    'gGgggggggggGgggg',
    'gggggggggggggggg',
    'ggggggGggggggggg',
    'gggggggggggggGgg',
    'ggGggggggggggggg',
    'gggggggggGgggggg',
  ],
};

export const SPRITES: SpriteDef[] = [BARN, GRASS];

export function assertValid(def: SpriteDef, keys: readonly string[]): void {
  const width = def.rows[0]!.length;
  def.rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`${def.name}: row ${y} has width ${row.length}, expected ${width}`);
    for (const ch of row) if (!keys.includes(ch)) throw new Error(`${def.name}: unknown palette key "${ch}"`);
  });
}

export type { PaletteKey };
