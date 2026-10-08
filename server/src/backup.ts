/**
 * Nightly database snapshot (docs/DESIGN.md: "Nightly sqlite3 .backup copied to the OMV NAS").
 * The server writes `farm-YYYY-MM-DD.db` once per Prague day after `at`, using SQLite's online
 * backup (consistent while the game runs), and keeps the newest `keep`. A host timer copies the
 * newest one to the NAS (deploy/nas-backup-setup.sh), so the game never waits on a network share.
 */
import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { dayKey, pragueMinutes } from '@pixel-farm/shared';
import type { DB } from './db.js';

const NAME = /^farm-\d{4}-\d{2}-\d{2}\.db$/;

export const backupName = (now: number) => `farm-${dayKey(now)}.db`;

/** Snapshots taken so far, oldest first. */
export const listBackups = (dir: string): string[] => {
  try {
    return readdirSync(dir).filter((f) => NAME.test(f)).sort();
  } catch {
    return [];
  }
};

/** Takes today's snapshot if it is due and missing. Returns the file written, or null. */
export async function nightlyBackup(db: DB, cfg: { dir: string; keep: number; at: string }, now: number): Promise<string | null> {
  const [h, m] = cfg.at.split(':').map(Number) as [number, number];
  if (pragueMinutes(now) < h * 60 + m) return null;
  const name = backupName(now);
  if (listBackups(cfg.dir).includes(name)) return null;
  mkdirSync(cfg.dir, { recursive: true });
  const file = join(cfg.dir, name);
  // Written under a temporary name, so a half-written file is never taken for a backup.
  await db.backup(`${file}.tmp`);
  // A single self-contained file: no -wal/-shm companions when someone opens it later.
  const snap = new Database(`${file}.tmp`);
  snap.pragma('journal_mode = DELETE');
  snap.close();
  renameSync(`${file}.tmp`, file);
  for (const old of listBackups(cfg.dir).slice(0, -cfg.keep)) rmSync(join(cfg.dir, old));
  return file;
}
