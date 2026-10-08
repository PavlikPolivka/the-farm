import type { FastifyInstance } from 'fastify';
import {
  checkSave,
  isSaveError,
  level,
  parseSave,
  weekKey,
  type FarmState,
  type SaveAccepted,
  type SaveResponse,
  type SaveUpload,
} from '@pixel-farm/shared';
import { requireUser } from './auth.js';
import type { DB } from './db.js';

interface SaveRow {
  version: number;
  state_json: string;
}

export function loadSave(db: DB, userId: number): { version: number; state: FarmState } | null {
  const row = db.prepare('SELECT version, state_json FROM saves WHERE user_id = ?').get(userId) as SaveRow | undefined;
  return row ? { version: row.version, state: JSON.parse(row.state_json) as FarmState } : null;
}

/**
 * Stores an accepted save and updates the player's stats. Coins earned since the previous
 * save count towards this week; weeks start Monday 00:00 Prague.
 */
function storeSave(db: DB, userId: number, version: number, prev: FarmState | null, s: FarmState, now: number): void {
  db.prepare(
    `INSERT INTO saves (user_id, version, state_json, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET version = excluded.version, state_json = excluded.state_json, updated_at = excluded.updated_at`,
  ).run(userId, version, JSON.stringify(s), now);

  const week = weekKey(now);
  const earned = Math.max(0, s.lifetimeCoins - (prev?.lifetimeCoins ?? 0));
  db.prepare(
    `INSERT INTO stats (user_id, lifetime_coins, week_key, week_coins, level, updated_at)
     VALUES (@userId, @lifetime, @week, @earned, @level, @now)
     ON CONFLICT(user_id) DO UPDATE SET
       lifetime_coins = excluded.lifetime_coins,
       week_coins = CASE WHEN stats.week_key = excluded.week_key THEN stats.week_coins + excluded.week_coins ELSE excluded.week_coins END,
       week_key = excluded.week_key,
       level = excluded.level,
       updated_at = excluded.updated_at`,
  ).run({ userId, lifetime: s.lifetimeCoins, week, earned, level: level(s), now });
}

export function registerSaves(app: FastifyInstance, db: DB, clock: () => number = Date.now): void {
  app.get('/api/save', { preHandler: requireUser }, async (req): Promise<SaveResponse> => {
    const save = loadSave(db, req.userId!);
    return save ?? { version: 0, state: null };
  });

  app.put<{ Body: SaveUpload }>('/api/save', { preHandler: requireUser, bodyLimit: 256 * 1024 }, async (req, reply) => {
    const userId = req.userId!;
    const body = req.body as Partial<SaveUpload> | undefined;
    if (typeof body?.baseVersion !== 'number') return reply.code(400).send({ error: 'bad_request' });

    let next: FarmState;
    try {
      next = parseSave(body.state);
    } catch (err) {
      if (isSaveError(err)) return reply.code(400).send({ error: 'bad_save', detail: err.message });
      throw err;
    }

    const result = db.transaction(() => {
      const current = loadSave(db, userId);
      const version = current?.version ?? 0;
      // Another device synced in between: the server copy wins.
      if (body.baseVersion !== version) return { code: 409, body: { version, state: current?.state ?? null } satisfies SaveResponse };

      const now = clock();
      const verdict = checkSave(current?.state ?? null, next, now);
      if (!verdict.ok) {
        req.log.warn({ userId, reason: verdict.reason }, 'save rejected');
        return { code: 422, body: { error: 'rejected', reason: verdict.reason, version, state: current?.state ?? null } };
      }
      if (verdict.clamped.length) req.log.warn({ userId, clamped: verdict.clamped }, 'save clamped');
      storeSave(db, userId, version + 1, current?.state ?? null, verdict.state, now);
      const accepted: SaveAccepted = { version: version + 1, clamped: verdict.clamped };
      if (verdict.clamped.length) accepted.state = verdict.state;
      return { code: 200, body: accepted };
    })();
    return reply.code(result.code).send(result.body);
  });
}
