import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const localTestOrigin = 'http://127.0.0.1:4173';
const exactSupabaseSdk = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

type Branch = 'test' | 'offline' | 'connected';

const sdkScripts: Record<Branch, string> = {
  test: `
    window.__mobileBootstrapSdk = {
      installed: true, createCalls: 0, listenerCalls: 0,
      getSessionCalls: 0, queryCalls: 0, rpcCalls: 0, storageCalls: 0
    };
    window.supabase = { createClient() {
      window.__mobileBootstrapSdk.createCalls += 1;
      throw new Error('Unexpected client creation in mobile Test branch');
    } };
  `,
  offline: `
    window.__mobileBootstrapSdk = {
      installed: true, createCalls: 0, listenerCalls: 0,
      getSessionCalls: 0, queryCalls: 0, rpcCalls: 0, storageCalls: 0
    };
    delete window.supabase;
  `,
  connected: `
    (() => {
      const probe = window.__mobileBootstrapSdk = {
        installed: true, createCalls: 0, listenerCalls: 0,
        getSessionCalls: 0, queryCalls: 0, rpcCalls: 0, storageCalls: 0
      };
      const auth = {
        getSession() {
          probe.getSessionCalls += 1;
          probe.authReceiver = this === auth;
          return Promise.resolve({ data: { session: null } });
        },
        onAuthStateChange(callback) {
          probe.listenerCalls += 1;
          probe.listenerShape = typeof callback === 'function';
        }
      };
      const client = {
        auth,
        realtime: { setAuth() {} },
        from() { probe.queryCalls += 1; throw new Error('Unexpected query'); },
        rpc() { probe.rpcCalls += 1; throw new Error('Unexpected RPC'); },
        storage: { from() { probe.storageCalls += 1; throw new Error('Unexpected storage'); } }
      };
      window.supabase = { createClient() {
        probe.createCalls += 1;
        return client;
      } };
    })();
  `,
};

async function installMobileGuards(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const root = window as typeof window & Record<string, any>;
    const guards = root.__mobileBootstrapGuards = {
      installed: true,
      storageWrites: [] as string[],
      fetchCalls: 0,
    };
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      guards.storageWrites.push(String(key));
      return originalSetItem.call(this, key, value);
    };
    const originalFetch = window.fetch;
    window.fetch = function (...args: Parameters<typeof fetch>) {
      guards.fetchCalls += 1;
      return Reflect.apply(originalFetch, window, args);
    };
    root.__mobileBootstrapStart = {
      calls: 0,
      finalizedAtCall: false,
      returnedPromise: false,
      settled: false,
    };
    Object.defineProperty(window, 'MatchaLunaApp', {
      configurable: true,
      enumerable: true,
      get: () => undefined,
      set: (facade: any) => {
        Object.defineProperty(window, 'MatchaLunaApp', {
          configurable: true, enumerable: true, value: facade, writable: true,
        });
        const register = facade.registerModule;
        facade.registerModule = function (
          domain: string,
          descriptors: Record<string, PropertyDescriptor>,
        ) {
          if (domain === 'bootstrap') {
            const descriptor = descriptors.boot;
            const original = descriptor.value;
            descriptors = {
              ...descriptors,
              boot: {
                ...descriptor,
                value: function (this: unknown, ...args: unknown[]) {
                  const probe = root.__mobileBootstrapStart;
                  probe.calls += 1;
                  probe.finalizedAtCall = !!root.MatchaLunaApp.finalized;
                  const promise = Reflect.apply(original, this, args);
                  probe.returnedPromise = promise instanceof Promise;
                  Promise.resolve(promise).then(
                    () => { probe.settled = true; },
                    () => { probe.settled = true; },
                  );
                  return promise;
                },
              },
            };
          }
          return Reflect.apply(register, this, [domain, descriptors]);
        };
      },
    });
  });
}

