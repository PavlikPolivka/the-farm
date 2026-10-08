import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  DROPS,
  GAMES,
  GAME_IDS,
  MINIGAME_POOL,
  dailyGame,
  dropMult,
  isFound,
  dayKey,
  minigameReward,
  newGame,
  prevDay,
  replay,
  type FarmState,
  type DailyInfo,
  type DailyStart,
  type GameId,
  type GamesInfo,
  type PlayResult,
} from '@pixel-farm/shared';
import { requireUser } from './auth.js';
import { buildBoard } from './boards.js';
import type { Config } from './config.js';
import type { DB } from './db.js';
import { loadSave } from './saves.js';

/** Rewarded free plays per game per day; after that it's practice. */
export const REWARDED_PLAYS = 5;
/** The ranked daily attempt pays double and doesn't count towards the five. */
const DAILY_MULT = 2;
/** A daily started before midnight may still be handed in this long after the game's limit. */
const DAILY_GRACE_MS = 10 * 60_000;

export const dailySeed = (secret: string, day: string) => createHmac('sha256', secret).update(day).digest().readUInt32BE(0);

/** All minigame rewards granted to a player so far. Saves may not claim more. */
export function granted(db: DB, userId: number): { coins: number; xp: number; plays: number } {
  return db
    .prepare('SELECT COALESCE(SUM(coins), 0) AS coins, COALESCE(SUM(xp), 0) AS xp, COUNT(*) AS plays FROM minigame_plays WHERE user_id = ?')
    .get(userId) as { coins: number; xp: number; plays: number };
}

/** Something from `pool` the farm hasn't found yet, or null. */
export function pickUnfound(farm: FarmState, pool: readonly string[], random: () => number = Math.random): string | null {
  const left = pool.filter((id) => !isFound(farm, id));
  return left.length ? left[Math.floor(random() * left.length)]! : null;
}

/** The day's winner: best finished score, earliest finish breaks ties. */
export function crownFor(db: DB, day: string): { userId: number; name: string } | null {
  const row = db
    .prepare(
      `SELECT d.user_id AS userId, u.display_name AS name FROM daily_results d JOIN users u ON u.id = d.user_id
       WHERE d.date = ? AND d.finished_at IS NOT NULL AND d.score > 0 ORDER BY d.score DESC, d.finished_at ASC LIMIT 1`,
    )
    .get(day) as { userId: number; name: string } | undefined;
  return row ?? null;
}

