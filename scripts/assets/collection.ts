/**
 * M5 art: Collection Book decorations, rare animals and icons, drawn with a few shapes and an
 * automatic outline; plus recoloured variants (animal breeds, building skins, cups, medals) of
 * existing sprites. Recolours map colours to colours, so they stay inside the master palette.
 */
import type { SpriteDef } from './generated.js';
import { PALETTE, type PaletteKey } from './palette.js';

class Canvas {
  g: string[][];
  constructor(
    readonly w = 16,
    readonly h = 16,
  ) {
    this.g = Array.from({ length: h }, () => Array<string>(w).fill('.'));
  }
  px(x: number, y: number, c: PaletteKey): this {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.g[y]![x] = c;
    return this;
  }
  rect(x: number, y: number, w: number, h: number, c: PaletteKey): this {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, c);
    return this;
  }
  /** Filled ellipse centred on (cx, cy), measured from pixel centres. */
  oval(cx: number, cy: number, rx: number, ry: number, c: PaletteKey): this {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) if (((x - cx) / (rx + 0.5)) ** 2 + ((y - cy) / (ry + 0.5)) ** 2 <= 1) this.px(x, y, c);
    return this;
  }
  line(x0: number, y0: number, x1: number, y1: number, c: PaletteKey): this {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) this.px(Math.round(x0 + ((x1 - x0) * i) / (n || 1)), Math.round(y0 + ((y1 - y0) * i) / (n || 1)), c);
    return this;
  }
  /** A triangle given by its three corners (filled by scanning). */
  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: PaletteKey): this {
    const sign = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const d1 = sign(x, y, ax, ay, bx, by);
        const d2 = sign(x, y, bx, by, cx, cy);
        const d3 = sign(x, y, cx, cy, ax, ay);
        if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) this.px(x, y, c);
      }
    return this;
  }
  /** Outlines every shape: transparent pixels next to a filled one become `c`. */
  outline(c: PaletteKey = 'k'): this {
    const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < this.w && y < this.h && this.g[y]![x] !== '.' && this.g[y]![x] !== c;
    const marks: [number, number][] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (this.g[y]![x] === '.' && (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1))) marks.push([x, y]);
    for (const [x, y] of marks) this.g[y]![x] = c;
    return this;
  }
  def(name: string): SpriteDef {
    return { name, rows: this.g.map((r) => r.join('')) };
  }
}

const c = () => new Canvas();

// ---------------------------------------------------------------- decorations

function pot(name: string, petal: PaletteKey, centre: PaletteKey): SpriteDef {
  const k = c()
    .line(5, 6, 5, 9, 'N')
    .line(8, 4, 8, 9, 'N')
    .line(11, 7, 11, 9, 'N')
    .px(9, 7, 'n')
    .px(6, 8, 'n');
  for (const [x, y] of [[5, 5], [8, 3], [11, 6]] as const) k.oval(x, y, 1, 1, petal).px(x, y, centre);
  return k.rect(3, 10, 10, 1, 'B').rect(4, 11, 8, 4, 'b').rect(10, 11, 2, 4, 'o').rect(4, 11, 8, 1, 'B').outline().def(name);
}

function gnome(name: string, hat: PaletteKey, coat: PaletteKey): SpriteDef {
  return c()
    .tri(8, 0, 4, 6, 12, 6, hat)
    .rect(5, 6, 6, 2, 'p')
    .px(6, 6, 'k')
    .px(9, 6, 'k')
    .px(7, 7, 'P')
    .px(8, 7, 'P')
    .tri(4, 8, 11, 8, 8, 12, 'W')
    .rect(4, 10, 8, 4, coat)
    .tri(4, 8, 11, 8, 8, 11, 'W')
    .rect(4, 14, 3, 1, 'B')
    .rect(9, 14, 3, 1, 'B')
    .outline()
    .def(name);
}

const BIRDBATH = c().rect(2, 5, 12, 2, 'l').rect(3, 5, 10, 1, 's').rect(3, 7, 10, 1, 'g').rect(6, 8, 4, 5, 'l').rect(8, 8, 2, 5, 'g').rect(4, 13, 8, 2, 'g').outline().px(6, 3, 'S').outline().def('birdbath');

