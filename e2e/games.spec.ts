import { expect, test, type Browser, type Page } from '@playwright/test';

async function phone(browser: Browser, name: string, use: object): Promise<Page> {
  const page = await (await browser.newContext(use)).newPage();
  await page.goto(`/auth/dev?as=${encodeURIComponent(name)}`);
  await page.waitForFunction(() => window.__pf?.sync.me && window.__pf.sync.status === 'ok');
  if (await page.locator('.tutorial .skip').isVisible()) await page.locator('.tutorial .skip').click();
  return page;
}

async function openGame(page: Page, id: string) {
  await page.locator('[data-open="games"]').click();
  await page.locator(`[data-play="${id}"]`).click();
  await page.locator('[data-mg="start"]').click();
  await page.waitForFunction(() => !!window.__pf!.game());
}

test('free play: a solved pexeso is replayed by the server and pays a reward', async ({ browser }, info) => {
  const page = await phone(browser, `Kid games ${info.project.name}`, info.project.use);
  const before = await page.evaluate(() => window.__pf!.store.state.lifetimeCoins);
  await openGame(page, 'pexeso');
  const cards: number[] = await page.evaluate(() => window.__pf!.game()!.session.state.cards);
  for (let face = 0; face < 8; face++) {
    const [a, b] = cards.flatMap((f, i) => (f === face ? [i] : []));
    await page.locator(`[data-cell="${a}"]`).click();
    await page.locator(`[data-cell="${b}"]`).click();
  }
  await expect(page.locator('[data-testid="mg-reward"]')).toBeVisible();
  await page.screenshot({ path: `test-results/pexeso-end-${info.project.name}.png` });
  expect(await page.evaluate(() => window.__pf!.store.state.lifetimeCoins)).toBeGreaterThan(before);
  // The rewarded farm syncs without being clamped.
  const rewarded = await page.evaluate(() => window.__pf!.store.state.lifetimeCoins);
  await page.evaluate(async () => {
    window.__pf!.sync.upload();
    await window.__pf!.sync.idle();
  });
  expect(await page.evaluate(() => window.__pf!.store.state.lifetimeCoins)).toBeGreaterThanOrEqual(rewarded);
  expect(await page.evaluate(() => window.__pf!.sync.status)).toBe('ok');
});

test('daily challenge: one ranked try, ending early still counts', async ({ browser }, info) => {
  const page = await phone(browser, `Nikola daily ${info.project.name}`, info.project.use);
  await page.locator('[data-open="games"]').click();
  await page.locator('[data-daily="play"]').click();
  await page.locator('[data-mg="start"]').click();
  await page.waitForFunction(() => !!window.__pf!.game());
  await page.locator('.mg-quit').click();
  await page.locator('.mg-quit').click();
  await expect(page.locator('[data-testid="mg-end"]')).toBeVisible();
  await expect(page.locator('[data-testid="mg-reward"]')).toBeVisible();
  await page.locator('[data-mg="close"]').click();
  await expect(page.locator('[data-testid="daily"]')).toContainText(/score|skóre/i);
  await expect(page.locator('[data-daily="play"]')).toHaveCount(0);
});

test('every game takes a move', async ({ browser }, info) => {
  const page = await phone(browser, `Pavel games ${info.project.name}`, info.project.use);
  const moves = () => page.evaluate(() => window.__pf!.game()!.session.log.length);
  const close = async () => {
    await page.locator('.mg-quit').click();
    await page.locator('.mg-quit').click();
    await page.locator('[data-open="games"]').waitFor();
    await page.locator('.sheet .close').click();
  };

  await openGame(page, 'pipes');
  await page.locator('[data-cell="0"]').click();
  expect(await moves()).toBe(1);
  await page.screenshot({ path: `test-results/pipes-${info.project.name}.png` });
  await close();

  await openGame(page, 'merge');
  for (const d of ['left', 'up', 'right', 'down']) await page.locator(`[data-dir="${d}"]`).click();
  expect(await moves()).toBeGreaterThan(0);
  await page.screenshot({ path: `test-results/merge-${info.project.name}.png` });
  await close();

  await openGame(page, 'rush');
  // Wait for the first pop-up, then tap it.
  const first = await page.evaluate(() => window.__pf!.game()!.session.state.popups[0] as { cell: number; from: number });
  await page.waitForFunction((from) => window.__pf!.game()!.at() > from + 100, first.from);
  await page.locator(`[data-cell="${first.cell}"]`).click();
  expect(await moves()).toBe(1);
  await page.screenshot({ path: `test-results/rush-${info.project.name}.png` });
  await close();

  await openGame(page, 'eggs');
  await page.locator('[data-basket="0"]').click();
  await page.locator('[data-basket="4"]').click();
  expect(await page.evaluate(() => window.__pf!.game()!.session.state.baskets[4].length)).toBe(1);
  await page.screenshot({ path: `test-results/eggs-${info.project.name}.png` });
});
