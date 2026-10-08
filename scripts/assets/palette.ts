/**
 * Palette for generated sprites. Every colour must exist in the Kenney sheets' master palette;
 * build.ts extracts that palette and fails the build on any colour outside it.
 */
export const PALETTE = {
  _: null, // transparent
  k: '#3f2631', // outline (Kenney's warm near-black)
  K: '#262b44', // navy shadow
  W: '#ffffff', // white
  w: '#ebeff8', // off-white
  l: '#c0cbdc', // light grey
  g: '#8b9bb4', // grey
  G: '#5a6988', // dark grey
  b: '#bd6c4a', // brown
  B: '#763b36', // dark brown
  t: '#eaa56c', // tan wood
  T: '#fec99c', // light tan
  o: '#cf8254', // wood shade
  r: '#c34b35', // red
  R: '#aa2c23', // dark red
  y: '#fdbe53', // yellow
  Y: '#e38628', // orange
  n: '#84c669', // grass green
  N: '#4e974c', // dark green
  p: '#fdd6b4', // skin
  P: '#dfa988', // skin shade
  s: '#99d8f8', // sky
  S: '#79a7e8', // blue
  q: '#f28462', // pink (pigs, bunny ears)
} as const;

export type PaletteKey = keyof typeof PALETTE;

export function hexToRgba(hex: string): [number, number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}
