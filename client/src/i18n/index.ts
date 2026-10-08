import i18next from 'i18next';
import ICU from 'i18next-icu';
import { pickLocale, type Locale } from '@pixel-farm/shared';
import cs from './cs.json';
import en from './en.json';

const STORAGE_KEY = 'pf:locale';

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'cs' || saved === 'en') return saved;
  } catch {
    // storage blocked: fall through to the browser language
  }
  return pickLocale(navigator.language);
}

export async function initI18n(): Promise<void> {
  await i18next.use(ICU).init({
    lng: initialLocale(),
    fallbackLng: 'en',
    resources: { cs: { translation: cs }, en: { translation: en } },
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  document.documentElement.lang = i18next.language;
}

export const locale = (): Locale => (i18next.language === 'cs' ? 'cs' : 'en');

export async function setLocale(l: Locale): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    // not persisted; fine for this session
  }
  await i18next.changeLanguage(l);
  document.documentElement.lang = l;
}

export const t = (key: string, vars?: Record<string, unknown>): string => i18next.t(key, vars ?? {});