async function runBranch(context: BrowserContext, branch: Branch): Promise<any> {
  const page = await context.newPage();
  const escaped: string[] = [];
  const observed = { page: [] as string[], console: [] as string[], request: [] as string[], server: [] as string[] };
  page.on('pageerror', (error) => observed.page.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') observed.console.push(message.text());
  });
  page.on('requestfailed', (request) => observed.request.push(request.url()));
  page.on('response', (response) => {
    if (response.status() >= 500) observed.server.push(response.url());
  });
  await installMobileGuards(page);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.href === exactSupabaseSdk) {
      await route.fulfill({
        contentType: 'application/javascript',
        body: sdkScripts[branch],
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
  const query = branch === 'test' ? 'test=1' : `bootstrap-mobile=${branch}`;
  const response = await page.goto(`index.html?${query}`, { waitUntil: 'load' });
  expect(response?.status()).toBe(200);
  await page.evaluate(() => window.MatchaLunaApp.ready);
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & Record<string, any>).__mobileBootstrapStart.settled,
  )).toBe(true);
  const result = await page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    const controls = ['#authEmail', '#authPass', '[data-act="doLogin"]']
      .map((selector) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) return { exists: false, visible: false, focused: false, contained: false };
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        element.focus();
        return {
          exists: true,
          visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
          focused: document.activeElement === element,
          contained: rect.left >= 0 && rect.right <= window.innerWidth,
        };
      });
    const gate = document.getElementById('authGate');
    const gateRect = gate?.getBoundingClientRect();
    const gateStyle = gate ? getComputedStyle(gate) : null;
    return {
      status: document.getElementById('syncStatus')?.textContent,
      start: root.__mobileBootstrapStart,
      sdk: root.__mobileBootstrapSdk,
      guards: root.__mobileBootstrapGuards,
      cfgKey: root.CFG_KEY,
      bootstrapKeys: Object.keys(root.MatchaLunaApp.domains.bootstrap),
      runtime: Array.from(
        document.querySelectorAll<HTMLScriptElement>('script[data-matcha-luna-runtime]'),
        (script) => script.dataset.matchaLunaRuntime,
      ),
      bootRequests: performance.getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => /\/assets\/js\/boot\.js(?:[?#]|$)/.test(name)),
      stateRequests: performance.getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => /\/assets\/js\/state\.js(?:[?#]|$)/.test(name)),
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
      gateVisible: !!gate && gateStyle?.display !== 'none' && gateStyle?.visibility !== 'hidden' && !!gateRect && gateRect.width > 0 && gateRect.height > 0,
      gateContained: !!gateRect && gateRect.left >= 0 && gateRect.right <= window.innerWidth,
      controls,
    };
  });
  await page.close();
  return { result, escaped, observed };
}

test('Bootstrap Test, offline, and signed-out startup stay deterministic, write-free, focusable, and contained', async ({ context }) => {
  const testBranch = await runBranch(context, 'test');
  const offlineBranch = await runBranch(context, 'offline');
  const connectedBranch = await runBranch(context, 'connected');

  for (const branch of [testBranch, offlineBranch, connectedBranch]) {
    expect(branch.escaped).toEqual([]);
    expect(branch.observed).toEqual({ page: [], console: [], request: [], server: [] });
    expect(branch.result.start).toEqual({
      calls: 1,
      finalizedAtCall: true,
      returnedPromise: true,
      settled: true,
    });
    expect(branch.result.bootstrapKeys).toEqual(['boot']);
    expect(branch.result.runtime).toEqual(['start.js']);
    expect(branch.result.bootRequests).toEqual([]);
    expect(branch.result.stateRequests).toEqual([]);
    expect(branch.result.overflow).toBeLessThanOrEqual(0);
    expect(branch.result.guards.installed).toBe(true);
    expect(branch.result.guards.fetchCalls).toBe(0);
    expect(branch.result.sdk.installed).toBe(true);
    expect(branch.result.sdk.queryCalls).toBe(0);
    expect(branch.result.sdk.rpcCalls).toBe(0);
    expect(branch.result.sdk.storageCalls).toBe(0);
  }

  expect(testBranch.result.status).toBe('Test mode');
  expect(testBranch.result.sdk).toMatchObject({
    createCalls: 0, listenerCalls: 0, getSessionCalls: 0,
  });
  expect(testBranch.result.guards.storageWrites).toEqual([]);

  expect(offlineBranch.result.status).toBe('Saved on device');
  expect(offlineBranch.result.sdk).toMatchObject({
    createCalls: 0, listenerCalls: 0, getSessionCalls: 0,
  });
  expect(offlineBranch.result.guards.storageWrites).toEqual([]);

  expect(connectedBranch.result.status).toBe('Sign in to sync');
  expect(connectedBranch.result.sdk).toMatchObject({
    createCalls: 1,
    listenerCalls: 1,
    listenerShape: true,
    getSessionCalls: 1,
    authReceiver: true,
  });
  expect(connectedBranch.result.guards.storageWrites).toEqual([
    connectedBranch.result.cfgKey,
  ]);
  expect(connectedBranch.result.gateVisible).toBe(true);
  expect(connectedBranch.result.gateContained).toBe(true);
  expect(connectedBranch.result.controls).toEqual([
    { exists: true, visible: true, focused: true, contained: true },
    { exists: true, visible: true, focused: true, contained: true },
    { exists: true, visible: true, focused: true, contained: true },
  ]);
});
