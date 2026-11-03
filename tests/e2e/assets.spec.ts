import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const expectedRuntimeFiles = [
  'state.js',
  'workspace-sync.js',
  'pos-operations.js',
  'boot.js',
  'start.js',
];

const expectedRuntimePaths = expectedRuntimeFiles.map((fileName) => `/Scoopies/assets/js/${fileName}`);
const transitionRuntimeFiles = [
  'core.js',
  'runtime-factories.js',
  'state.js',
  'costing.js',
  'pos-catalog.js',
  'stocks.js',
  'workspace-sync.js',
  'pos-operations.js',
  'publication.js',
  'render-costing.js',
  'render-modals.js',
  'render-pos.js',
  'render-stocks.js',
  'support.js',
  'events.js',
  'boot.js',
  'compatibility.js',
  'start.js',
];

test('the module bootstrap loads the classic runtime without changing the app contract', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const assetResponses = new Map<string, number[]>();

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    const pathname = new URL(response.url()).pathname;
    if (!pathname.startsWith('/Scoopies/assets/')) return;
    const statuses = assetResponses.get(pathname) || [];
    statuses.push(response.status());
    assetResponses.set(pathname, statuses);
  });

  await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/, async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: 'window.supabase={createClient:function(){throw new Error("Supabase is disabled in browser tests");}};',
    });
  });
  await page.goto('index.html?test=1', { waitUntil: 'load' });
  await page.evaluate(() => (window as typeof window & { MatchaLunaApp: { ready: Promise<void> } }).MatchaLunaApp.ready);
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');

  const stylesheets = await page.evaluate(() =>
    Array.from(document.styleSheets)
      .map((sheet) => (sheet.href ? new URL(sheet.href).pathname : ''))
      .filter((path) => path.startsWith('/Scoopies/assets/') && path.endsWith('.css')),
  );
  expect(stylesheets).toHaveLength(1);

  const moduleEntries = await page.locator('script[type="module"][src]').evaluateAll((scripts) =>
    scripts.map((script) => new URL((script as HTMLScriptElement).src).pathname),
  );
  expect(moduleEntries).toHaveLength(1);
  expect(moduleEntries[0]).toMatch(/^\/Scoopies\/assets\/index-[A-Za-z0-9_-]+\.js$/);

  const runtimeScripts = await page.locator('script[data-matcha-luna-runtime]').evaluateAll((scripts) =>
    scripts.map((script) => {
      const element = script as HTMLScriptElement;
      const url = new URL(element.src);
      return {
        fileName: element.dataset.matchaLunaRuntime,
        pathname: url.pathname,
        version: url.searchParams.get('v'),
        dataVersion: element.dataset.runtimeVersion,
      };
    }),
  );
  expect(runtimeScripts.map(({ fileName }) => fileName)).toEqual(expectedRuntimeFiles);
  expect(runtimeScripts.map(({ pathname }) => pathname)).toEqual(expectedRuntimePaths);
  const runtimeVersions = Array.from(new Set(runtimeScripts.map(({ version }) => version)));
  expect(runtimeVersions).toHaveLength(1);
  expect(runtimeVersions[0]).toMatch(/^[a-f0-9]{16}$/);
  expect(runtimeScripts.every(({ version, dataVersion }) => version === dataVersion)).toBe(true);

  [...stylesheets, ...moduleEntries, ...expectedRuntimePaths].forEach((path) => {
    expect(assetResponses.get(path), `${path} must load exactly once with HTTP 200`).toEqual([200]);
  });
  expect(assetResponses.has('/Scoopies/assets/js/core.js')).toBe(false);
  expect(assetResponses.has('/Scoopies/assets/js/runtime-factories.js')).toBe(false);
  expect(assetResponses.has('/Scoopies/assets/js/costing.js')).toBe(false);
  expect(assetResponses.has('/Scoopies/assets/js/stocks.js')).toBe(false);
  expect(assetResponses.has('/Scoopies/assets/js/render-stocks.js')).toBe(false);
  expect(assetResponses.has('/Scoopies/assets/js/render-costing.js')).toBe(false);
  expect(assetResponses.has('/Scoopies/assets/js/support.js')).toBe(false);
  expect(assetResponses.has('/Scoopies/assets/js/events.js')).toBe(false);
  expect(assetResponses.has('/Scoopies/assets/js/compatibility.js')).toBe(false);
  expect(pageErrors, 'The app must not produce uncaught browser errors.').toEqual([]);
  expect(consoleErrors).toEqual([]);

  const contract = await page.evaluate(() => {
    const appWindow = window as typeof window & {
      MatchaLunaApp: { finalized: boolean; ready: Promise<void> };
      boot?: unknown;
      renderAll?: unknown;
      save?: unknown;
      UNIT_FACTOR?: unknown;
    };
    return {
      stylesheetAttached: Array.from(document.styleSheets).some((sheet) => {
        if (!sheet.href) return false;
        const pathname = new URL(sheet.href).pathname;
        return pathname.startsWith('/Scoopies/assets/') && pathname.endsWith('.css');
      }),
      boot: typeof appWindow.boot,
      renderAll: typeof appWindow.renderAll,
      save: typeof appWindow.save,
      unitFactor: typeof appWindow.UNIT_FACTOR,
      facade: typeof appWindow.MatchaLunaApp,
      finalized: appWindow.MatchaLunaApp.finalized,
    };
  });

  expect(contract).toEqual({
    stylesheetAttached: true,
    boot: 'function',
    renderAll: 'function',
    save: 'function',
    unitFactor: 'object',
    facade: 'object',
    finalized: true,
  });
});

