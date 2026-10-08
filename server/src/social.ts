import type { FastifyInstance } from 'fastify';
import {
  SOCIAL,
  dayKey,
  giftCap,
  giftValue,
  level,
  newGame,
  parseGift,
  prevDay,
  type Gift,
  type Inbox,
  type InboxGift,
  type InboxVisit,
  type Sticker,
  type Village,
} from '@pixel-farm/shared';
import { requireUser } from './auth.js';
import type { DB } from './db.js';
import { crownFor } from './games.js';
import { getPrefs, queueGift, queueVisit, setPrefs } from './notify.js';
import { loadSave } from './saves.js';

const INBOX_DAYS = 7;

const userName = (db: DB, id: number) =>
  (db.prepare('SELECT display_name AS name FROM users WHERE id = ?').get(id) as { name: string } | undefined)?.name ?? null;

/** Claimed gifts at base value: the gift side of the save ledger. */
export function giftsClaimedValue(db: DB, userId: number): number {
  return (db.prepare('SELECT COALESCE(SUM(value), 0) AS v FROM gifts WHERE to_id = ? AND claimed_at IS NOT NULL').get(userId) as { v: number }).v;
}

export function giftsLeft(db: DB, fromId: number, toId: number, now: number): number {
  const sent = (db.prepare('SELECT COUNT(*) AS n FROM gifts WHERE from_id = ? AND to_id = ? AND day = ?').get(fromId, toId, dayKey(now)) as { n: number }).n;
  return Math.max(0, SOCIAL.giftsPerDay - sent);
}

