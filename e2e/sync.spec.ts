import { expect, test, type Browser, type Page } from '@playwright/test';

/** A fresh phone logged in as `name` through the dev-only login (DEV_LOGIN=1). */
async function phone(browser: Browser, name: string, use: object): Promise<Page> {
  const context = await browser.newContext(use);
  const page = await context.newPage();
  await page.goto(`/auth/dev?as=${encodeURIComponent(name)}`);
  await page.waitForFunction(() => window.__pf?.sync.me && window.__pf.sync.status === 'ok');
  return page;
}

async function earn(page: Page, coins: number) {
  // Tutorial off so it doesn't cover the boards.
  if (await page.locator('.tutorial .skip').isVisible()) await page.locator('.tutorial .skip').click();
  await page.evaluate(async (n) => {
    const pf = window.__pf!;
    for (let i = 0; i < n; i++) (pf as unknown as { ui: { windmill(at: { x: number; y: number }): void } }).ui.windmill({ x: 0, y: 0 });
    await pf.sync.idle();
    pf.sync.upload();
    await pf.sync.idle();
  }, coins);
}

test('two players sync and see each other on the boards', async ({ browser }, info) => {
  const use = info.project.use;
  // Both device projects share one server; keep their players apart.
  const a = `Pavel ${info.project.name}`;
  const b = `Nikola ${info.project.name}`;
  const pavel = await phone(browser, a, use);
  const nikola = await phone(browser, b, use);
  await earn(pavel, 9);
  await earn(nikola, 4);

  await pavel.locator('.family [data-member]').first().waitFor();
  await pavel.evaluate(() => (window.__pf as unknown as { ui: { open(k: string): void } }).ui.open('boards'));
  const rows = pavel.locator('[data-board-list="allTime"] .row');
  await expect(rows.filter({ hasText: a })).toHaveAttribute('data-rank', /\d/);
  const rankOf = async (name: string) => Number(await rows.filter({ hasText: name }).getAttribute('data-rank'));
  expect(await rankOf(a)).toBeLessThan(await rankOf(b));

  await pavel.locator('[data-board="week"]').click();
  await expect(pavel.locator('[data-board-list="week"] .row').filter({ hasText: b })).toContainText('4');
  await pavel.screenshot({ path: `test-results/boards-${info.project.name}.png` });

  // The family bar on Nikola's phone shows both players.
  await nikola.evaluate(() => (window.__pf as unknown as { ui: { open(k: string): void } }).ui.open('boards'));
  await expect(nikola.locator('[data-board-list="allTime"] .row').filter({ hasText: a })).toBeVisible();
});

test('a doctored farm is clamped by the server', async ({ browser }, info) => {
  const page = await phone(browser, `Cheater ${info.project.name}`, info.project.use);
  await earn(page, 3);
  await page.evaluate(async () => {
    const pf = window.__pf!;
    pf.store.state.coins += 1e9;
    pf.store.state.lifetimeCoins += 1e9;
    pf.sync.upload();
    await pf.sync.idle();
  });
  await expect(page.locator('.toast')).toContainText(/fixed|opravil/);
  expect(await page.evaluate(() => window.__pf!.store.state.coins)).toBeLessThan(1000);
});

test('another phone of the same player loads the server farm', async ({ browser }, info) => {
  const name = `Kid ${info.project.name}`;
  const first = await phone(browser, name, info.project.use);
  await earn(first, 7);
  const second = await phone(browser, name, info.project.use);
  expect(await second.evaluate(() => window.__pf!.store.state.lifetimeCoins)).toBe(7);
});
