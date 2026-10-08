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
