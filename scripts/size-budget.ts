/**
 * Size budget (docs/DESIGN.md, M6): the first load may be at most 5 MB. The service worker
 * precaches the whole app on first visit, so everything in client/dist counts.
 *   pnpm size   (after pnpm build; CI runs it too)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = join(import.meta.dirname, '..', 'client', 'dist');
const BUDGET = 5 * 1024 * 1024;

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));

const all = files(DIST);
const groups = new Map<string, { files: number; bytes: number; gzip: number }>();
let bytes = 0;
let gzip = 0;
for (const f of all) {
  const data = readFileSync(f);
  // PNGs are already compressed; text gets gzipped on the wire.
  const wire = f.endsWith('.png') ? data.length : gzipSync(data).length;
  const group = relative(DIST, f).split('/')[0]!.replace(/^[^/]*\.(html|js|json|webmanifest|png)$/, '(root)');
  const g = groups.get(group) ?? { files: 0, bytes: 0, gzip: 0 };
  g.files++;
  g.bytes += data.length;
  g.gzip += wire;
  groups.set(group, g);
  bytes += data.length;
  gzip += wire;
}
const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
console.table(Object.fromEntries([...groups].map(([k, g]) => [k, { files: g.files, size: kb(g.bytes), 'over the wire': kb(g.gzip) }])));
console.log(`total ${kb(bytes)} (${kb(gzip)} over the wire), budget ${kb(BUDGET)}`);
if (bytes > BUDGET) {
  console.error('over the size budget');
  process.exit(1);
}
