import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { openDb } from './db.js';
import { nightlyBackup } from './backup.js';

// Prague is UTC+2 on this date.
const at = (day: number, h: number, m = 0) => Date.UTC(2026, 9, day, h - 2, m);

describe('nightly backup', () => {
  it('writes one consistent snapshot per Prague day after 02:30 and keeps the newest few', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pf-backup-'));
    const db = openDb(join(dir, 'farm.db'));
    db.prepare("INSERT INTO users (oidc_sub, display_name, created_at) VALUES ('x', 'Kid', 0)").run();
    const cfg = { dir: join(dir, 'backups'), keep: 2, at: '02:30' };

    expect(await nightlyBackup(db, cfg, at(9, 2, 10))).toBeNull();
    expect(await nightlyBackup(db, cfg, at(9, 2, 31))).toMatch(/farm-2026-10-09\.db$/);
    expect(await nightlyBackup(db, cfg, at(9, 23, 0))).toBeNull();

    // The snapshot is a working database with the data in it.
    const copy = new Database(join(cfg.dir, 'farm-2026-10-09.db'), { readonly: true });
    expect(copy.prepare('SELECT display_name FROM users').get()).toEqual({ display_name: 'Kid' });
    copy.close();

    writeFileSync(join(cfg.dir, 'notes.txt'), 'not a backup');
    await nightlyBackup(db, cfg, at(10, 3));
    await nightlyBackup(db, cfg, at(11, 3));
    expect(readdirSync(cfg.dir).sort()).toEqual(['farm-2026-10-10.db', 'farm-2026-10-11.db', 'notes.txt']);
  });
});
