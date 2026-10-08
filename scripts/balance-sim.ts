/**
 * Prints time-to-milestone for each player profile (see shared/src/sim/bot.ts).
 *   pnpm balance
 */
import { formatDuration, PROFILES, simulate } from '@pixel-farm/shared/bot';

// Casual and kid run two weeks so prestige shows; active is a single 2 h session.
const rows = PROFILES.map((p) => {
  const t0 = performance.now();
  const { state, milestones: m } = simulate(p.name === 'active' ? p : { ...p, days: 14 });
  const f = (s?: number) => (s === undefined ? '—' : s < 3600 ? formatDuration(s) : `${(s / 3600).toFixed(1)} h`);
  return {
    profile: p.name,
    'first buy': f(m.firstPurchase),
    'first helper': f(m.firstHelper),
    'level 5': f(m.level[5]),
    'level 10': f(m.level[10]),
    'land 2': f(m.land2),
    '1st prestige': m.prestige[0] === undefined ? '—' : `${(m.prestige[0] / 86_400).toFixed(1)} d`,
    'later runs (d)': m.prestige.slice(1).map((t, i) => ((t - m.prestige[i]!) / 86_400).toFixed(1)).join(' ') || '—',
    'book (day 7/14)': `${m.foundByDay[6] ?? '—'}/${m.foundByDay[13] ?? '—'}`,
    'best level': state.stats.bestLevel,
    'lifetime coins': Math.round(state.lifetimeCoins).toLocaleString('en'),
    played: f(m.playedSec),
    'sim ms': Math.round(performance.now() - t0),
  };
});
console.table(rows);
