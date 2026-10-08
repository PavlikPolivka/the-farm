import { expect, test, type Browser, type Page } from '@playwright/test';

async function phone(browser: Browser, name: string, use: object): Promise<Page> {
  const page = await (await browser.newContext(use)).newPage();
  await page.goto(`/auth/dev?as=${encodeURIComponent(name)}`);
  await page.waitForFunction(() => window.__pf?.sync.me && window.__pf.sync.status === 'ok');
  if (await page.locator('.tutorial .skip').isVisible()) await page.locator('.tutorial .skip').click();
  return page;
}

test('visit a farm, leave a sticker and a flower; the owner finds both in the mailbox', async ({ browser }, info) => {
  const dadName = `Dad ${info.project.name}`;
  const dad = await phone(browser, dadName, info.project.use);
  const dadId = await dad.evaluate(() => window.__pf!.sync.me!.id);
  const kid = await phone(browser, `Kid social ${info.project.name}`, info.project.use);

  // Visit Dad's farm from the family bar.
  await kid.locator(`.family [data-member="${dadId}"]`).click();
  await expect(kid.locator('[data-testid="visit"]')).toContainText(dadName);
  await expect(kid.locator('.bar')).toBeHidden();
  await kid.locator('[data-sticker="heart"]').click();
  await expect(kid.locator('.sticker-sent')).toBeVisible();

  await kid.locator('[data-visit="gift"]').click();
  await kid.locator('[data-gift-item="flower"]').click();
  await kid.screenshot({ path: `test-results/gift-${info.project.name}.png` });
  await kid.locator('[data-gift="send"]').click();
  await expect(kid.locator('.toast')).toContainText(/Gift sent|Dárek odeslán/);
  await kid.screenshot({ path: `test-results/visit-${info.project.name}.png` });
  await kid.locator('[data-visit="home"]').click();
  await expect(kid.locator('.bar')).toBeVisible();

  // Dad opens the app again: the mailbox has a badge, a gift to take and the visit with its sticker.
  await dad.reload();
  await dad.waitForFunction(() => window.__pf?.sync.status === 'ok');
  await expect(dad.locator('[data-testid="inbox-badge"]')).toHaveText('2');
  await dad.locator('[data-open="inbox"]').click();
  await expect(dad.locator('.inbox .row')).toContainText(/Kid social/);
  await dad.screenshot({ path: `test-results/inbox-${info.project.name}.png` });
  await dad.locator('.inbox [data-claim]').first().click();
  await expect.poll(() => dad.evaluate(() => window.__pf!.store.state.stats.flowers)).toBe(1);
  await expect(dad.locator('[data-testid="inbox-badge"]')).toHaveCount(0);
});

test('notification settings: types and quiet hours are saved per player', async ({ browser }, info) => {
  const page = await phone(browser, `Prefs ${info.project.name}`, info.project.use);
  await page.locator('[data-open="settings"]').click();
  await page.locator('[data-push-type="visit"]').click();
  await page.locator('[data-quiet="start"]').selectOption('21:00');
  await expect.poll(async () => (await page.request.get('/api/push/prefs')).json()).toEqual({
    types: { gift: true, visit: false, ready: true },
    quiet: { start: '21:00', end: '08:00' },
  });
});
