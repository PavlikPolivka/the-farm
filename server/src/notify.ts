/**
 * The notification queue (docs/DESIGN.md, "Notifications"). Events add rows to `jobs`; a
 * 1-minute ticker sends what is due. Rules:
 * - gift: right away (after quiet hours);
 * - visit: batched, at most one per hour, naming everyone who came;
 * - ready: when every hand-planted field is ripe, at most 2 per Prague day, skipped if the
 *   player has played since.
 * Every type can be switched off per player, and nothing goes out during quiet hours.
 */
import {
  DEFAULT_PUSH_PREFS,
  PUSH_TYPES,
  afterQuiet,
  allManualRipeAt,
  dayKey,
  type FarmState,
  type Locale,
  type PushPrefs,
  type PushType,
} from '@pixel-farm/shared';
import type { DB } from './db.js';
import type { PushMessage } from './push.js';

const HOUR = 3_600_000;
export const READY_PER_DAY = 2;

export function getPrefs(db: DB, userId: number): PushPrefs {
  const row = db.prepare('SELECT prefs_json FROM users WHERE id = ?').get(userId) as { prefs_json: string } | undefined;
  const saved = JSON.parse(row?.prefs_json || '{}') as Partial<PushPrefs>;
  return { types: { ...DEFAULT_PUSH_PREFS.types, ...saved.types }, quiet: { ...DEFAULT_PUSH_PREFS.quiet, ...saved.quiet } };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validates and stores prefs; returns the stored value, or null if malformed. */
export function setPrefs(db: DB, userId: number, raw: unknown): PushPrefs | null {
  const p = raw as Partial<PushPrefs> | null;
  if (!p || typeof p !== 'object' || !p.types || !p.quiet) return null;
  if (!HHMM.test(String(p.quiet.start)) || !HHMM.test(String(p.quiet.end))) return null;
  const prefs: PushPrefs = {
    types: Object.fromEntries(PUSH_TYPES.map((t) => [t, p.types![t] !== false])) as Record<PushType, boolean>,
    quiet: { start: p.quiet.start, end: p.quiet.end },
  };
  db.prepare('UPDATE users SET prefs_json = ? WHERE id = ?').run(JSON.stringify(prefs), userId);
  return prefs;
}

const insertJob = (db: DB, userId: number, type: PushType, due: number, payload: object = {}) =>
  db.prepare('INSERT INTO jobs (user_id, type, due_at, payload_json) VALUES (?, ?, ?, ?)').run(userId, type, due, JSON.stringify(payload));

const quietOf = (db: DB, userId: number) => getPrefs(db, userId).quiet;

export function queueGift(db: DB, toId: number, fromName: string, now: number): void {
  insertJob(db, toId, 'gift', afterQuiet(now, quietOf(db, toId)), { from: fromName });
}

/** One pending visit job at a time; it goes out an hour after the previous one at the earliest. */
export function queueVisit(db: DB, ownerId: number, now: number): void {
  const pending = db.prepare("SELECT 1 FROM jobs WHERE user_id = ? AND type = 'visit' AND sent_at IS NULL").get(ownerId);
  if (pending) return;
  const last = db.prepare("SELECT MAX(sent_at) AS t FROM jobs WHERE user_id = ? AND type = 'visit' AND result = 'sent'").get(ownerId) as { t: number | null };
  insertJob(db, ownerId, 'visit', afterQuiet(Math.max(now, (last.t ?? 0) + HOUR), quietOf(db, ownerId)));
}

/** Called on every accepted save: (re)plans the "crops are ready" message. */
export function planReady(db: DB, userId: number, s: FarmState, now: number): void {
  db.prepare("DELETE FROM jobs WHERE user_id = ? AND type = 'ready' AND sent_at IS NULL").run(userId);
  const ripeAt = allManualRipeAt(s);
  if (ripeAt === null || ripeAt <= now) return;
  insertJob(db, userId, 'ready', afterQuiet(ripeAt, quietOf(db, userId)));
}

const TEXT: Record<Locale, Record<PushType, { title: string; body: string }> & { sticker: string }> = {
  cs: {
    gift: { title: 'Dárek! 🎁', body: '{name} ti poslal(a) dárek. Otevři farmu a vyzvedni si ho.' },
    visit: { title: 'Návštěva na farmě', body: '{name} se podíval(a) na tvou farmu.' },
    ready: { title: 'Úroda je zralá 🌾', body: 'Všechna tvoje pole jsou připravená ke sklizni.' },
    sticker: ' A nechal(a) ti nálepku!',
  },
  en: {
    gift: { title: 'A gift! 🎁', body: '{name} sent you a gift. Open the farm to collect it.' },
    visit: { title: 'Someone visited', body: '{name} visited your farm.' },
    ready: { title: 'Crops are ready 🌾', body: 'All your fields are ready to harvest.' },
    sticker: ' And left you a sticker!',
  },
};

const listNames = (names: string[], locale: Locale) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} ${locale === 'cs' ? 'a' : 'and'} ${names[names.length - 1]}`;

interface JobRow {
  id: number;
  user_id: number;
  type: PushType;
  due_at: number;
  payload_json: string;
}

/** Sends every due job once. `send` returns how many devices got it. Returns what happened, for tests and logs. */
export async function runJobs(
  db: DB,
  now: number,
  send: (userId: number, msg: PushMessage) => Promise<number>,
): Promise<{ id: number; type: PushType; result: string }[]> {
  const due = db.prepare('SELECT id, user_id, type, due_at, payload_json FROM jobs WHERE sent_at IS NULL AND due_at <= ? ORDER BY due_at').all(now) as JobRow[];
  const done: { id: number; type: PushType; result: string }[] = [];
  const finish = (job: JobRow, result: string) => {
    db.prepare('UPDATE jobs SET sent_at = ?, result = ? WHERE id = ?').run(now, result, job.id);
    done.push({ id: job.id, type: job.type, result });
  };

  for (const job of due) {
    const prefs = getPrefs(db, job.user_id);
    if (!prefs.types[job.type]) {
      finish(job, 'off');
      continue;
    }
    // Quiet hours may have been changed since the job was queued.
    const allowed = afterQuiet(now, prefs.quiet);
    if (allowed > now) {
      db.prepare('UPDATE jobs SET due_at = ? WHERE id = ?').run(allowed, job.id);
      continue;
    }
    const user = db.prepare('SELECT locale FROM users WHERE id = ?').get(job.user_id) as { locale: Locale } | undefined;
    const text = TEXT[user?.locale === 'cs' ? 'cs' : 'en'];
    const locale: Locale = user?.locale === 'cs' ? 'cs' : 'en';
    let msg: PushMessage;

    if (job.type === 'ready') {
      const played = db.prepare('SELECT updated_at FROM saves WHERE user_id = ?').get(job.user_id) as { updated_at: number } | undefined;
      if (played && played.updated_at > job.due_at) {
        finish(job, 'played');
        continue;
      }
      const today = dayKey(now);
      const sentToday = (
        db.prepare("SELECT sent_at FROM jobs WHERE user_id = ? AND type = 'ready' AND result = 'sent'").all(job.user_id) as { sent_at: number }[]
      ).filter((r) => dayKey(r.sent_at) === today).length;
      if (sentToday >= READY_PER_DAY) {
        finish(job, 'capped');
        continue;
      }
      msg = { ...text.ready, url: '/' };
    } else if (job.type === 'gift') {
      const { from } = JSON.parse(job.payload_json) as { from: string };
      msg = { title: text.gift.title, body: text.gift.body.replace('{name}', from), url: '/?open=inbox' };
    } else {
      // Everyone who came since the last visit message.
      const last = db.prepare("SELECT MAX(sent_at) AS t FROM jobs WHERE user_id = ? AND type = 'visit' AND result = 'sent'").get(job.user_id) as { t: number | null };
      const visits = db
        .prepare(
          `SELECT u.display_name AS name, v.sticker FROM visits v JOIN users u ON u.id = v.visitor_id
           WHERE v.owner_id = ? AND v.created_at > ? ORDER BY v.created_at`,
        )
        .all(job.user_id, last.t ?? 0) as { name: string; sticker: string | null }[];
      if (!visits.length) {
        finish(job, 'empty');
        continue;
      }
      const names = [...new Set(visits.map((v) => v.name))];
      const body = text.visit.body.replace('{name}', listNames(names, locale)) + (visits.some((v) => v.sticker) ? text.sticker : '');
      msg = { title: text.visit.title, body, url: '/?open=inbox' };
    }
    const n = await send(job.user_id, msg);
    finish(job, n > 0 ? 'sent' : 'no-device');
  }
  return done;
}
