import { expect, test } from '@playwright/test';

test('the extracted application assets load without changing the classic app contract', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const assetStatuses = new Map<string, number>();

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    const pathname = new URL(response.url()).pathname;
    if (pathname.endsWith('/assets/styles.css') || pathname.endsWith('/assets/app.js')) {
      assetStatuses.set(pathname, response.status());
    }
  });

  await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/, async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: 'window.supabase={createClient:function(){throw new Error("Supabase is disabled in browser tests");}};',
    });
  });
  await page.goto('/index.html?test=1', { waitUntil: 'load' });
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');

  expect(assetStatuses.get('/assets/styles.css')).toBe(200);
  expect(assetStatuses.get('/assets/app.js')).toBe(200);
  expect(pageErrors, 'The extracted app must not produce uncaught browser errors.').toEqual([]);
  expect(consoleErrors).toEqual([]);

  const contract = await page.evaluate(() => ({
    stylesheetAttached: Array.from(document.styleSheets).some((sheet) =>
      Boolean(sheet.href && sheet.href.endsWith('/assets/styles.css')),
    ),
    boot: typeof (window as typeof window & { boot?: unknown }).boot,
    renderAll: typeof (window as typeof window & { renderAll?: unknown }).renderAll,
    save: typeof (window as typeof window & { save?: unknown }).save,
    unitFactor: typeof (window as typeof window & { UNIT_FACTOR?: unknown }).UNIT_FACTOR,
  }));

  expect(contract).toEqual({
    stylesheetAttached: true,
    boot: 'function',
    renderAll: 'function',
    save: 'function',
    unitFactor: 'object',
  });
});
