import { describe, expect, it } from 'vitest';
import { PROFILES, simulate } from './bot.js';

// M1 exit criteria from docs/DESIGN.md: first purchase < 30 s, first helper < 5 min.
describe('balance targets', () => {
  for (const name of ['active', 'casual', 'kid']) {
    it(`${name}: first purchase under 30 s and first helper under 5 min`, () => {
      const profile = PROFILES.find((p) => p.name === name)!;
      const { milestones } = simulate(profile, 15 * 60);
      expect(milestones.firstPurchase).toBeLessThan(30);
      expect(milestones.firstHelper).toBeLessThan(5 * 60);
    });
  }
});

// M5 exit criterion: first prestige after 4–6 days of casual play; later runs get shorter.
describe('prestige pacing', () => {
  it('casual: first move to new land after 4–6 days, the next runs about a quarter shorter each', () => {
    const casual = PROFILES.find((p) => p.name === 'casual')!;
    const { milestones } = simulate({ ...casual, days: 14 });
    const [first, ...later] = milestones.prestige.map((t, i, all) => (t - (all[i - 1] ?? 0)) / 86_400);
    expect(first).toBeGreaterThanOrEqual(4);
    expect(first).toBeLessThanOrEqual(6);
    expect(later.length).toBeGreaterThanOrEqual(3);
    // Geometric mean of the run-to-run change over the first four runs.
    const shrink = 1 - Math.pow(later[2]! / first!, 1 / 3);
    expect(shrink).toBeGreaterThanOrEqual(0.2);
    expect(shrink).toBeLessThanOrEqual(0.3);
    for (const run of later) expect(run).toBeLessThan(first!);
  }, 60_000);
});
