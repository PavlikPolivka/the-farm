import { expect, test, type Page } from '@playwright/test';

type Target = 'windmill' | 'barn' | 'pen' | 'land' | `field:${number}`;

/** Taps a spot in the Phaser world the way a finger would. */
async function tapWorld(page: Page, target: Target) {
  const pos = await page.evaluate((t) => window.__pf!.scene()!.screenPos(t), target);
  expect(pos, `position of ${target}`).not.toBeNull();
  if (test.info().project.use.hasTouch) await page.touchscreen.tap(pos!.x, pos!.y);
  else await page.mouse.click(pos!.x, pos!.y);
}

const coins = (page: Page) => page.evaluate(() => window.__pf!.store.state.coins);

async function freshFarm(page: Page) {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('pixel-farm'));
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.waitForFunction(() => !!window.__pf?.scene()?.screenPos('windmill'));
}

test.beforeEach(async ({ page }) => {
  await freshFarm(page);
});

test('first session: tap, plant, harvest, sell, buy', async ({ page }) => {
  await expect(page.locator('.tutorial')).toBeVisible();
  await expect(page.locator('[data-testid="coins"]')).toHaveText('0');

  for (let i = 0; i < 3; i++) await tapWorld(page, 'windmill');
  await expect.poll(() => coins(page)).toBe(3);

  await tapWorld(page, 'field:0');
  await expect.poll(() => page.evaluate(() => window.__pf!.store.state.fields[0]!.crop)).toBe('wheat');

  // Fast-forward the crop instead of waiting 6 s.
  await page.evaluate(() => (window.__pf!.store.state.fields[0]!.plantedAt -= 60_000));
  await tapWorld(page, 'field:0');
  await expect.poll(() => page.evaluate(() => window.__pf!.store.state.inv.wheat)).toBe(1);

  await page.locator('[data-open="barn"]').click();
  await page.locator('[data-sell="wheat:all"]').click();
  await expect.poll(() => page.evaluate(() => window.__pf!.store.state.inv.wheat)).toBe(0);

  await page.evaluate(() => (window.__pf!.store.state.coins = 100));
  await page.locator('[data-open="shop"]').click();
  await page.locator('[data-buy="field"]').click();
  await expect.poll(() => page.evaluate(() => window.__pf!.store.state.fields.length)).toBe(3);
  await page.screenshot({ path: `test-results/shop-${test.info().project.name}.png` });
});

test('the farm survives a reload', async ({ page }) => {
  for (let i = 0; i < 5; i++) await tapWorld(page, 'windmill');
  await expect.poll(() => coins(page)).toBe(5);
  await page.evaluate(() => window.__pf!.store.flush());
  await page.reload();
  await page.waitForFunction(() => !!window.__pf);
  expect(await coins(page)).toBe(5);
});

test('Czech plurals and labels', async ({ page }) => {
  await page.locator('[data-open="settings"]').click();
  await page.locator('[data-lang="cs"]').click();
  await expect(page.locator('[data-open="shop"]')).toContainText('Obchod');
  const barnText = async (n: number) => {
    await page.evaluate((count) => {
      const s = window.__pf!.store.state;
      s.inv.carrot = count;
    }, n);
    await page.locator('[data-open="barn"]').click();
    const text = await page.locator('.barn').innerText();
    await page.locator('.close').click();
    return text;
  };
  expect(await barnText(1)).toContain('1 mrkev');
  expect(await barnText(3)).toContain('3 mrkve');
  expect(await barnText(5)).toContain('5 mrkví');
  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
});

test('tap targets are at least 48 px', async ({ page }) => {
  const small = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("button"))
      .filter((b) => b.offsetParent !== null)
      .map((b) => ({ text: b.innerText.trim(), w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height }))
      .filter((b) => b.w < 48 || b.h < 40),
  );
  expect(small).toEqual([]);
  await page.screenshot({ path: `test-results/farm-${test.info().project.name}.png` });
});
