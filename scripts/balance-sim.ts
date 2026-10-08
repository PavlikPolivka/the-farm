/**
 * Prints time-to-milestone for each player profile (see shared/src/sim/bot.ts).
 *   pnpm balance
 */
import { formatDuration, PROFILES, simulate } from '@pixel-farm/shared/bot';

const rows = PROFILES.map((p) => {
  const t0 = performance.now();
  const { state, milestones: m } = simulate(p);
  const f = (s?: number) => (s === undefined ? '—' : s < 3600 ? formatDuration(s) : `${(s / 3600).toFixed(1)} h`);
  return {
    profile: p.name,
    'first buy': f(m.firstPurchase),
    'first helper': f(m.firstHelper),
    'level 5': f(m.level[5]),
    'level 10': f(m.level[10]),
    'land 2': f(m.land2),
    'end level': Object.keys(m.level).length + 1,
    'end coins (lifetime)': Math.round(state.lifetimeCoins).toLocaleString('en'),
    played: f(m.playedSec),
    'sim ms': Math.round(performance.now() - t0),
  };
});
console.table(rows);
