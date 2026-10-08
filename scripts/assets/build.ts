/**
 * Asset pipeline:
 *  - slices named tiles from the committed Kenney sheets (assets/vendor),
 *  - renders generated sprites, checking they only use the sheets' master palette,
 *  - composes PWA icons,
 *  - writes assets/manifest.json, CREDITS.md and client/public/credits.json,
 *  - writes assets/.preview/contact.png (every sprite at 4x) for a quick visual check.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import { PACKS } from './packs.js';
import { PALETTE, hexToRgba, type PaletteKey } from './palette.js';
import { GENERATED, assertValid, type SpriteDef } from './generated.js';
import { TILES } from './tiles.js';
import { PUBLIC, ROOT } from './paths.js';

const hex = (d: Buffer | Uint8Array, i: number) =>
  '#' + [0, 1, 2].map((k) => d[i + k]!.toString(16).padStart(2, '0')).join('');

function write(path: string, png: PNG): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(png));
}

// ---- vendor sheets and master palette
const sheets = new Map(PACKS.map((p) => [p.id, PNG.sync.read(readFileSync(join(ROOT, 'assets', 'vendor', p.id, 'sheet.png')))]));
const master = new Set<string>();
for (const png of sheets.values())
  for (let i = 0; i < png.data.length; i += 4) if (png.data[i + 3] === 255) master.add(hex(png.data, i));
for (const [key, value] of Object.entries(PALETTE))
  if (value && !master.has(value)) throw new Error(`palette key "${key}" = ${value} is not in the Kenney master palette`);

interface Entry {
  file: string;
  source: string;
  pack: string;
  license: string;
}
const manifest: Entry[] = [];
const sprites = new Map<string, PNG>();

// ---- slice tiles
for (const [name, { pack, index }] of Object.entries(TILES)) {
  const def = PACKS.find((p) => p.id === pack)!;
  const sheet = sheets.get(pack)!;
  const sx = (index % def.columns) * def.tile;
  const sy = Math.floor(index / def.columns) * def.tile;
  if (sy + def.tile > sheet.height) throw new Error(`${name}: index ${index} is outside ${pack}`);
  const png = new PNG({ width: def.tile, height: def.tile });
  PNG.bitblt(sheet, png, sx, sy, def.tile, def.tile, 0, 0);
  sprites.set(name, png);
  manifest.push({ file: `sprites/${name}.png`, source: def.page, pack: `${def.author} — ${def.name} (tile ${index})`, license: 'CC0-1.0' });
}

// ---- generated sprites
const keys = Object.keys(PALETTE);
function render(def: SpriteDef): PNG {
  assertValid(def, keys);
  const png = new PNG({ width: def.rows[0]!.length, height: def.rows.length });
  png.data.fill(0);
  def.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const c = PALETTE[ch as PaletteKey];
      if (c) png.data.set(hexToRgba(c), (y * png.width + x) * 4);
    }),
  );
  return png;
}
for (const def of GENERATED) {
  sprites.set(def.name, render(def));
  manifest.push({ file: `sprites/${def.name}.png`, source: 'scripts/assets/generated.ts', pack: 'Pixel Farm (generated)', license: 'CC0-1.0' });
}

for (const [name, png] of sprites) write(join(PUBLIC, 'sprites', `${name}.png`), png);

// ---- icons: integer scale, centred; maskable keeps the art inside the 80% safe zone
function icon(src: PNG, scale: number, size: number, bg: string | null): PNG {
  const png = new PNG({ width: size, height: size });
  png.data.fill(0);
  if (bg) for (let i = 0; i < size * size; i++) png.data.set(hexToRgba(bg), i * 4);
  const ox = Math.floor((size - src.width * scale) / 2);
  const oy = Math.floor((size - src.height * scale) / 2);
  for (let y = 0; y < src.height * scale; y++)
    for (let x = 0; x < src.width * scale; x++) {
      const si = (Math.floor(y / scale) * src.width + Math.floor(x / scale)) * 4;
      if (src.data[si + 3]) png.data.set(src.data.subarray(si, si + 4), ((oy + y) * size + ox + x) * 4);
    }
  return png;
}
const barn = sprites.get('barn-icon')!;
const sky = PALETTE.s;
write(join(PUBLIC, 'icons', 'icon-192.png'), icon(barn, 10, 192, sky));
write(join(PUBLIC, 'icons', 'icon-512.png'), icon(barn, 28, 512, sky));
write(join(PUBLIC, 'icons', 'maskable-512.png'), icon(barn, 22, 512, sky));
write(join(PUBLIC, 'icons', 'apple-touch-icon-180.png'), icon(barn, 10, 180, sky));
write(join(PUBLIC, 'favicon.png'), icon(barn, 2, 32, null));

// ---- contact sheet for review (not shipped)
{
  const S = 4;
  const cell = 34 * S;
  const cols = 10;
  const list = [...sprites.values()];
  const sheet = new PNG({ width: cols * cell, height: Math.ceil(list.length / cols) * cell });
  for (let i = 0; i < sheet.width * sheet.height; i++) sheet.data.set(hexToRgba('#c6e58d'), i * 4);
  list.forEach((png, n) => {
    const big = icon(png, S, cell, null);
    const ox = (n % cols) * cell;
    const oy = Math.floor(n / cols) * cell;
    for (let y = 0; y < cell; y++)
      for (let x = 0; x < cell; x++) {
        const si = (y * cell + x) * 4;
        if (big.data[si + 3]) sheet.data.set(big.data.subarray(si, si + 4), ((oy + y) * sheet.width + ox + x) * 4);
      }
  });
  write(join(ROOT, 'assets', '.preview', 'contact.png'), sheet);
  writeFileSync(join(ROOT, 'assets', '.preview', 'contact.txt'), [...sprites.keys()].join('\n') + '\n');
}

// ---- manifest + credits
manifest.sort((a, b) => a.file.localeCompare(b.file));
writeFileSync(join(ROOT, 'assets', 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const credits = PACKS.map((p) => ({ name: `${p.author} — ${p.name}`, url: p.page, license: 'CC0 1.0' }));
writeFileSync(join(PUBLIC, 'credits.json'), JSON.stringify(credits, null, 2) + '\n');
writeFileSync(
  join(ROOT, 'CREDITS.md'),
  [
    '# Credits',
    '',
    'Generated by `pnpm assets` from `assets/manifest.json`. All third-party art is CC0 (public domain).',
    '',
    ...credits.map((c) => `- [${c.name}](${c.url}) — ${c.license}`),
    '- Additional sprites drawn by Claude Code in the same palette (`scripts/assets/generated.ts`) — CC0 1.0',
    '',
  ].join('\n'),
);

console.log(`assets: ${sprites.size} sprites (${Object.keys(TILES).length} sliced, ${GENERATED.length} generated), master palette ${master.size} colours`);
