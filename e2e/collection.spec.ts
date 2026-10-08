import { expect, test } from '@playwright/test';

// Not logged in: the farm stays on the phone, so it can be set up rich without the server clamping it.
test('Collection Book: skins, medals, then move to new land and buy a perk', async ({ page }, info) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__pf?.store);
  if (await page.locator('.tutorial .skip').isVisible()) await page.locator('.tutorial .skip').click();
  await page.evaluate(() => {
    const s = window.__pf!.store.state;
    s.runCoins = s.lifetimeCoins = 300_000_000;
    s.coins = 1_000_000;
    s.stats.taps = 1000;
    s.found.decor.push('sunflower', 'gnome-red', 'balloon-blue');
    s.found.animals.push('hen-white', 'piglet');
  });

  // Ready to move: the book button says so.
  await expect(page.locator('[data-testid="book-dot"]')).toBeVisible();
  await page.locator('.bar [data-open="book"]').click();
  await expect(page.locator('.book-cell')).toHaveCount(24);
  await expect(page.locator('.book-cell.found')).toHaveCount(2);
  await page.screenshot({ path: `test-results/book-animals-${info.project.name}.png` });

  await page.locator('[data-book-tab="decor"]').click();
  await expect(page.locator('.book-cell.found')).toHaveCount(3);
  await page.screenshot({ path: `test-results/book-decor-${info.project.name}.png` });

  await page.locator('[data-book-tab="skins"]').click();
  await page.locator('[data-skin="windmill-green"]').click();
  await expect.poll(() => page.evaluate(() => window.__pf!.store.state.skins.windmill)).toBe('windmill-green');
  await expect(page.locator('[data-skin="barn-stone"]')).toBeDisabled();
  await page.screenshot({ path: `test-results/book-skins-${info.project.name}.png` });

  await page.locator('[data-book-tab="medals"]').click();
  await expect(page.locator('[data-achievement="taps"]')).toHaveAttribute('data-tier', '2');
  await page.screenshot({ path: `test-results/book-medals-${info.project.name}.png` });

  // Move to new land: two taps, so it can't happen by accident.
  await page.locator('[data-book-tab="land"]').click();
  const move = page.locator('[data-prestige="move"]');
  await expect(move).toContainText('17');
  await page.screenshot({ path: `test-results/book-land-${info.project.name}.png` });
  await move.click();
  await expect(page.locator('.land .warn')).toBeVisible();
  await move.click();
  await expect.poll(() => page.evaluate(() => window.__pf!.store.state.prestige)).toEqual({ level: 1, seedsEarned: 17 });
  const after = await page.evaluate(() => {
    const s = window.__pf!.store.state;
    return { coins: s.coins, fields: s.fields.length, seeds: s.seeds, decor: s.found.decor.length, skin: s.skins.windmill };
  });
  expect(after).toEqual({ coins: 0, fields: 2, seeds: 17, decor: 3, skin: 'windmill-green' });
  await expect(page.locator('[data-testid="new-land"]')).toContainText(/17/);
  await page.screenshot({ path: `test-results/new-land-${info.project.name}.png` });
  await page.locator('[data-testid="new-land"] button').click();
  await expect(page.locator('[data-testid="book-dot"]')).toBeHidden();

  await page.locator('.bar [data-open="book"]').click();
  await page.locator('[data-perk="soil"]').click();
  await expect.poll(() => page.evaluate(() => window.__pf!.store.state.perks.soil)).toBe(1);
  await page.screenshot({ path: `test-results/book-perks-${info.project.name}.png` });

  // The garden shows the decorations on the farm.
  await page.locator('.panel .close').click();
  await page.screenshot({ path: `test-results/garden-${info.project.name}.png`, fullPage: true });
});
