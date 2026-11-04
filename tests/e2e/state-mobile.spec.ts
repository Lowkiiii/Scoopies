import { expect, test, type Locator, type Page } from '@playwright/test';

type BrowserErrors = {
  pageErrors: string[];
  consoleErrors: string[];
  failedRequests: string[];
  serverErrors: string[];
};

type StartupHarness = {
  errors: BrowserErrors;
  escapedRequests: string[];
};

const GUARDED_WRITE_HOOKS = [
  'save', 'cloudSave', 'logChanges', 'logCoarse',
  'submitPosSale', 'submitPosOpenShift', 'submitPosCloseShift',
  'submitPosVoidSale', 'posSavePending', 'posClearPending',
  'posRememberCatalogCache', 'posClearCatalogCache',
  'publishProductToPos', 'submitStockModal', 'deleteIngredientSafely',
  'changeIngredientUnitSafely', 'uploadPosDrinkImage',
  'savePosDrinkImageEditor', 'confirmRemovePosDrinkImage',
  'posPatchProductImage',
] as const;

const APP_ORIGIN = 'http://127.0.0.1:4173';
const SUPABASE_SDK_URL =
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

function watchBrowserErrors(page: Page): BrowserErrors {
  const errors: BrowserErrors = {
    pageErrors: [], consoleErrors: [], failedRequests: [], serverErrors: [],
  };
  page.on('pageerror', (error) => errors.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    errors.failedRequests.push(`${request.method()} ${request.url()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      errors.serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  return errors;
}

async function expectContained(page: Page, region: Locator): Promise<void> {
  await expect(region).toBeVisible();
  const layout = await region.evaluate((element) => {
    const root = document.documentElement;
    const rect = element.getBoundingClientRect();
    const controls = Array.from(element.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, [tabindex], [role="button"]',
    )).filter((node) => {
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        box.width > 0 && box.height > 0;
    });
    return {
      viewportWidth: root.clientWidth,
      pageWidth: root.scrollWidth,
      left: rect.left,
      right: rect.right,
      controlCount: controls.length,
      controlsContained: controls.every((node) => {
        const box = node.getBoundingClientRect();
        return box.left >= -1 && box.right <= root.clientWidth + 1;
      }),
    };
  });
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.left).toBeGreaterThanOrEqual(-1);
  expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.controlCount).toBeGreaterThan(0);
  expect(layout.controlsContained).toBe(true);
}

async function installStartupHarness(page: Page): Promise<StartupHarness> {
  const errors = watchBrowserErrors(page);
  const escapedRequests: string[] = [];

  await page.addInitScript((writeHooks) => {
    const root = window as typeof window & Record<string, any>;
    const guard = {
      fetchCalls: [] as string[],
      storageMutations: [] as string[],
      clientCalls: [] as Array<Record<string, unknown>>,
      authCalls: [] as string[],
      cloudCalls: [] as string[],
      businessWrites: [] as string[],
      writeHookCalls: [] as string[],
      hooksInstalled: [] as string[],
      guardErrors: [] as string[],
      facadeWrapped: false,
    };
    root.__phase4kStateMobileGuard = guard;

    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input : input instanceof URL ? input.href : input.url;
      guard.fetchCalls.push(`${(init?.method || 'GET').toUpperCase()} ${url}`);
      return Promise.reject(new Error(`Unexpected fetch blocked: ${url}`));
    }) as typeof window.fetch;

    const storagePrototype = Storage.prototype as unknown as Record<string, any>;
    const allowedConfigKey = 'scoopies_cloud_cfg';
    for (const method of ['setItem', 'removeItem', 'clear']) {
      const original = storagePrototype[method];
      try {
        Object.defineProperty(storagePrototype, method, {
          configurable: true,
          enumerable: false,
          writable: true,
          value: function guardedStorageMutation(
            this: Storage,
            ...args: string[]
          ) {
            const area = this === localStorage ? 'localStorage'
              : this === sessionStorage ? 'sessionStorage' : 'Storage';
            const key = args[0] || '';
            guard.storageMutations.push(`${area}.${method}:${key}`);
            if (
              area === 'localStorage' && method === 'setItem' &&
              key === allowedConfigKey
            ) {
              return original.apply(this, args);
            }
            throw new Error(`Unexpected storage mutation blocked: ${area}.${method}:${key}`);
          },
        });
      } catch (error) {
        guard.guardErrors.push(`Storage.${method}:${String(error)}`);
      }
    }

    let facade: any;
    Object.defineProperty(window, 'MatchaLunaApp', {
      configurable: true,
      enumerable: true,
      get: () => facade,
      set: (value) => {
        facade = value;
        const finalize = value.finalize;
        value.finalize = function guardedFinalize(this: any) {
          for (const name of writeHooks) {
            if (typeof root[name] !== 'function') {
              guard.guardErrors.push(`missing write hook:${name}`);
              continue;
            }
            root[name] = () => {
              guard.writeHookCalls.push(name);
              throw new Error(`Business write hook blocked: ${name}`);
            };
            guard.hooksInstalled.push(name);
          }
          guard.facadeWrapped = true;
          return finalize.call(this);
        };
      },
    });
  }, GUARDED_WRITE_HOOKS);

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const localAppResource =
      url.origin === APP_ORIGIN && url.pathname.startsWith('/Scoopies/');
    if (localAppResource || url.href === SUPABASE_SDK_URL) {
      await route.continue();
      return;
    }
    escapedRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
    await route.abort('blockedbyclient');
  });

  await page.route(
    SUPABASE_SDK_URL,
    async (route) => route.fulfill({
      contentType: 'application/javascript',
      body: `
        (function () {
          var root = window;
          var guard = root.__phase4kStateMobileGuard;
          var remoteState = {
            schemaVersion: 3,
            ingredientCategories: [], ingredients: [], mixtureDrafts: [],
            packaging: [], recipes: [], products: []
          };
          function query(table) {
            return {
              select: function (columns) {
                guard.cloudCalls.push('select:' + table + ':' + columns);
                return this;
              },
              eq: function (column, value) {
                guard.cloudCalls.push('eq:' + table + ':' + column + ':' + value);
                return this;
              },
              maybeSingle: function () {
                guard.cloudCalls.push('maybeSingle:' + table);
                return Promise.resolve({ data: { data: remoteState }, error: null });
              },
              upsert: function () {
                guard.businessWrites.push('upsert:' + table);
                return Promise.reject(new Error('Unexpected upsert blocked'));
              },
              insert: function () {
                guard.businessWrites.push('insert:' + table);
                return Promise.reject(new Error('Unexpected insert blocked'));
              }
            };
          }
          root.supabase = {
            createClient: function (url, key, options) {
              guard.clientCalls.push({
                url: url,
                hasPublishableKey: Boolean(key),
                persistSession: Boolean(options && options.auth && options.auth.persistSession),
                autoRefreshToken: Boolean(options && options.auth && options.auth.autoRefreshToken)
              });
              var authListener = null;
              var client = {
                auth: {
                  onAuthStateChange: function (callback) {
                    guard.authCalls.push('onAuthStateChange');
                    authListener = callback;
                    return { data: { subscription: { unsubscribe: function () {} } } };
                  },
                  getSession: function () {
                    guard.authCalls.push('getSession');
                    return Promise.resolve({ data: { session: null }, error: null });
                  },
                  signInWithPassword: function () {
                    guard.businessWrites.push('auth.signInWithPassword');
                    return Promise.reject(new Error('Unexpected sign-in blocked'));
                  },
                  signUp: function () {
                    guard.businessWrites.push('auth.signUp');
                    return Promise.reject(new Error('Unexpected sign-up blocked'));
                  },
                  signOut: function () {
                    guard.businessWrites.push('auth.signOut');
                    return Promise.reject(new Error('Unexpected sign-out blocked'));
                  }
                },
                realtime: {
                  setAuth: function () {
                    guard.businessWrites.push('realtime.setAuth');
                  }
                },
                from: function (table) {
                  guard.cloudCalls.push('from:' + table);
                  return query(table);
                },
                rpc: function (name) {
                  guard.businessWrites.push('rpc:' + name);
                  return Promise.reject(new Error('Unexpected RPC blocked'));
                },
                storage: {
                  from: function (bucket) {
                    guard.businessWrites.push('storage.from:' + bucket);
                    throw new Error('Unexpected object-storage call blocked');
                  }
                },
                channel: function (name) {
                  guard.businessWrites.push('channel:' + name);
                  throw new Error('Unexpected realtime channel blocked');
                },
                removeChannel: function () {
                  guard.businessWrites.push('removeChannel');
                }
              };
              root.__phase4kStateMobileEmitAuth = function (event, session) {
                if (!authListener) throw new Error('Auth listener was not installed');
                authListener(event, session);
              };
              return client;
            }
          };
        }());
      `,
    }),
  );

  return { errors, escapedRequests };
}

async function openConnectedSignedOutApp(page: Page): Promise<void> {
  await page.goto('index.html', { waitUntil: 'load' });
  await page.evaluate(() =>
    (
      window as typeof window & { MatchaLunaApp: { ready: Promise<void> } }
    ).MatchaLunaApp.ready,
  );
  await expect(page.locator('#syncStatus')).toHaveText('Sign in to sync');
  await expect(page.locator('#authGate')).toBeVisible();
}

async function readGuard(page: Page) {
  return page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    const guard = root.__phase4kStateMobileGuard;
    return {
      fetchCalls: guard.fetchCalls,
      storageMutations: guard.storageMutations,
      clientCalls: guard.clientCalls,
      authCalls: guard.authCalls,
      cloudCalls: guard.cloudCalls,
      businessWrites: guard.businessWrites,
      writeHookCalls: guard.writeHookCalls,
      hooksInstalled: guard.hooksInstalled,
      guardErrors: guard.guardErrors,
      facadeWrapped: guard.facadeWrapped,
    };
  });
}

function expectSafeStartup(
  result: Awaited<ReturnType<typeof readGuard>>,
  harness: StartupHarness,
): void {
  expect(result.guardErrors).toEqual([]);
  expect(result.facadeWrapped).toBe(true);
  expect(result.hooksInstalled).toEqual(GUARDED_WRITE_HOOKS);
  expect(result.clientCalls).toEqual([{
    url: 'https://zdhybtctoxosjddzbfzp.supabase.co',
    hasPublishableKey: true,
    persistSession: true,
    autoRefreshToken: true,
  }]);
  expect(result.authCalls).toEqual(['onAuthStateChange', 'getSession']);
  expect(result.storageMutations).toEqual([
    'localStorage.setItem:scoopies_cloud_cfg',
  ]);
  expect(result.fetchCalls).toEqual([]);
  expect(result.businessWrites).toEqual([]);
  expect(result.writeHookCalls).toEqual([]);
  expect(harness.escapedRequests).toEqual([]);
  expect(harness.errors).toEqual({
    pageErrors: [], consoleErrors: [], failedRequests: [], serverErrors: [],
  });
}

test('State startup keeps the signed-out authentication UI mobile-safe and write-free', async ({ page }) => {
  const harness = await installStartupHarness(page);
  await openConnectedSignedOutApp(page);

  await expect(page.locator('#authTitle')).toHaveText('Log in to Matcha Luna');
  await expectContained(page, page.locator('#authGate .gatecard'));
  await page.locator('#authSubmit').click();
  await expect(page.locator('#authMsg')).toHaveText('Enter your email and password.');

  await page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    root.goOffline();
  });
  await expect(page.locator('#authGate')).toBeHidden();
  await page.locator('nav button[data-tab="cloud"]').click();
  await expect(page.locator('#cloudState')).toContainText(
    'Working on this device only',
  );
  await expectContained(page, page.locator('section#cloud .card').first());
  await page.locator('[data-act="openLogin"]').click();
  await expect(page.locator('#authGate')).toBeVisible();
  await expectContained(page, page.locator('#authGate .gatecard'));

  const result = await readGuard(page);
  expect(result.cloudCalls).toEqual([]);
  expectSafeStartup(result, harness);
});

test('State cloud read and live auth bindings stay deterministic, contained, and write-free', async ({ page }) => {
  const harness = await installStartupHarness(page);
  await openConnectedSignedOutApp(page);

  const stateResult = await page.evaluate(async () => {
    const root = window as typeof window & Record<string, any>;
    const stateDomain = root.MatchaLunaApp.domains.state as Record<string, any>;
    stateDomain.authMode = 'signup';
    const domainReachedRoot = root.authMode === 'signup';
    root.authMode = 'login';
    const rootReachedDomain = stateDomain.authMode === 'login';
    root.renderGate();
    const remote = await root.cloudLoad();
    root.__phase4kStateMobileEmitAuth('SIGNED_OUT', null);
    return {
      domainReachedRoot,
      rootReachedDomain,
      normalizedRemote: Boolean(remote) && remote.schemaVersion === 3,
      remoteHasBusinessData: root.hasData(remote),
      stateDomainSize: Object.keys(stateDomain).length,
    };
  });
  expect(stateResult).toEqual({
    domainReachedRoot: true,
    rootReachedDomain: true,
    normalizedRemote: true,
    remoteHasBusinessData: false,
    stateDomainSize: 141,
  });
  await expect(page.locator('#authGate')).toBeVisible();
  await expect(page.locator('#authTitle')).toHaveText('Log in to Matcha Luna');
  await expectContained(page, page.locator('#authGate .gatecard'));

  const result = await readGuard(page);
  expect(result.cloudCalls).toEqual([
    'from:scoopies_state',
    'select:scoopies_state:data',
    'eq:scoopies_state:id:main',
    'maybeSingle:scoopies_state',
  ]);
  expectSafeStartup(result, harness);
});
