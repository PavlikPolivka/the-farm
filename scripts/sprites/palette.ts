/**
 * Master palette. Temporary until M1 extracts the palette from the Kenney pack;
 * every generated sprite must use only these colours (see docs/DESIGN.md, "Visual consistency").
 */
export const PALETTE = {
  _: null, // transparent
  k: '#1b1b1f', // outline
  r: '#b13e53', // barn red
  d: '#7a2a3a', // barn red, shade
  w: '#f4f4f4', // trim white
  y: '#ffcd75', // straw / window light
  b: '#5d3a1a', // wood brown
  g: '#38b764', // grass
  G: '#257179', // grass, shade
  s: '#73eff7', // sky
} as const;

export type PaletteKey = keyof typeof PALETTE;

export function hexToRgba(hex: string): [number, number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}
