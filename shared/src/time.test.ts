import { describe, expect, it } from 'vitest';
import { dayKey, weekKey } from './time.js';

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