const LANTERN = c().rect(7, 6, 2, 9, 'B').rect(5, 14, 6, 1, 'G').rect(5, 2, 6, 5, 'y').rect(6, 3, 4, 3, 'W').rect(4, 1, 8, 1, 'G').rect(5, 7, 6, 1, 'G').outline().def('lantern');

const BENCH = c().rect(1, 4, 14, 2, 't').rect(1, 5, 14, 1, 'o').rect(1, 8, 14, 2, 't').rect(1, 9, 14, 1, 'o').rect(2, 6, 1, 2, 'B').rect(13, 6, 1, 2, 'B').rect(2, 10, 2, 4, 'B').rect(12, 10, 2, 4, 'B').outline().def('bench');

const MAILBOX = c().rect(7, 9, 2, 6, 'B').oval(8, 6, 5, 3, 'S').rect(3, 6, 11, 3, 'S').rect(3, 8, 11, 1, 'K').rect(4, 5, 2, 3, 'k').line(12, 2, 12, 5, 'G').rect(12, 2, 3, 2, 'r').outline().def('mailbox');

const BIRDHOUSE = c().rect(7, 11, 2, 4, 'B').rect(4, 5, 8, 6, 't').rect(10, 5, 2, 6, 'o').tri(8, 1, 2, 6, 13, 6, 'R').oval(8, 8, 1, 1, 'k').px(8, 10, 'B').outline().def('birdhouse');

const BUNTING = (() => {
  const k = c().rect(1, 2, 1, 13, 'B').rect(14, 2, 1, 13, 'B');
  const flags: [number, PaletteKey][] = [[2, 'r'], [5, 'y'], [8, 'S'], [11, 'n']];
  for (const [x, col] of flags) k.tri(x, 4, x + 2, 4, x + 1, 8, col);
  k.outline();
  return k.line(1, 3, 14, 3, 'G').def('bunting');
})();

function balloon(name: string, col: PaletteKey, shade: PaletteKey): SpriteDef {
  return c().oval(8, 5, 4, 4, col).oval(9, 6, 3, 3, shade).oval(8, 5, 3, 3, col).px(6, 3, 'W').px(6, 4, 'W').px(7, 3, 'W').rect(7, 10, 2, 1, shade).outline().line(8, 12, 7, 15, 'g').def(name);
}

function pinwheel(name: string, col: PaletteKey, shade: PaletteKey): SpriteDef {
  return c()
    .rect(7, 8, 2, 7, 'B')
    .tri(8, 6, 8, 1, 12, 1, col)
    .tri(8, 6, 13, 6, 13, 10, shade)
    .tri(8, 6, 8, 11, 4, 11, col)
    .tri(8, 6, 3, 6, 3, 2, shade)
    .px(8, 6, 'y')
    .outline()
    .def(name);
}

function kite(name: string, col: PaletteKey, shade: PaletteKey): SpriteDef {
  return c()
    .tri(8, 0, 3, 5, 13, 5, col)
    .tri(3, 5, 13, 5, 8, 11, shade)
    .line(8, 1, 8, 10, 'W')
    .line(4, 5, 12, 5, 'W')
    .outline()
    .line(8, 12, 9, 15, 'G')
    .px(7, 13, 'y')
    .px(10, 14, 'r')
    .def(name);
}

function flag(name: string, col: PaletteKey, shade: PaletteKey): SpriteDef {
  return c().rect(3, 1, 1, 14, 'g').rect(2, 14, 3, 1, 'G').rect(4, 2, 10, 6, col).rect(4, 4, 10, 2, 'W').rect(4, 7, 10, 1, shade).outline().def(name);
}

// ---------------------------------------------------------------- rare animals and icons

const PIGLET = c()
  .oval(7, 9, 5, 3, 'q')
  .oval(7, 10, 4, 2, 'q')
  .rect(12, 8, 2, 3, 'P')
  .px(13, 9, 'B')
  .tri(9, 4, 11, 6, 8, 7, 'q')
  .rect(3, 12, 2, 2, 'q')
  .rect(9, 12, 2, 2, 'q')
  .px(1, 8, 'q')
  .outline()
  .px(10, 8, 'k')
  .def('piglet');

