import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/, async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: 'window.supabase={createClient:function(){throw new Error("Supabase is disabled in browser tests");}};',
    });
  });
  await page.goto('index.html?test=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
});

test('the Matcha Luna application shell and primary navigation are usable', async ({ page }) => {
  await expect(page).toHaveTitle('Matcha Luna — POS & Costing');
  await expect(page.locator('header h1')).toContainText('Matcha Luna');
  await expect(page.locator('#authGate')).toBeHidden();

  const tabs = page.locator('nav button[data-tab]');
  await expect(tabs).toHaveCount(9);
  await expect(page.locator('nav button[data-tab="pos"]')).toHaveClass(/active/);
  await expect(page.locator('section#pos')).toHaveClass(/active/);

  await page.locator('nav button[data-tab="ingredients"]').click();
  await expect(page.locator('nav button[data-tab="ingredients"]')).toHaveClass(/active/);
  await expect(page.locator('section#ingredients')).toHaveClass(/active/);
  await expect(page.locator('section#ingredients h2').first()).toHaveText('Ingredients');

  await page.locator('nav button[data-tab="stocks"]').click();
  await expect(page.locator('nav button[data-tab="stocks"]')).toHaveClass(/active/);
  await expect(page.locator('section#stocks')).toHaveClass(/active/);
  await expect(page.locator('#stockRoot')).toContainText('Stocks');
});

test('the application shell stays within the current desktop or mobile viewport', async ({ page }) => {
  const layout = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
  }));

  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  await expect(page.locator('header')).toBeVisible();
  await expect(page.locator('nav')).toBeVisible();
  await expect(page.locator('nav button[data-tab="pos"]')).toBeVisible();
});
