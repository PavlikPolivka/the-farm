import { describe, expect, it } from 'vitest';
import { afterQuiet, dayKey, pragueMinutes, weekKey } from './time.js';

describe('Prague day and week keys', () => {
  it('starts days at midnight Prague time, not UTC', () => {
    // 2026-10-08 22:30 UTC is already 00:30 on the 9th in Prague (CEST, UTC+2).
    expect(dayKey(Date.UTC(2026, 9, 8, 21, 59))).toBe('2026-10-08');
    expect(dayKey(Date.UTC(2026, 9, 8, 22, 30))).toBe('2026-10-09');
    // Winter time (CET, UTC+1).
    expect(dayKey(Date.UTC(2026, 11, 31, 23, 30))).toBe('2027-01-01');
  });

  it('names weeks by their Monday and rolls over Monday 00:00 Prague', () => {
    expect(weekKey(Date.UTC(2026, 9, 8, 12))).toBe('2026-10-05'); // Thursday
    expect(weekKey(Date.UTC(2026, 9, 11, 21, 59))).toBe('2026-10-05'); // Sunday 23:59 Prague
    expect(weekKey(Date.UTC(2026, 9, 11, 22, 0))).toBe('2026-10-12'); // Monday 00:00 Prague
    expect(weekKey(Date.UTC(2026, 11, 31, 12))).toBe('2026-12-28'); // across the year end
  });
});

describe('quiet hours', () => {
  const quiet = { start: '20:00', end: '08:00' };
  // 2026-10-08 is CEST (UTC+2).
  const at = (h: number, m = 0) => Date.UTC(2026, 9, 8, h - 2, m);

  it('reads Prague wall-clock minutes', () => {
    expect(pragueMinutes(at(13, 37))).toBe(13 * 60 + 37);
  });

  it('lets messages through in the day and holds them overnight until 08:00', () => {
    expect(afterQuiet(at(12), quiet)).toBe(at(12));
    expect(afterQuiet(at(19, 59), quiet)).toBe(at(19, 59));
    expect(afterQuiet(at(20), quiet)).toBe(at(8) + 86_400_000);
    expect(afterQuiet(at(23, 30), quiet)).toBe(at(8) + 86_400_000);
    expect(afterQuiet(at(6, 15), quiet)).toBe(at(8));
    expect(afterQuiet(at(8), quiet)).toBe(at(8));
  });

  it('supports quiet hours that do not wrap midnight, and none at all', () => {
    expect(afterQuiet(at(13), { start: '12:00', end: '14:00' })).toBe(at(14));
    expect(afterQuiet(at(21), { start: '00:00', end: '00:00' })).toBe(at(21));
    expect(afterQuiet(at(21), null)).toBe(at(21));
  });
});
