import { expect, test } from '@playwright/test';

const expectedScripts = [
  '/Scoopies/assets/js/core.js',
  '/Scoopies/assets/js/runtime-factories.js',
  '/Scoopies/assets/js/state.js',
  '/Scoopies/assets/js/costing.js',
  '/Scoopies/assets/js/pos-catalog.js',
  '/Scoopies/assets/js/stocks.js',
  '/Scoopies/assets/js/workspace-sync.js',
  '/Scoopies/assets/js/pos-operations.js',
  '/Scoopies/assets/js/publication.js',
  '/Scoopies/assets/js/render-costing.js',
  '/Scoopies/assets/js/render-modals.js',
  '/Scoopies/assets/js/render-pos.js',
  '/Scoopies/assets/js/render-stocks.js',
  '/Scoopies/assets/js/support.js',
  '/Scoopies/assets/js/events.js',
  '/Scoopies/assets/js/boot.js',
  '/Scoopies/assets/js/compatibility.js',
  '/Scoopies/assets/js/start.js',
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
    if (pathname.endsWith('.css') || pathname.includes('/assets/js/')) {
      assetStatuses.set(pathname, response.status());
    }
  });

  await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/, async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: 'window.supabase={createClient:function(){throw new Error("Supabase is disabled in browser tests");}};',
    });
  });
  await page.goto('index.html?test=1', { waitUntil: 'load' });
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');

  const stylesheets = await page.evaluate(() =>
    Array.from(document.styleSheets)
      .map((sheet) => (sheet.href ? new URL(sheet.href).pathname : ''))
      .filter((path) => path.startsWith('/Scoopies/assets/') && path.endsWith('.css')),
  );
  expect(stylesheets).toHaveLength(1);
  stylesheets.forEach((path) => expect(assetStatuses.get(path), `${path} must load`).toBe(200));

  const scriptOrder = await page.locator('script[src*="assets/js/"]').evaluateAll((scripts) =>
    scripts.map((script) => new URL((script as HTMLScriptElement).src).pathname),
  );
  expect(scriptOrder).toEqual(expectedScripts);
  expect(Array.from(assetStatuses.keys()).filter((path) => path.includes('/assets/js/')).sort()).toEqual(
    expectedScripts.slice().sort(),
  );
  expectedScripts.forEach((path) => expect(assetStatuses.get(path), `${path} must load`).toBe(200));
  expect(pageErrors, 'The extracted app must not produce uncaught browser errors.').toEqual([]);
  expect(consoleErrors).toEqual([]);

  const contract = await page.evaluate(() => ({
    stylesheetAttached: Array.from(document.styleSheets).some((sheet) => {
      if (!sheet.href) return false;
      const pathname = new URL(sheet.href).pathname;
      return pathname.startsWith('/Scoopies/assets/') && pathname.endsWith('.css');
    }),
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
