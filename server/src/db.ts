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
  // M3: every rewarded minigame play (the ledger saves are checked against), finished dailies.
  `CREATE TABLE minigame_plays (
     id INTEGER PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     game TEXT NOT NULL,
     day TEXT NOT NULL,
     seed INTEGER NOT NULL,
     score INTEGER NOT NULL,
     ranked INTEGER NOT NULL DEFAULT 0,
     coins REAL NOT NULL,
     xp REAL NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX minigame_plays_user_day ON minigame_plays(user_id, day, game);
   ALTER TABLE daily_results ADD COLUMN finished_at INTEGER;`,
  // M4: visits, gifts and the notification queue.
  `CREATE TABLE visits (
     id INTEGER PRIMARY KEY,
     visitor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     sticker TEXT,
     created_at INTEGER NOT NULL,
     seen_at INTEGER
   );
   CREATE INDEX visits_owner ON visits(owner_id, created_at);
   CREATE TABLE gifts (
     id INTEGER PRIMARY KEY,
     from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     payload_json TEXT NOT NULL,
     value REAL NOT NULL,
     day TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     claimed_at INTEGER
   );
   CREATE INDEX gifts_to ON gifts(to_id, claimed_at);
   CREATE INDEX gifts_from_day ON gifts(from_id, to_id, day);
   CREATE TABLE jobs (
     id INTEGER PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     type TEXT NOT NULL,
     due_at INTEGER NOT NULL,
     sent_at INTEGER,
     result TEXT,
     payload_json TEXT NOT NULL DEFAULT '{}'
   );
   CREATE INDEX jobs_due ON jobs(sent_at, due_at);
   CREATE INDEX jobs_user_type ON jobs(user_id, type, sent_at);
   ALTER TABLE users ADD COLUMN prefs_json TEXT NOT NULL DEFAULT '{}';`,
  // M5: coins per week (for weekly trophies), prizes, collectibles from minigames.
  `CREATE TABLE week_coins (
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     week TEXT NOT NULL,
     coins REAL NOT NULL,
     PRIMARY KEY (user_id, week)
   );
   INSERT INTO week_coins (user_id, week, coins) SELECT user_id, week_key, week_coins FROM stats WHERE week_key != '';
   CREATE TABLE prizes (
     id INTEGER PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     kind TEXT NOT NULL,            -- 'crown' (daily challenge win) or 'trophy' (weekly board win)
     key TEXT NOT NULL,             -- the day or the week (Monday)
     payload_json TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     claimed_at INTEGER,
     claim_seq INTEGER,             -- per-player order of claims: the farm's prize id
     UNIQUE (user_id, kind, key)
   );
   CREATE INDEX prizes_user ON prizes(user_id, claimed_at);
   ALTER TABLE minigame_plays ADD COLUMN item TEXT;`,
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
