/**
 * Prizes (docs/DESIGN.md): the daily challenge winner gets a collectible, the weekly winner a
 * trophy for the cabinet. They are handed out once a day or week is over, land in the mailbox
 * and are claimed like gifts. Claimed prizes are the ledger saves are checked against.
 */
import type { FastifyInstance } from 'fastify';
import {
  RARE_BREEDS,
  addDays,
  dayKey,
  decorPool,
  newGame,
  pragueMinutes,
  weekKey,
  type InboxPrize,
  type Prize,
  type PrizeClaim,
} from '@pixel-farm/shared';
import { requireUser } from './auth.js';
import type { DB } from './db.js';
import { crownFor, pickUnfound } from './games.js';
import { queuePrize } from './notify.js';
import { loadSave } from './saves.js';

/** How far back missed prizes are still handed out (say the server was down at midnight). */
const LOOKBACK_DAYS = 7;
const LOOKBACK_WEEKS = 4;
/** A daily started just before midnight may be handed in a little after it; judge after that. */
const SETTLE_MINUTES = 15;

const insertPrize = (db: DB, userId: number, prize: Prize, key: string, now: number) =>
  db
    .prepare('INSERT INTO prizes (user_id, kind, key, payload_json, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING')
    .run(userId, prize.kind, key, JSON.stringify(prize), now).changes > 0;

/** Collectibles already waiting for this player, so a second prize doesn't repeat them. */
function pendingItems(db: DB, userId: number): string[] {
  return (db.prepare("SELECT payload_json FROM prizes WHERE user_id = ? AND kind = 'crown' AND claimed_at IS NULL").all(userId) as { payload_json: string }[])
    .map((r) => (JSON.parse(r.payload_json) as Prize & { kind: 'crown' }).item)
    .filter((x): x is string => !!x);
}

/** Hands out every prize that is due. Safe to call any time: each prize exists once. */
export function awardPrizes(db: DB, now: number, random: () => number = Math.random): Prize[] {
  const given: Prize[] = [];
  const today = dayKey(now);
  for (let back = pragueMinutes(now) >= SETTLE_MINUTES ? 1 : 2; back <= LOOKBACK_DAYS; back++) {
    const day = addDays(today, -back);
    if (db.prepare("SELECT 1 FROM prizes WHERE kind = 'crown' AND key = ?").get(day)) continue;
    const winner = crownFor(db, day);
    if (!winner) continue;
    // A rare animal first; once all six are found, a fair decoration; then just the crown.
    const farm = loadSave(db, winner.userId)?.state ?? newGame(now, 0);
    const skip = pendingItems(db, winner.userId);
    const pick = (pool: readonly string[]) => pickUnfound(farm, pool.filter((id) => !skip.includes(id)), random);
    const prize: Prize = { kind: 'crown', day, item: pick(RARE_BREEDS) ?? pick(decorPool('fair')) };
    if (insertPrize(db, winner.userId, prize, day, now)) {
      queuePrize(db, winner.userId, 'crown', now);
      given.push(prize);
    }
  }

  const thisWeek = weekKey(now);
  for (let back = 1; back <= LOOKBACK_WEEKS; back++) {
    const week = addDays(thisWeek, -7 * back);
    if (db.prepare("SELECT 1 FROM prizes WHERE kind = 'trophy' AND key = ?").get(week)) continue;
    const rows = db.prepare('SELECT user_id AS userId, coins FROM week_coins WHERE week = ? AND coins > 0 ORDER BY coins DESC').all(week) as {
      userId: number;
      coins: number;
    }[];
    // Everyone sharing first place gets a trophy.
    for (const r of rows.filter((r) => r.coins === rows[0]!.coins)) {
      const prize: Prize = { kind: 'trophy', week };
      if (insertPrize(db, r.userId, prize, week, now)) {
        queuePrize(db, r.userId, 'trophy', now);
        given.push(prize);
      }
    }
  }
  return given;
}

/** Claimed prizes by kind: saves may not count more crowns or trophies than this. */
export function prizesClaimed(db: DB, userId: number): { crowns: number; trophies: number } {
  const n = (kind: string) =>
    (db.prepare('SELECT COUNT(*) AS n FROM prizes WHERE user_id = ? AND kind = ? AND claimed_at IS NOT NULL').get(userId, kind) as { n: number }).n;
  return { crowns: n('crown'), trophies: n('trophy') };
}

export function inboxPrizes(db: DB, userId: number): InboxPrize[] {
  return (
    db.prepare('SELECT id, payload_json, created_at FROM prizes WHERE user_id = ? AND claimed_at IS NULL ORDER BY created_at, id').all(userId) as {
      id: number;
      payload_json: string;
      created_at: number;
    }[]
  ).map((r) => ({ id: r.id, prize: JSON.parse(r.payload_json) as Prize, createdAt: r.created_at }));
}

export function registerPrizes(app: FastifyInstance, db: DB, clock: () => number = Date.now): void {
  app.post<{ Params: { id: string } }>('/api/prizes/:id/claim', { preHandler: requireUser }, async (req, reply) => {
    const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : -1;
    const userId = req.userId!;
    const claim = db.transaction((): PrizeClaim | null => {
      const row = db.prepare('SELECT payload_json FROM prizes WHERE id = ? AND user_id = ? AND claimed_at IS NULL').get(id, userId) as
        | { payload_json: string }
        | undefined;
      if (!row) return null;
      // The farm applies prizes in claim order, whatever order they were awarded in.
      const seq = (db.prepare('SELECT COALESCE(MAX(claim_seq), 0) + 1 AS n FROM prizes WHERE user_id = ?').get(userId) as { n: number }).n;
      db.prepare('UPDATE prizes SET claimed_at = ?, claim_seq = ? WHERE id = ?').run(clock(), seq, id);
      return { seq, prize: JSON.parse(row.payload_json) as Prize };
    })();
    return claim ?? reply.code(409).send({ error: 'not_claimable' });
  });
}
