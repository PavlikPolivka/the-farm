import { expect, test } from '@playwright/test';

const PANGRAM = 'Příliš žluťoučký kůň úpěl ďábelské ódy. PŘÍLIŠ ŽLUŤOUČKÝ KŮŇ ÚPĚL ĎÁBELSKÉ ÓDY.';

test('the UI font has every Czech letter (no missing-glyph boxes)', async ({ page }, info) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__pf?.store);
  const missing = await page.evaluate((text) => {
    const font = getComputedStyle(document.body).font;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    const draw = (ch: string) => {
      g.clearRect(0, 0, 64, 64);
      g.font = font.replace(/\d+px/, '40px');
      g.fillText(ch, 4, 48);
      return Array.from(g.getImageData(0, 0, 64, 64).data).join(',');
    };
    // A private-use character is never in a font: what it draws is the missing-glyph box.
    const tofu = draw('');
    return [...new Set(text.replace(/[\s.]/g, ''))].filter((ch) => draw(ch) === tofu || draw(ch) === draw(''));
  }, PANGRAM);
  expect(missing).toEqual([]);

  // And as the players see it, in Czech.
  await page.evaluate((text) => {
    const p = document.createElement('p');
    p.id = 'pangram';
    p.textContent = text;
    p.style.cssText = 'position:fixed;top:40%;left:16px;right:16px;padding:8px;background:#fff;z-index:99;font-size:20px';
    document.body.append(p);
  }, PANGRAM);
  await page.locator('#pangram').screenshot({ path: `test-results/pangram-${info.project.name}.png` });
});

test('sound and music start muted; switched on, they stay on', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__pf?.store);
  if (await page.locator('.tutorial .skip').isVisible()) await page.locator('.tutorial .skip').click();
  await page.locator('[data-open="settings"]').click();
  await expect(page.locator('[data-toggle="music"]')).toHaveAttribute('aria-checked', 'false');
  await page.locator('[data-toggle="music"]').click();
  await page.locator('[data-toggle="sounds"]').click();
  await page.reload();
  await page.waitForFunction(() => window.__pf?.store);
  if (await page.locator('.tutorial .skip').isVisible()) await page.locator('.tutorial .skip').click();
  await page.locator('[data-open="settings"]').click();
  await expect(page.locator('[data-toggle="music"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-toggle="sounds"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-testid="credits"] li').first()).toContainText('Kenney');
});

test('installable: Chrome reports no installability errors', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'installability is a Chromium check (what Lighthouse used)');
  await page.goto('/');
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.active);
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  expect(installabilityErrors).toEqual([]);
  const manifest = await cdp.send('Page.getAppManifest');
  expect(manifest.errors).toEqual([]);
});
