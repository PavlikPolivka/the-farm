import { createHash, randomBytes } from 'node:crypto';
import { GAME } from '@pixel-farm/shared';
import type { DB } from './db.js';

export const SESSION_COOKIE = 'pf_session';
export const SESSION_MS = GAME.sessionDays * 24 * 60 * 60 * 1000;
/** Sliding window: extend a session at most once per day to avoid a write per request. */
const REFRESH_EVERY_MS = 24 * 60 * 60 * 1000;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSession(db: DB, userId: number, now = Date.now()): string {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (id, user_id, expires_at, refreshed_at) VALUES (?, ?, ?, ?)').run(
    hash(token),
    userId,
    now + SESSION_MS,
    now,
  );
  return token;
}

/** Returns the user id for a valid session, and whether the cookie should be re-issued. */
export function touchSession(
  db: DB,
  token: string,
  now = Date.now(),
): { userId: number; refreshed: boolean } | null {
  const row = db
    .prepare('SELECT user_id, expires_at, refreshed_at FROM sessions WHERE id = ?')
    .get(hash(token)) as { user_id: number; expires_at: number; refreshed_at: number } | undefined;
  if (!row) return null;
  if (row.expires_at <= now) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(hash(token));
    return null;
  }
  if (now - row.refreshed_at < REFRESH_EVERY_MS) return { userId: row.user_id, refreshed: false };
  db.prepare('UPDATE sessions SET expires_at = ?, refreshed_at = ? WHERE id = ?').run(now + SESSION_MS, now, hash(token));
  return { userId: row.user_id, refreshed: true };
}

export function deleteSession(db: DB, token: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(hash(token));
}
