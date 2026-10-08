import type { Locale, Me } from '@pixel-farm/shared';
import type { DB } from './db.js';

interface UserRow {
  id: number;
  display_name: string;
  locale: Locale;
  is_admin: number;
}

export function upsertUser(
  db: DB,
  u: { sub: string; displayName: string; locale: Locale; isAdmin: boolean },
): number {
  // display_name and locale are only set on first login; afterwards the admin / the player owns them.
  const row = db
    .prepare(
      `INSERT INTO users (oidc_sub, display_name, locale, is_admin, created_at)
       VALUES (@sub, @displayName, @locale, @isAdmin, @now)
       ON CONFLICT(oidc_sub) DO UPDATE SET is_admin = excluded.is_admin
       RETURNING id`,
    )
    .get({ ...u, isAdmin: u.isAdmin ? 1 : 0, now: Date.now() }) as { id: number };
  return row.id;
}

export function getMe(db: DB, id: number): Me | null {
  const row = db.prepare('SELECT id, display_name, locale, is_admin FROM users WHERE id = ?').get(id) as
    | UserRow
    | undefined;
  return row ? { id: row.id, displayName: row.display_name, locale: row.locale, isAdmin: row.is_admin === 1 } : null;
}
