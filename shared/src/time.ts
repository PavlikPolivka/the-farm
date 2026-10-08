import { GAME } from './config/game.js';

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: GAME.timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
});

function prague(ms: number): { y: number; m: number; d: number; weekday: number } {
  const p = Object.fromEntries(parts.formatToParts(ms).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), weekday: WEEKDAYS.indexOf(p.weekday!) };
}

const iso = (utcMidnight: number) => new Date(utcMidnight).toISOString().slice(0, 10);

/** The game day ("2026-10-08"); days start at midnight Europe/Prague. */
export function dayKey(ms: number): string {
  const { y, m, d } = prague(ms);
  return iso(Date.UTC(y, m - 1, d));
}

/** The game week, named by its Monday ("2026-10-05"); weeks start Monday 00:00 Europe/Prague. */
export function weekKey(ms: number): string {
  const { y, m, d, weekday } = prague(ms);
  return iso(Date.UTC(y, m - 1, d) - weekday * DAY_MS);
}

/** Days since 1970-01-01 for a day key. */
export const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);

/** The day before a day key ("2026-10-01" → "2026-09-30"). */
export const prevDay = (day: string) => iso(Date.parse(`${day}T00:00:00Z`) - DAY_MS);

/** Minutes since midnight in Prague. */
export function pragueMinutes(ms: number): number {
  const p = Object.fromEntries(clockParts.formatToParts(ms).map((x) => [x.type, x.value]));
  return (Number(p.hour) % 24) * 60 + Number(p.minute);
}

const clockParts = new Intl.DateTimeFormat('en-GB', { timeZone: GAME.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * The earliest moment at or after `ms` outside quiet hours ("20:00"–"08:00", Prague time,
 * may wrap midnight). Equal start and end means no quiet hours.
 */
export function afterQuiet(ms: number, quiet: { start: string; end: string } | null): number {
  if (!quiet) return ms;
  const start = toMinutes(quiet.start);
  const end = toMinutes(quiet.end);
  if (start === end) return ms;
  const now = pragueMinutes(ms);
  const inQuiet = start < end ? now >= start && now < end : now >= start || now < end;
  if (!inQuiet) return ms;
  const wait = (end - now + 1440) % 1440;
  // Land on the minute the quiet hours end (DST shifts are absorbed by the next check).
  return ms - (ms % 60_000) + wait * 60_000;
}