export function registerGames(app: FastifyInstance, cfg: Config, db: DB, clock: () => number = Date.now, random: () => number = Math.random): void {
  const rewardedToday = (userId: number, game: GameId, day: string) =>
    (db.prepare('SELECT COUNT(*) AS n FROM minigame_plays WHERE user_id = ? AND game = ? AND day = ? AND ranked = 0').get(userId, game, day) as { n: number }).n;

  const best = (userId: number, game: GameId) =>
    (db.prepare('SELECT best_score AS b FROM best_scores WHERE user_id = ? AND game = ?').get(userId, game) as { b: number } | undefined)?.b ?? null;

  const recordBest = (userId: number, game: GameId, score: number, now: number) =>
    db
      .prepare(
        `INSERT INTO best_scores (user_id, game, best_score, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, game) DO UPDATE SET best_score = MAX(best_score, excluded.best_score),
           updated_at = CASE WHEN excluded.best_score > best_score THEN excluded.updated_at ELSE updated_at END`,
      )
      .run(userId, game, score, now);

  /** Grants and records a reward based on the player's last synced farm, sometimes with a collectible. */
  const grant = (userId: number, game: GameId, day: string, seed: number, score: number, ranked: boolean, now: number) => {
    const farm = loadSave(db, userId)?.state ?? newGame(now, 0);
    const { coins, xp } = minigameReward(farm, score, GAMES[game].par, ranked ? DAILY_MULT : 1);
    const item = random() < DROPS.minigame * dropMult(farm) ? pickUnfound(farm, MINIGAME_POOL, random) : null;
    const id = Number(
      db
        .prepare('INSERT INTO minigame_plays (user_id, game, day, seed, score, ranked, coins, xp, item, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(userId, game, day, seed, score, ranked ? 1 : 0, coins, xp, item, now).lastInsertRowid,
    );
    return { id, coins, xp, game, item };
  };

  const dailyInfo = (userId: number, now: number): DailyInfo => {
    const day = dayKey(now);
    const row = db.prepare('SELECT score, finished_at FROM daily_results WHERE user_id = ? AND date = ?').get(userId, day) as
      | { score: number; finished_at: number | null }
      | undefined;
    const rows = buildBoard(db, 'daily', now).sections[0]!.rows;
    return {
      day,
      game: dailyGame(day),
      status: !row ? 'open' : row.finished_at === null ? 'started' : 'done',
      score: row?.finished_at != null ? row.score : null,
      rank: rows.find((r) => r.userId === userId)?.rank ?? null,
      players: rows.length,
      crown: crownFor(db, prevDay(day)),
    };
  };

  app.get('/api/games', { preHandler: requireUser }, async (req): Promise<GamesInfo> => {
    const now = clock();
    const day = dayKey(now);
    return {
      daily: dailyInfo(req.userId!, now),
      games: GAME_IDS.map((id) => ({ id, best: best(req.userId!, id), rewardsLeft: Math.max(0, REWARDED_PLAYS - rewardedToday(req.userId!, id, day)) })),
    };
  });

  app.post<{ Body: { game?: unknown; seed?: unknown; log?: unknown } }>(
    '/api/minigame/result',
    { preHandler: requireUser, bodyLimit: 512 * 1024 },
    async (req, reply) => {
      const { game, seed, log } = req.body ?? {};
      if (!GAME_IDS.includes(game as GameId) || !Number.isInteger(seed) || (seed as number) < 0 || (seed as number) >= 2 ** 32)
        return reply.code(400).send({ error: 'bad_request' });
      const id = game as GameId;
      let score: number;
      try {
        score = replay(GAMES[id], seed as number, log).score;
      } catch (err) {
        return reply.code(400).send({ error: 'bad_log', detail: (err as Error).message });
      }
      const now = clock();
      const day = dayKey(now);
      const userId = req.userId!;
      return db.transaction((): PlayResult => {
        const left = REWARDED_PLAYS - rewardedToday(userId, id, day);
        const reward = left > 0 ? grant(userId, id, day, seed as number, score, false, now) : null;
        recordBest(userId, id, score, now);
        return { score, best: best(userId, id)!, reward, rewardsLeft: Math.max(0, left - (reward ? 1 : 0)) };
      })();
    },
  );

  app.get('/api/daily', { preHandler: requireUser }, async (req) => dailyInfo(req.userId!, clock()));

  // Starting uses up the ranked attempt: the seed is only handed out once.
  app.post('/api/daily/start', { preHandler: requireUser }, async (req, reply) => {
    const now = clock();
    const day = dayKey(now);
    const game = dailyGame(day);
    const seed = dailySeed(cfg.dailySecret, day);
    const inserted = db
      .prepare(
        `INSERT INTO daily_results (user_id, date, game, seed, input_log, score, created_at) VALUES (?, ?, ?, ?, '', 0, ?)
         ON CONFLICT(user_id, date) DO NOTHING`,
      )
      .run(req.userId!, day, game, seed, now);
    if (!inserted.changes) return reply.code(409).send({ error: 'already_started', daily: dailyInfo(req.userId!, now) });
    return { day, game, seed } satisfies DailyStart;
  });

  app.post<{ Body: { day?: unknown; log?: unknown } }>('/api/daily/result', { preHandler: requireUser, bodyLimit: 512 * 1024 }, async (req, reply) => {
    const { day, log } = req.body ?? {};
    const userId = req.userId!;
    const now = clock();
    const row = db.prepare('SELECT game, seed, created_at, finished_at FROM daily_results WHERE user_id = ? AND date = ?').get(userId, day) as
      | { game: GameId; seed: number; created_at: number; finished_at: number | null }
      | undefined;
    if (!row) return reply.code(404).send({ error: 'not_started' });
    if (row.finished_at !== null) return reply.code(409).send({ error: 'already_finished' });
    if (now - row.created_at > GAMES[row.game].limitMs + DAILY_GRACE_MS) return reply.code(410).send({ error: 'too_late' });
    let score: number;
    try {
      score = replay(GAMES[row.game], row.seed, log).score;
    } catch (err) {
      return reply.code(400).send({ error: 'bad_log', detail: (err as Error).message });
    }
    return db.transaction((): PlayResult => {
      db.prepare('UPDATE daily_results SET score = ?, input_log = ?, finished_at = ? WHERE user_id = ? AND date = ?').run(
        score,
        JSON.stringify(log),
        now,
        userId,
        day,
      );
      const reward = grant(userId, row.game, day as string, row.seed, score, true, now);
      recordBest(userId, row.game, score, now);
      const rows = buildBoard(db, 'daily', now).sections[0]!.rows;
      return {
        score,
        best: best(userId, row.game)!,
        reward,
        rewardsLeft: Math.max(0, REWARDED_PLAYS - rewardedToday(userId, row.game, dayKey(now))),
        rank: rows.find((r) => r.userId === userId)?.rank,
      };
    })();
  });
}