test('the transition asset keeps pre-module cached HTML usable', async ({ page }) => {
  const pageErrors: string[] = [];
  const transitionAssetResponses = new Map<string, number[]>();
  const builtHtml = readFileSync(resolve(process.cwd(), 'dist/index.html'), 'utf8');
  const classicScripts = transitionRuntimeFiles
    .map((fileName) => `<script src="/Scoopies/assets/js/${fileName}"></script>`)
    .join('\n');
  const transitionHtml = builtHtml
    .replace(/\s*<script type="module"[^>]*><\/script>/, '')
    .replace('</body>', `${classicScripts}\n</body>`);

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    const pathname = new URL(response.url()).pathname;
    if (!pathname.startsWith('/Scoopies/assets/js/')) return;
    const statuses = transitionAssetResponses.get(pathname) || [];
    statuses.push(response.status());
    transitionAssetResponses.set(pathname, statuses);
  });
  await page.route('**/index.html?test=1&legacy-transition=1', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: transitionHtml });
  });
  await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/, async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: 'window.supabase={createClient:function(){throw new Error("Supabase is disabled in browser tests");}};',
    });
  });

  await page.goto('index.html?test=1&legacy-transition=1', { waitUntil: 'load' });
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
  const loadedRuntimeFiles = await page.locator('script[src]').evaluateAll((scripts) =>
    scripts
      .map((script) => new URL((script as HTMLScriptElement).src).pathname)
      .filter((pathname) => pathname.startsWith('/Scoopies/assets/js/'))
      .map((pathname) => pathname.split('/').pop()),
  );
  const facade = await page.evaluate(() => {
    const appWindow = window as typeof window & {
      MatchaLunaApp: { contractNames: string[]; finalized: boolean };
    };
    return {
      contractCount: appWindow.MatchaLunaApp.contractNames.length,
      finalized: appWindow.MatchaLunaApp.finalized,
    };
  });

  expect(loadedRuntimeFiles).toEqual(transitionRuntimeFiles);
  transitionRuntimeFiles.forEach((fileName) => {
    const path = `/Scoopies/assets/js/${fileName}`;
    expect(transitionAssetResponses.get(path), `${path} must remain available for cached HTML`).toEqual([200]);
  });
  expect(facade).toEqual({ contractCount: 175, finalized: true });
  expect(pageErrors).toEqual([]);
});