const BUNNY = c()
  .oval(7, 11, 5, 3, 'w')
  .oval(10, 8, 3, 3, 'w')
  .rect(8, 1, 2, 6, 'w')
  .rect(11, 2, 2, 5, 'w')
  .px(8, 2, 'q')
  .px(8, 3, 'q')
  .px(11, 3, 'q')
  .px(11, 4, 'q')
  .oval(2, 10, 1, 1, 'W')
  .outline()
  .px(11, 8, 'k')
  .px(13, 9, 'q')
  .def('bunny');

const GOLDEN_SEED = c().tri(8, 2, 4, 9, 12, 9, 'y').oval(8, 10, 4, 4, 'y').oval(9, 11, 3, 3, 'Y').oval(8, 10, 3, 3, 'y').rect(6, 8, 1, 3, 'W').px(7, 6, 'W').outline().px(13, 2, 'y').px(12, 3, 'W').px(14, 3, 'W').px(13, 4, 'y').px(2, 5, 'W').def('golden-seed');

const BOOK = c().rect(2, 2, 12, 12, 'r').rect(12, 3, 2, 11, 'W').rect(2, 13, 11, 1, 'w').rect(2, 2, 2, 11, 'R').oval(8, 7, 2, 2, 'y').px(8, 7, 'W').outline().def('book');

const MEDAL = c().tri(4, 0, 8, 0, 8, 7, 'S').tri(8, 0, 12, 0, 8, 7, 'r').oval(8, 10, 4, 4, 'y').oval(9, 11, 3, 3, 'Y').oval(8, 10, 3, 3, 'y').px(8, 10, 'W').px(7, 10, 'W').px(8, 9, 'W').px(9, 10, 'W').px(8, 11, 'W').outline().def('medal');

export const COLLECTION_SPRITES: SpriteDef[] = [
  pot('pot-red', 'r', 'y'),
  pot('pot-yellow', 'y', 'B'),
  pot('pot-blue', 'S', 'y'),
  gnome('gnome-red', 'r', 'S'),
  gnome('gnome-blue', 'S', 'N'),
  BIRDBATH,
  LANTERN,
  BENCH,
  MAILBOX,
  BIRDHOUSE,
  BUNTING,
  balloon('balloon-red', 'r', 'R'),
  balloon('balloon-blue', 'S', 'K'),
  pinwheel('pinwheel-red', 'r', 'W'),
  pinwheel('pinwheel-blue', 'S', 'W'),
  kite('kite-red', 'r', 'R'),
  kite('kite-blue', 'S', 'K'),
  flag('flag-red', 'r', 'R'),
  flag('flag-blue', 'S', 'K'),
  PIGLET,
  BUNNY,
  GOLDEN_SEED,
  BOOK,
  MEDAL,
];

// ---------------------------------------------------------------- recolours

/** A copy of sprite `from` with colours swapped (hex → hex, or palette keys); `maxRow` limits it to the top rows. */
export interface Recolour {
  name: string;
  from: string;
  map: Record<string, string>;
  maxRow?: number;
}

const hexOf = (v: string) => (v.startsWith('#') ? v : PALETTE[v as PaletteKey]!);
const keys = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([a, b]) => [hexOf(a), hexOf(b)]));
const re = (name: string, from: string, map: Record<string, string>, maxRow?: number): Recolour => ({ name, from, map: keys(map), maxRow });

// Kenney colours outside our palette keys (all in the master palette).
const SLATE = '#52607c';
const DEEP = '#3e4e6e';
const SALMON = '#f28462';
const SNOUT = '#f7c282';
const SNOUT2 = '#e19a65';