export function registerSocial(app: FastifyInstance, db: DB, clock: () => number = Date.now): void {
  const idParam = (raw: string) => (/^\d+$/.test(raw) ? Number(raw) : null);

  app.get<{ Params: { userId: string } }>('/api/village/:userId', { preHandler: requireUser }, async (req, reply) => {
    const id = idParam(req.params.userId);
    const name = id === null ? null : userName(db, id);
    if (id === null || name === null) return reply.code(404).send({ error: 'no_such_player' });
    const save = loadSave(db, id);
    const updated = db.prepare('SELECT updated_at FROM saves WHERE user_id = ?').get(id) as { updated_at: number } | undefined;
    const now = clock();
    // Someone who never synced still has a village to look at: a fresh one.
    const state = save?.state ?? newGame(now, 0);
    return {
      id,
      name,
      level: level(state),
      crown: crownFor(db, prevDay(dayKey(now)))?.userId === id,
      state,
      updatedAt: updated?.updated_at ?? now,
      giftsLeft: id === req.userId ? 0 : giftsLeft(db, req.userId!, id, now),
    } satisfies Village;
  });

  app.post<{ Body: { ownerId?: unknown } }>('/api/visits', { preHandler: requireUser }, async (req, reply) => {
    const owner = Number(req.body?.ownerId);
    if (!Number.isInteger(owner) || owner === req.userId || userName(db, owner) === null) return reply.code(400).send({ error: 'bad_owner' });
    const now = clock();
    const id = Number(db.prepare('INSERT INTO visits (visitor_id, owner_id, created_at) VALUES (?, ?, ?)').run(req.userId, owner, now).lastInsertRowid);
    queueVisit(db, owner, now);
    return { id };
  });

  // One sticker per visit.
  app.post<{ Params: { id: string }; Body: { sticker?: unknown } }>('/api/visits/:id/sticker', { preHandler: requireUser }, async (req, reply) => {
    const sticker = req.body?.sticker as Sticker;
    if (!SOCIAL.stickers.includes(sticker)) return reply.code(400).send({ error: 'bad_sticker' });
    const res = db.prepare('UPDATE visits SET sticker = ? WHERE id = ? AND visitor_id = ? AND sticker IS NULL').run(sticker, idParam(req.params.id), req.userId);
    if (!res.changes) return reply.code(409).send({ error: 'already_stickered' });
    queueVisit(db, (db.prepare('SELECT owner_id FROM visits WHERE id = ?').get(idParam(req.params.id)) as { owner_id: number }).owner_id, clock());
    return reply.code(204).send();
  });

  app.post<{ Body: { to?: unknown; gift?: unknown } }>('/api/gifts', { preHandler: requireUser }, async (req, reply) => {
    const to = Number(req.body?.to);
    const gift = parseGift(req.body?.gift);
    const from = req.userId!;
    if (!gift || !Number.isInteger(to) || to === from || userName(db, to) === null) return reply.code(400).send({ error: 'bad_gift' });
    const now = clock();
    return db.transaction(() => {
      if (giftsLeft(db, from, to, now) <= 0) return reply.code(429).send({ error: 'daily_limit' });
      if (gift.kind === 'item') {
        // Checked against the sender's last synced farm (the client syncs right before sending).
        const farm = loadSave(db, from)?.state;
        if (!farm || farm.inv[gift.item] < gift.qty) return reply.code(409).send({ error: 'not_enough' });
        if (giftValue(gift) > giftCap(farm)) return reply.code(422).send({ error: 'too_big', cap: giftCap(farm) });
      }
      const id = Number(
        db
          .prepare('INSERT INTO gifts (from_id, to_id, payload_json, value, day, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(from, to, JSON.stringify(gift), giftValue(gift), dayKey(now), now).lastInsertRowid,
      );
      queueGift(db, to, userName(db, from)!, now);
      return { id, giftsLeft: giftsLeft(db, from, to, now) };
    })();
  });

  app.get('/api/inbox', { preHandler: requireUser }, async (req): Promise<Inbox> => {
    const now = clock();
    const gifts = (
      db
        .prepare(
          `SELECT g.id, g.from_id, u.display_name AS name, g.payload_json, g.created_at FROM gifts g JOIN users u ON u.id = g.from_id
           WHERE g.to_id = ? AND g.claimed_at IS NULL ORDER BY g.created_at`,
        )
        .all(req.userId) as { id: number; from_id: number; name: string; payload_json: string; created_at: number }[]
    ).map((g): InboxGift => ({ id: g.id, from: { id: g.from_id, name: g.name }, gift: JSON.parse(g.payload_json) as Gift, createdAt: g.created_at }));
    const visits = (
      db
        .prepare(
          `SELECT v.id, v.visitor_id, u.display_name AS name, v.sticker, v.created_at, v.seen_at FROM visits v JOIN users u ON u.id = v.visitor_id
           WHERE v.owner_id = ? AND v.created_at > ? ORDER BY v.created_at DESC LIMIT 50`,
        )
        .all(req.userId, now - INBOX_DAYS * 86_400_000) as { id: number; visitor_id: number; name: string; sticker: Sticker | null; created_at: number; seen_at: number | null }[]
    ).map((v): InboxVisit => ({ id: v.id, visitor: { id: v.visitor_id, name: v.name }, sticker: v.sticker, createdAt: v.created_at, seen: v.seen_at !== null }));
    return { gifts, visits };
  });

  app.post<{ Params: { id: string } }>('/api/gifts/:id/claim', { preHandler: requireUser }, async (req, reply) => {
    const id = idParam(req.params.id);
    const row = db.prepare('SELECT payload_json FROM gifts WHERE id = ? AND to_id = ? AND claimed_at IS NULL').get(id, req.userId) as { payload_json: string } | undefined;
    if (!row) return reply.code(409).send({ error: 'not_claimable' });
    db.prepare('UPDATE gifts SET claimed_at = ? WHERE id = ?').run(clock(), id);
    return { id, gift: JSON.parse(row.payload_json) as Gift };
  });

  app.post('/api/inbox/seen', { preHandler: requireUser }, async (req, reply) => {
    db.prepare('UPDATE visits SET seen_at = ? WHERE owner_id = ? AND seen_at IS NULL').run(clock(), req.userId);
    return reply.code(204).send();
  });

  app.get('/api/push/prefs', { preHandler: requireUser }, async (req) => getPrefs(db, req.userId!));
  app.put('/api/push/prefs', { preHandler: requireUser }, async (req, reply) => setPrefs(db, req.userId!, req.body) ?? reply.code(400).send({ error: 'bad_prefs' }));
}
