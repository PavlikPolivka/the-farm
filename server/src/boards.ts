import type { FastifyInstance } from 'fastify';
import { BOARD_IDS, dayKey, prevDay, weekKey, type Board, type BoardId, type BoardRow, type FamilyMember } from '@pixel-farm/shared';
import { requireUser } from './auth.js';
import type { DB } from './db.js';
import { crownFor } from './games.js';

interface Scored {
  userId: number;
  name: string;
  value: number;
  detail?: number;
}

/** Sorted rows to competition ranks: equal scores share a rank (1, 1, 3). */
export function rank(rows: Scored[], tie: (a: Scored, b: Scored) => number = (a, b) => b.value - a.value): BoardRow[] {
  const sorted = [...rows].sort((a, b) => tie(a, b) || a.name.localeCompare(b.name));
  return sorted.map((r, i) => {
    let at = i;
    while (at > 0 && tie(sorted[at - 1]!, r) === 0) at--;
    const row: BoardRow = { userId: r.userId, name: r.name, rank: at + 1, value: r.value };
    if (r.detail !== undefined) row.detail = r.detail;
    return row;
  });
}

/** Everyone who has played: all users, with zeros until their first sync. */
const PLAYERS = `
  SELECT u.id AS userId, u.display_name AS name, s.lifetime_coins, s.week_key, s.week_coins, s.level,
         s.prestige_level, s.collection_pct, s.achievements, s.updated_at
  FROM users u LEFT JOIN stats s ON s.user_id = u.id`;

interface PlayerRow {
  userId: number;
  name: string;
  lifetime_coins: number | null;
  week_key: string | null;
  week_coins: number | null;
  level: number | null;
  prestige_level: number | null;
  collection_pct: number | null;
  achievements: number | null;
  updated_at: number | null;
}

export function buildBoard(db: DB, board: BoardId, now: number): Board {
  const players = db.prepare(PLAYERS).all() as PlayerRow[];
  const week = weekKey(now);
  const weekCoins = (p: PlayerRow) => (p.week_key === week ? (p.week_coins ?? 0) : 0);

  switch (board) {
    case 'allTime':
      return {
        board,
        sections: [
          {
            rows: rank(
              players.map((p) => ({ userId: p.userId, name: p.name, value: p.prestige_level ?? 0, detail: p.lifetime_coins ?? 0 })),
              (a, b) => b.value - a.value || (b.detail ?? 0) - (a.detail ?? 0),
            ),
          },
        ],
      };
    case 'week':
      return { board, sections: [{ rows: rank(players.map((p) => ({ userId: p.userId, name: p.name, value: weekCoins(p) }))) }] };
    case 'collector':
      return { board, sections: [{ rows: rank(players.map((p) => ({ userId: p.userId, name: p.name, value: p.collection_pct ?? 0 }))) }] };
    case 'achievements':
      return { board, sections: [{ rows: rank(players.map((p) => ({ userId: p.userId, name: p.name, value: p.achievements ?? 0 }))) }] };
    case 'daily': {
      const rows = db
        .prepare(
          `SELECT d.user_id AS userId, u.display_name AS name, d.score AS value
           FROM daily_results d JOIN users u ON u.id = d.user_id WHERE d.date = ? AND d.finished_at IS NOT NULL`,
        )
        .all(dayKey(now)) as Scored[];
      return { board, sections: [{ rows: rank(rows) }] };
    }
    case 'minigames': {
      const rows = db
        .prepare(
          `SELECT b.game, b.user_id AS userId, u.display_name AS name, b.best_score AS value
           FROM best_scores b JOIN users u ON u.id = b.user_id ORDER BY b.game`,
        )
        .all() as (Scored & { game: string })[];
      const games = [...new Set(rows.map((r) => r.game))];
      return { board, sections: games.map((game) => ({ game, rows: rank(rows.filter((r) => r.game === game)) })) };
    }
  }
}

export function family(db: DB, me: number, now: number): FamilyMember[] {
  const week = weekKey(now);
  const crown = crownFor(db, prevDay(dayKey(now)))?.userId ?? null;
  const players = db.prepare(`${PLAYERS} ORDER BY u.id`).all() as PlayerRow[];
  const list = players.map(
    (p): FamilyMember => ({
      id: p.userId,
      name: p.name,
      level: p.level ?? 1,
      lifetimeCoins: p.lifetime_coins ?? 0,
      weekCoins: p.week_key === week ? (p.week_coins ?? 0) : 0,
      lastSeen: p.updated_at,
      crown: p.userId === crown,
    }),
  );
  return [...list.filter((p) => p.id === me), ...list.filter((p) => p.id !== me)];
}

export function registerBoards(app: FastifyInstance, db: DB, clock: () => number = Date.now): void {
  app.get<{ Params: { board: string } }>('/api/leaderboards/:board', { preHandler: requireUser }, async (req, reply) => {
    const board = req.params.board as BoardId;
    if (!BOARD_IDS.includes(board)) return reply.code(404).send({ error: 'no_such_board' });
    return buildBoard(db, board, clock());
  });

  app.get('/api/family', { preHandler: requireUser }, async (req) => family(db, req.userId!, clock()));
}
