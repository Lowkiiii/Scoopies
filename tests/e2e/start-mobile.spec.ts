import { expect, test, type Page } from '@playwright/test';

const localTestOrigin = 'http://127.0.0.1:4173';
const exactSupabaseSdk = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

async function installMobileStartGuards(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const root = window as typeof window & Record<string, any>;
    const guards = root.__mobileStartGuards = {
      installed: true,
      fetchCalls: 0,
      storageSet: 0,
      storageRemove: 0,
      storageClear: 0,
      businessHooksInstalled: 0,
      businessWrites: 0,
    };
    const originalFetch = window.fetch;
    window.fetch = function (...args: Parameters<typeof fetch>) {
      guards.fetchCalls += 1;
      return Reflect.apply(originalFetch, window, args);
    };
    const originalSet = Storage.prototype.setItem;
    const originalRemove = Storage.prototype.removeItem;
    const originalClear = Storage.prototype.clear;
    Storage.prototype.setItem = function (key: string, value: string) {
      guards.storageSet += 1;
      return originalSet.call(this, key, value);
    };
    Storage.prototype.removeItem = function (key: string) {
      guards.storageRemove += 1;
      return originalRemove.call(this, key);
    };
    Storage.prototype.clear = function () {
      guards.storageClear += 1;
      return originalClear.call(this);
    };
    root.__mobileStart = {
      calls: 0,
      finalizedAtCall: false,
      receiverUndefined: false,
      args: -1,
      thenReads: 0,
      originalSettled: false,
    };
    Object.defineProperty(root, 'MatchaLunaApp', {
      configurable: true,
      set: (facade: any) => {
        Object.defineProperty(root, 'MatchaLunaApp', { configurable: true, value: facade, writable: true });
        const bindClassic = facade.bindClassic;
        facade.bindClassic = function (domain: string, names: readonly string[]) {
          const namespace = Reflect.apply(bindClassic, this, [domain, names]);
          if (domain === 'legacy') {
            for (const name of ['save', 'saveMixture', 'submitPosSale', 'submitPosVoidSale', 'submitStockModal']) {
              const original = Reflect.get(root, name);
              if (typeof original !== 'function') continue;
              guards.businessHooksInstalled += 1;
              Reflect.set(root, name, function (this: unknown, ...args: unknown[]) {
                guards.businessWrites += 1;
                return Reflect.apply(original, this, args);
              });
            }
          }
          return namespace;
        };
        const finalize = facade.finalize;
        facade.finalize = function () {
          const result = Reflect.apply(finalize, this, []);
          const originalBoot = Reflect.get(root, 'boot');
          const returned = {};
          Object.defineProperty(returned, 'then', {
            get() {
              root.__mobileStart.thenReads += 1;
              throw new Error('Mobile typed Start must ignore then');
            },
          });
          const replacement = Function(
            'root',
            'originalBoot',
            'returned',
            `return function () {
              "use strict";
              const probe = root.__mobileStart;
              probe.calls += 1;
              probe.finalizedAtCall = root.MatchaLunaApp.finalized === true;
              probe.receiverUndefined = this === undefined;
              probe.args = arguments.length;
              const originalResult = Reflect.apply(originalBoot, undefined, []);
              Promise.resolve(originalResult).then(
                () => { probe.originalSettled = true; },
                () => { probe.originalSettled = true; },
              );
              return returned;
            };`,
          )(root, originalBoot, returned);
          Reflect.set(root, 'boot', replacement);
          return result;
        };
      },
    });
  });
}

test('typed Start remains single-shot, write-free, network-contained, and viewport-safe', async ({ page }) => {
  const escaped: string[] = [];
  const observed = { page: [] as string[], console: [] as string[], request: [] as string[], server: [] as string[] };
  await installMobileStartGuards(page);
  page.on('pageerror', (error) => observed.page.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') observed.console.push(message.text());
  });
  page.on('requestfailed', (request) => observed.request.push(request.url()));
  page.on('response', (response) => {
    if (response.status() >= 500) observed.server.push(response.url());
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.href === exactSupabaseSdk) {
      await route.fulfill({
        contentType: 'application/javascript',
        body: `
          window.__mobileStartSdk = {
            installed: true, createCalls: 0, queryCalls: 0,
            rpcCalls: 0, objectStorageCalls: 0
          };
          window.supabase = { createClient() {
            window.__mobileStartSdk.createCalls += 1;
            return {
              from() { window.__mobileStartSdk.queryCalls += 1; throw new Error('Unexpected query'); },
              rpc() { window.__mobileStartSdk.rpcCalls += 1; throw new Error('Unexpected RPC'); },
              storage: { from() { window.__mobileStartSdk.objectStorageCalls += 1; throw new Error('Unexpected object storage'); } }
            };
          } };
        `,
      });
      return;
    }
    if (url.origin === localTestOrigin) {
      await route.continue();
      return;
    }
    escaped.push(url.href);
    await route.abort('blockedbyclient');
  });

  const response = await page.goto('index.html?test=1&mobile-start=1', { waitUntil: 'load' });
  expect(response?.status()).toBe(200);
  await page.evaluate(() => window.MatchaLunaApp.ready);
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & Record<string, any>).__mobileStart.originalSettled,
  )).toBe(true);
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
  const posTab = page.locator('[data-tab="pos"]');
  await expect(posTab).toBeVisible();
  await posTab.focus();
  await expect(posTab).toBeFocused();

  const result = await page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    const pos = document.querySelector<HTMLElement>('[data-tab="pos"]')!;
    const rect = pos.getBoundingClientRect();
    const resources = performance.getEntriesByType('resource').map((entry) => entry.name);
    return {
      start: root.__mobileStart,
      guards: root.__mobileStartGuards,
      sdk: root.__mobileStartSdk,
      runtime: Array.from(
        document.querySelectorAll<HTMLScriptElement>('script[data-matcha-luna-runtime]'),
        (script) => script.dataset.matchaLunaRuntime,
      ),
      forbiddenResources: resources.filter((name) => /\/assets\/js\/(?:state|boot|start)\.js(?:[?#]|$)/.test(name)),
      headerVisible: !!document.querySelector('header')?.getBoundingClientRect().height,
      posContained: rect.left >= 0 && rect.right <= window.innerWidth,
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
    };
  });

  expect(result.start).toEqual({
    calls: 1,
    finalizedAtCall: true,
    receiverUndefined: true,
    args: 0,
    thenReads: 0,
    originalSettled: true,
  });
  expect(result.runtime).toEqual([]);
  expect(result.forbiddenResources).toEqual([]);
  expect(result.guards).toMatchObject({
    installed: true,
    fetchCalls: 0,
    storageSet: 0,
    storageRemove: 0,
    storageClear: 0,
    businessHooksInstalled: 5,
    businessWrites: 0,
  });
  expect(result.sdk).toEqual({
    installed: true,
    createCalls: 0,
    queryCalls: 0,
    rpcCalls: 0,
    objectStorageCalls: 0,
  });
  expect(result.headerVisible).toBe(true);
  expect(result.posContained).toBe(true);
  expect(result.overflow).toBeLessThanOrEqual(0);
  expect(escaped).toEqual([]);
  expect(observed).toEqual({ page: [], console: [], request: [], server: [] });
});
