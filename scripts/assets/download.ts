/**
 * Downloads the Kenney packs, verifies their bundled license is CC0, and keeps only the
 * tilesheet + License.txt in assets/vendor/<id>/ (committed, so builds never hit the network).
 *   pnpm assets:download
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PACKS } from './packs.js';
import { ROOT } from './paths.js';

for (const pack of PACKS) {
  const tmp = mkdtempSync(join(tmpdir(), `pf-${pack.id}-`));
  try {
    const res = await fetch(pack.zip);
    if (!res.ok) throw new Error(`${pack.id}: HTTP ${res.status}`);
    writeFileSync(join(tmp, 'pack.zip'), Buffer.from(await res.arrayBuffer()));
    execFileSync('unzip', ['-q', join(tmp, 'pack.zip'), '-d', join(tmp, 'x')]);
    const license = readFileSync(join(tmp, 'x', 'License.txt'), 'utf8');
    if (!/Creative Commons Zero|CC0/i.test(license)) throw new Error(`${pack.id}: License.txt is not CC0, refusing to use it`);
    const out = join(ROOT, 'assets', 'vendor', pack.id);
    mkdirSync(out, { recursive: true });
    copyFileSync(join(tmp, 'x', pack.sheet), join(out, 'sheet.png'));
    copyFileSync(join(tmp, 'x', 'License.txt'), join(out, 'License.txt'));
    console.log(`${pack.id}: ok (CC0)`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
