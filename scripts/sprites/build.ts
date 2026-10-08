/**
 * Renders palette-indexed sprite grids to PNG with nearest-neighbour scaling,
 * and composes the PWA icons. Output goes to client/public so Vite copies it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { PALETTE, hexToRgba, type PaletteKey } from './palette.js';
import { BARN, SPRITES, assertValid, type SpriteDef } from './sprites.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'client', 'public');

function render(def: SpriteDef, scale: number, size = def.rows[0]!.length * scale, bg?: string): PNG {
  const w = def.rows[0]!.length * scale;
  const h = def.rows.length * scale;
  const png = new PNG({ width: size, height: size });
  const fill = bg ? hexToRgba(bg) : [0, 0, 0, 0];
  for (let i = 0; i < size * size; i++) png.data.set(fill, i * 4);
  const ox = Math.floor((size - w) / 2);
  const oy = Math.floor((size - h) / 2);
  def.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const hex = PALETTE[ch as PaletteKey];
      if (!hex) return;
      const rgba = hexToRgba(hex);
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) png.data.set(rgba, ((oy + y * scale + dy) * size + ox + x * scale + dx) * 4);
    }),
  );
  return png;
}

function write(path: string, png: PNG): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(png));
}

const keys = Object.keys(PALETTE);
for (const def of SPRITES) {
  assertValid(def, keys);
  write(join(out, 'sprites', `${def.name}.png`), render(def, 1));
}

// Icons: integer scale only, centred on the sky colour. Maskable keeps the art inside the 80% safe zone.
const sky = PALETTE.s;
write(join(out, 'icons', 'icon-192.png'), render(BARN, 10, 192, sky));
write(join(out, 'icons', 'icon-512.png'), render(BARN, 28, 512, sky));
write(join(out, 'icons', 'maskable-512.png'), render(BARN, 22, 512, sky));
write(join(out, 'icons', 'apple-touch-icon-180.png'), render(BARN, 10, 180, sky));
write(join(out, 'favicon.png'), render(BARN, 2, 32));

console.log(`sprites: wrote ${SPRITES.length} sprites and 5 icons to client/public`);
