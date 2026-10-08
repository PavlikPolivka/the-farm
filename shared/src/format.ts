/**
 * Number display. Below 10 000 the number is written out with the locale's separators
 * (cs: "1 234", en: "1,234"); above that it gets a short-scale suffix: 12.3K, 4.5M, 6.7B …
 */
const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

const formatters = new Map<string, Intl.NumberFormat>();
const fmt = (locale: string, digits: number) => {
  const key = `${locale}:${digits}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
    formatters.set(key, f);
  }
  return f;
};

export function formatNumber(n: number, locale: string): string {
  if (!Number.isFinite(n)) return '∞';
  const sign = n < 0 ? '-' : '';
  const v = Math.floor(Math.abs(n));
  if (v < 10_000) return sign + fmt(locale, 0).format(v);
  // Truncate rather than round, so 999 999 shows as 999K and never as a premature 1000K.
  const tier = Math.min(SUFFIXES.length - 1, Math.floor(Math.log10(v) / 3));
  const scaled = v / Math.pow(1000, tier);
  const digits = scaled < 100 ? 1 : 0;
  const truncated = Math.floor(scaled * Math.pow(10, digits)) / Math.pow(10, digits);
  return sign + fmt(locale, digits).format(truncated) + SUFFIXES[tier];
}

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (x: number) => String(x).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
