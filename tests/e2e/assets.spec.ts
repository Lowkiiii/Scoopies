import { expect, test } from '@playwright/test';

const expectedScripts = [
  '/assets/js/core.js',
  '/assets/js/runtime-factories.js',
  '/assets/js/state.js',
  '/assets/js/costing.js',
  '/assets/js/pos-catalog.js',
  '/assets/js/stocks.js',
  '/assets/js/workspace-sync.js',
  '/assets/js/pos-operations.js',
  '/assets/js/publication.js',
  '/assets/js/render-costing.js',
  '/assets/js/render-modals.js',
  '/assets/js/render-pos.js',
  '/assets/js/render-stocks.js',
  '/assets/js/support.js',
  '/assets/js/events.js',
  '/assets/js/boot.js',
  '/assets/js/compatibility.js',
  '/assets/js/start.js',
];

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
    if (pathname.endsWith('/assets/styles.css') || pathname.includes('/assets/js/')) {
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
  expect(Array.from(assetStatuses.keys()).filter((path) => path.includes('/assets/js/')).sort()).toEqual(
    expectedScripts.slice().sort(),
  );
  expectedScripts.forEach((path) => expect(assetStatuses.get(path), `${path} must load`).toBe(200));
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
    facade: typeof (window as typeof window & { MatchaLunaApp?: unknown }).MatchaLunaApp,
  }));

  expect(contract).toEqual({
    stylesheetAttached: true,
    boot: 'function',
    renderAll: 'function',
    save: 'function',
    unitFactor: 'object',
    facade: 'object',
  });
});
