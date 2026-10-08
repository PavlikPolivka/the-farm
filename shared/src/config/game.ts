/** Game-wide constants. Balance data moves here in M1; keep it data, not code. */
export const GAME = {
  timeZone: 'Europe/Prague',
  sessionDays: 180,
  quietHours: { start: '20:00', end: '08:00' },
} as const;

/** Display name per locale. Working title — see docs/DECISIONS.md. */
export const GAME_NAME: Record<'cs' | 'en', string> = {
  cs: 'Pixelová farma',
  en: 'Pixel Farm',
};

export function pickLocale(acceptLanguage: string | undefined | null): 'cs' | 'en' {
  if (!acceptLanguage) return 'en';
  return /^\s*(cs|sk)\b/i.test(acceptLanguage) ? 'cs' : 'en';
}