export const RECOLOURS: Recolour[] = [
  // Chickens: white body W, shade l.
  re('hen-white', 'chicken', {}),
  re('hen-brown', 'chicken', { W: 't', l: 'b' }),
  re('hen-black', 'chicken', { W: 'G', l: DEEP }),
  re('hen-speckled', 'chicken', { W: 'T', l: 'o' }),
  re('rooster', 'chicken', { W: 'Y', l: 'b' }),
  re('hen-golden', 'chicken', { W: 'y', l: 'Y', Y: 'o' }),
  // Sheep: wool W/l, face G/DEEP.
  re('sheep-white', 'sheep', {}),
  re('sheep-cream', 'sheep', { W: 'T', l: 't' }),
  re('sheep-grey', 'sheep', { W: 'l', l: 'g' }),
  re('sheep-brown', 'sheep', { W: 'b', l: 'B' }),
  re('ram', 'sheep', { G: 'b', [DEEP]: 'B' }),
  re('sheep-black', 'sheep', { W: 'K', l: DEEP, G: 'g', [DEEP]: 'G' }),
  // Cows: white W, spots g/l, snout.
  re('cow-spotted', 'cow', {}),
  re('cow-brown', 'cow', { g: 'b', l: 't' }),
  re('cow-black', 'cow', { g: 'K', l: 'G' }),
  re('cow-red', 'cow', { g: 'R', l: SALMON }),
  re('cow-highland', 'cow', { W: 'Y', l: 'o', g: 'b', [SNOUT]: 'T', [SNOUT2]: 'P' }),
  // Beehives: y/Y.
  re('bees-honey', 'beehive', {}),
  re('bees-meadow', 'beehive', { y: 'n', Y: 'N' }),
  re('bees-forest', 'beehive', { y: 'b', Y: 'B' }),
  re('bees-mountain', 'beehive', { y: 'l', Y: 'g' }),
  re('bees-royal', 'beehive', { y: 's', Y: 'S' }),
  // Barns (the grass at the bottom stays).
  re('barn-blue', 'barn-icon', { r: 'S', R: 'K' }, 12),
  re('barn-green', 'barn-icon', { r: 'n', R: 'N' }, 12),
  re('barn-yellow', 'barn-icon', { r: 'y', R: 'Y', y: 'B' }, 12),
  re('barn-stone', 'barn-icon', { r: 'g', R: 'G' }, 12),
  re('barn-wood', 'barn-icon', { r: 'b', R: 'B', b: 'o' }, 12),
  // Windmills: body t/T/o, roof r/R.
  re('windmill-blue', 'windmill', { r: 'S', R: 'K' }),
  re('windmill-green', 'windmill', { r: 'n', R: 'N' }),
  re('windmill-yellow', 'windmill', { r: 'y', R: 'Y' }),
  re('windmill-stone', 'windmill', { t: 'l', T: 'w', o: 'g', r: 'G', R: 'K' }),
  re('windmill-brown', 'windmill', { t: 'b', T: 't', o: 'B' }),
  // Fences: three tiles each; Kenney wood is t/b/B.
  ...(['l', 'm', 'r'] as const).flatMap((part) => [
    re(`fence-white-${part}`, `fence-${part}`, { t: 'W', b: 'l', B: 'g' }),
    re(`fence-blue-${part}`, `fence-${part}`, { t: 's', b: 'S', B: SLATE }),
    re(`fence-green-${part}`, `fence-${part}`, { t: 'n', b: 'N', B: DEEP }),
    re(`fence-red-${part}`, `fence-${part}`, { t: SALMON, b: 'r', B: 'R' }),
    re(`fence-yellow-${part}`, `fence-${part}`, { t: 'y', b: 'Y', B: 'b' }),
  ]),
  // Weekly cups and achievement medals.
  re('cup-bronze', 'trophy', { y: 'b', Y: 'B', W: 't' }),
  re('cup-silver', 'trophy', { y: 'l', Y: 'g' }),
  re('cup-gold', 'trophy', {}),
  re('cup-diamond', 'trophy', { y: 's', Y: 'S' }),
  re('medal-bronze', 'medal', { y: 'b', Y: 'B' }),
  re('medal-silver', 'medal', { y: 'l', Y: 'g' }),
  re('medal-gold', 'medal', {}),
];
