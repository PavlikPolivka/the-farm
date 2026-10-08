import { describe, expect, it } from 'vitest';
import { pickLocale } from './game.js';

describe('pickLocale', () => {
  it('maps Czech and Slovak to cs', () => {
    expect(pickLocale('cs-CZ')).toBe('cs');
    expect(pickLocale('sk')).toBe('cs');
  });
  it('falls back to en', () => {
    expect(pickLocale('de-DE')).toBe('en');
    expect(pickLocale(undefined)).toBe('en');
  });
});
