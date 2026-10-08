import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = Database.Database;

/** Ordered, append-only migrations. Never edit a shipped entry; add a new one. */
const MIGRATIONS: string[] = [
  `CREATE TABLE users (
     id INTEGER PRIMARY KEY,
     oidc_sub TEXT NOT NULL UNIQUE,
     display_name TEXT NOT NULL,
     locale TEXT NOT NULL DEFAULT 'en',
     is_admin INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE sessions (
     id TEXT PRIMARY KEY,           -- sha256 of the cookie token
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     expires_at INTEGER NOT NULL,
     refreshed_at INTEGER NOT NULL
   );
   CREATE INDEX sessions_user ON sessions(user_id);
   CREATE TABLE push_subs (
     endpoint TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     keys_json TEXT NOT NULL,
     prefs_json TEXT NOT NULL DEFAULT '{}',
     created_at INTEGER NOT NULL
   );
   CREATE INDEX push_subs_user ON push_subs(user_id);`,
  // M2: save sync, stats and the boards. Minigame and collection tables fill up in M3 and M5.
  `CREATE TABLE saves (
     user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     version INTEGER NOT NULL,
     state_json TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE stats (
     user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     lifetime_coins REAL NOT NULL DEFAULT 0,
     week_key TEXT NOT NULL DEFAULT '',
     week_coins REAL NOT NULL DEFAULT 0,
     level INTEGER NOT NULL DEFAULT 1,
     prestige_level INTEGER NOT NULL DEFAULT 0,
     collection_pct REAL NOT NULL DEFAULT 0,
     achievements INTEGER NOT NULL DEFAULT 0,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE daily_results (
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     date TEXT NOT NULL,
     game TEXT NOT NULL,
     seed INTEGER NOT NULL,
     input_log TEXT NOT NULL,
     score INTEGER NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (user_id, date)
   );
   CREATE TABLE best_scores (
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     game TEXT NOT NULL,
     best_score INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     PRIMARY KEY (user_id, game)
   );`,
];

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

function migrate(db: DB): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]!);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
