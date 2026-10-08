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
