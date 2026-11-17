import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  activeRuntimeFiles,
  protectedStateNames,
  stateBindingNames,
  stateFunctionNames,
  stateValueNames,
  transitionRuntimeFiles,
} from './state-contract';
const stateBlob = 'c62c1b4754296e68e4817d4ecaa2089cc45e894d';
const stateCanonicalSha256 =
  '0fbb22c6437ec9b19cac4c00aa4a58d51a6abe63089825ce0875e2b77dca36e0';
const localTestOrigin = 'http://127.0.0.1:4173';
const guardedRequestLogs: string[][] = [];

test.beforeEach(() => {
  guardedRequestLogs.length = 0;
});

test.afterEach(() => {
  for (const escaped of guardedRequestLogs) expect(escaped).toEqual([]);
});

function canonicalLf(input: Buffer): Buffer {
  return Buffer.from(input.toString('utf8').replace(/\r\n?/g, '\n'), 'utf8');
}

function gitBlobId(input: Buffer): string {
  const header = Buffer.from(`blob ${input.length}\0`, 'utf8');
  return createHash('sha1').update(header).update(input).digest('hex');
}

async function installNetworkGuards(
  page: Page,
  supabaseScript =
    'window.supabase={createClient:function(){throw new Error("Supabase is disabled in State tests");}};',
): Promise<string[]> {
  const escaped: string[] = [];
  guardedRequestLogs.push(escaped);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.href === 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2') {
      await route.fulfill({
        contentType: 'application/javascript',
        body: supabaseScript,
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
  return escaped;
}

async function openPrimary(page: Page): Promise<string[]> {
  const escaped = await installNetworkGuards(page);
  await page.goto('index.html?test=1', { waitUntil: 'load' });
  await page.evaluate(() =>
    (window as typeof window & { MatchaLunaApp: { ready: Promise<void> } })
      .MatchaLunaApp.ready,
  );
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
  expect(escaped).toEqual([]);
  return escaped;
}

async function openClassic(context: BrowserContext): Promise<Page> {
  const builtHtml = readFileSync(resolve(process.cwd(), 'dist/index.html'), 'utf8');
  const scripts = transitionRuntimeFiles
    .map((file) => `<script src="/Scoopies/assets/js/${file}"></script>`)
    .join('\n');
  const html = builtHtml
    .replace(/\s*<script type="module"[^>]*><\/script>/, '')
    .replace('</body>', `${scripts}\n</body>`);
  const page = await context.newPage();
  const escaped = await installNetworkGuards(page);
  await page.route('**/index.html?test=1&state-transition=1', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.goto('index.html?test=1&state-transition=1', { waitUntil: 'load' });
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
  expect(escaped).toEqual([]);
  return page;
}

async function openPair(
  page: Page,
  context: BrowserContext,
): Promise<[Page, Page]> {
  await openPrimary(page);
  return [page, await openClassic(context)];
}

async function cachedPhase4JProbe(context: BrowserContext): Promise<unknown> {
  const builtHtml = readFileSync(resolve(process.cwd(), 'dist/index.html'), 'utf8');
  const html = builtHtml
    .replace(/\s*<script type="module"[^>]*><\/script>/, '')
    .replace(
      '</body>',
      '<script type="module" src="/Scoopies/phase4j-cached-loader.js"></script></body>',
    );
  const page = await context.newPage();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const runtimeRequests: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/Scoopies/assets/js/')) {
      runtimeRequests.push(`${url.pathname.split('/').pop()}?${url.searchParams.toString()}`);
    }
  });
  await installNetworkGuards(page);
  await page.route('**/index.html?test=1&phase4j-cached=1', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.route('**/phase4j-cached-loader.js', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `
        const files = ${JSON.stringify(transitionRuntimeFiles)};
        const root = window;
        root.__phase4jCached = {
          factoryCalls: [0, 0, 0, 0], bootCalls: 0,
          finalizedAtBoot: false, stateOrderAtBoot: []
        };
        const load = (file) => new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.async = false;
          script.src = '/Scoopies/assets/js/' + file + '?v=phase4j-cached';
          script.dataset.cachedPhase4jRuntime = file;
          script.onload = resolve;
          script.onerror = () => reject(new Error('cached runtime failed: ' + file));
          document.body.append(script);
        });
        for (const file of files) {
          await load(file);
          if (file === 'runtime-factories.js') {
            ['freshPosOpsModal', 'freshPosSalesHistory', 'freshStockState', 'freshStockModal']
              .forEach((name, index) => {
                const original = root[name];
                root[name] = function (...args) {
                  root.__phase4jCached.factoryCalls[index] += 1;
                  return original.apply(this, args);
                };
              });
          }
          if (file === 'boot.js') {
            const originalBoot = root.boot;
            root.boot = function (...args) {
              root.__phase4jCached.bootCalls += 1;
              root.__phase4jCached.finalizedAtBoot = !!root.MatchaLunaApp?.finalized;
              root.__phase4jCached.stateOrderAtBoot = Object.keys(root.state || {});
              return originalBoot.apply(this, args);
            };
          }
        }
      `,
    });
  });
  await page.goto('index.html?test=1&phase4j-cached=1', { waitUntil: 'load' });
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
  const result = await page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    return {
      probe: root.__phase4jCached,
      finalized: root.MatchaLunaApp?.finalized,
      contractCount: root.MatchaLunaApp?.contractNames?.length,
      scripts: Array.from(
        document.querySelectorAll<HTMLScriptElement>('script[data-cached-phase4j-runtime]'),
        (script) => script.dataset.cachedPhase4jRuntime,
      ),
    };
  });
  await page.close();
  return { result, pageErrors, consoleErrors, runtimeRequests };
}

test('typed State preserves the exact surface, registration, descriptors, runtime, and fallback', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  await openPrimary(page);
  const contract = await page.evaluate(({ names, values, functions, protectedNames }) => {
    const root = window as typeof window & Record<string, any>;
    const facade = root.MatchaLunaApp;
    const stateDomain = facade.domains.state as Record<string, any>;
    const descriptor = (target: object, name: string) => {
      const value = Object.getOwnPropertyDescriptor(target, name)!;
      return {
        configurable: value.configurable,
        enumerable: value.enumerable,
        writable: value.writable,
        get: typeof value.get,
        set: typeof value.set,
      };
    };
    const roundTrips = names.map((name: string, index: number) => {
      const original = stateDomain[name];
      const marker = { stateMarker: index };
      stateDomain[name] = marker;
      const domainToRoot = root[name] === marker;
      root[name] = original;
      const rootToDomain = stateDomain[name] === original;
      return { domainToRoot, rootToDomain };
    });
    return {
      version: facade.contractVersion,
      contractLength: facade.contractNames.length,
      order: Object.keys(stateDomain),
      domainOrder: Object.keys(facade.domains),
      protected: facade.contractNames.filter((name: string) =>
        (names as readonly string[]).includes(name)),
      valueDescriptors: values.map((name: string) => descriptor(stateDomain, name)),
      functionDescriptors: functions.map((name: string) => descriptor(stateDomain, name)),
      rootDescriptors: names.map((name: string) => descriptor(root, name)),
      rootMatches: names.map((name: string) => root[name] === stateDomain[name]),
      roundTrips,
      runtime: Array.from(
        document.querySelectorAll<HTMLScriptElement>('script[data-matcha-luna-runtime]'),
        (script) => script.dataset.matchaLunaRuntime,
      ),
    };
  }, {
    names: [...stateBindingNames],
    values: [...stateValueNames],
    functions: [...stateFunctionNames],
    protectedNames: [...protectedStateNames],
  });

  expect(contract.version).toBe(1);
  expect(contract.contractLength).toBe(175);
  expect(contract.order).toEqual(stateBindingNames);
  expect(contract.domainOrder).toEqual([
    'core', 'runtime', 'state', 'costing', 'catalog', 'stocks', 'workspace',
    'pos', 'publication', 'modals', 'support', 'events', 'bootstrap', 'legacy',
  ]);
  expect(contract.protected).toEqual(protectedStateNames);
  expect(contract.valueDescriptors).toEqual(stateValueNames.map(() => ({
    configurable: true, enumerable: true, writable: undefined,
    get: 'function', set: 'function',
  })));
  expect(contract.functionDescriptors).toEqual(stateFunctionNames.map(() => ({
    configurable: true, enumerable: true, writable: true,
    get: 'undefined', set: 'undefined',
  })));
  expect(contract.rootDescriptors).toEqual(stateBindingNames.map(() => ({
    configurable: true, enumerable: true, writable: undefined,
    get: 'function', set: 'function',
  })));
  expect(contract.rootMatches).toEqual(stateBindingNames.map(() => true));
  expect(contract.roundTrips).toEqual(stateBindingNames.map(() => ({
    domainToRoot: true, rootToDomain: true,
  })));
  expect(contract.runtime).toEqual(activeRuntimeFiles);
  expect(requests.filter((path) => path.endsWith('/state.js'))).toEqual([]);

  const unversionedResponse = await page.request.get(
    'http://127.0.0.1:4173/Scoopies/assets/js/state.js',
  );
  const versionedResponse = await page.request.get(
    'http://127.0.0.1:4173/Scoopies/assets/js/state.js?v=phase4j-cached',
  );
  expect(unversionedResponse.status()).toBe(200);
  expect(versionedResponse.status()).toBe(200);
  const unversionedBytes = Buffer.from(await unversionedResponse.body());
  const versionedBytes = Buffer.from(await versionedResponse.body());
  expect(versionedBytes.equals(unversionedBytes)).toBe(true);
  const served = canonicalLf(unversionedBytes);
  const retained = canonicalLf(readFileSync(resolve(process.cwd(), 'assets/js/state.js')));
  expect(served.equals(retained)).toBe(true);
  expect(gitBlobId(served)).toBe(stateBlob);
  expect(createHash('sha256').update(served).digest('hex')).toBe(stateCanonicalSha256);
});

test('typed State initializes exact values once and honors Runtime replacements before registration', async ({ page, context }) => {
  await page.addInitScript(() => {
    const root = window as typeof window & Record<string, any>;
    localStorage.setItem('scoopies_costing_test', JSON.stringify({
      schemaVersion: 3,
      ingredientCategories: [],
      ingredients: [{ id: 'initializer-marker', name: 'Initializer marker' }],
      mixtureDrafts: [], packaging: [], recipes: [], products: [],
    }));
    let facade: any;
    Object.defineProperty(root, 'MatchaLunaApp', {
      configurable: true,
      get: () => facade,
      set: (next) => {
        facade = next;
        const register = next.registerModule;
        next.registerModule = function (domain: string, descriptors: any) {
          const namespace = register.call(this, domain, descriptors);
          if (domain === 'runtime') {
            root.__stateFactoryCalls = [0, 0, 0, 0];
            const names = [
              'freshPosOpsModal', 'freshPosSalesHistory',
              'freshStockState', 'freshStockModal',
            ];
            names.forEach((name, index) => {
              const original = namespace[name];
              const replacement = () => {
                root.__stateFactoryCalls[index] += 1;
                return { ...original(), stateFactoryMarker: name };
              };
              if (index % 2) root[name] = replacement;
              else namespace[name] = replacement;
            });
          }
          return namespace;
        };
      },
    });
  });
  await openPrimary(page);
  const result = await page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    return {
      factoryCalls: root.__stateFactoryCalls,
      markers: [
        root.posOpsModal.stateFactoryMarker,
        root.posSalesHistory.stateFactoryMarker,
        root.stockState.stateFactoryMarker,
        root.stockModal.stateFactoryMarker,
      ],
      brand: [root.APP_BRAND_NAME, root.APP_BRAND_SLUG],
      storage: [root.KEY, root.DIRTY_KEY, root.SYNCED_KEY, root.CFG_KEY],
      constants: [
        root.POS_HISTORY_PAGE_SIZE, root.POS_SHIFT_HISTORY_PAGE_SIZE,
        root.POS_CATALOG_CACHE_MAX_AGE_MS, root.POS_SILENT_REFRESH_MIN_AGE_MS,
      ],
      booleans: {
        test: root.TEST_MODE, offline: root.offlineMode,
        ready: root.costingCloudReady, pending: root.pendingSave,
        dirty: root.localDirty,
      },
      distinct: {
        stateSynced: root.state !== root.syncedState,
        posStock: root.posCheckout !== root.stockState,
        sentinel: root.MERGE_MISSING !== root.state,
      },
      stateKeys: Object.keys(root.state),
      initializerOrder: {
        stateLoadedFirst: root.state.ingredients[0]?.id === 'initializer-marker',
        syncedDerivedAfterState: root.syncedState.ingredients[0]?.id === 'initializer-marker',
        independentBaseline: root.syncedState !== root.state,
      },
      initialCells: {
        session: root.session,
        currentUserId: root.currentUserId,
        authMode: root.authMode,
        pendingRemote: root.pendingRemote,
        saveTimer: root.saveTimer,
        generations: [
          root.costingLoadGeneration, root.posLoadGeneration,
          root.posCheckoutLoadGeneration, root.posCheckoutSubmitGeneration,
          root.posCatalogGeneration, root.posOpsGeneration,
          root.posHistoryGeneration, root.stockLoadGeneration,
          root.stockMutationGeneration,
        ],
        namesShape: {
          isObject: !!root.NAMES && typeof root.NAMES === 'object',
          count: Object.keys(root.NAMES || {}).length,
        },
        ui: root.ingredientUi,
        sourceMutationsEmpty: Object.keys(root.stockSourceMutations).length === 0,
      },
      cloud: root.cloud,
      saveChainIsPromise: root.cloudSaveChain instanceof Promise,
    };
  });
  expect(result.factoryCalls).toEqual([1, 1, 1, 1]);
  expect(result.markers).toEqual([
    'freshPosOpsModal', 'freshPosSalesHistory', 'freshStockState', 'freshStockModal',
  ]);
  expect(result.brand).toEqual(['Matcha Luna', 'matcha-luna']);
  expect(result.storage).toEqual([
    'scoopies_costing_test', 'scoopies_costing_test_dirty',
    'scoopies_costing_test_synced', 'scoopies_cloud_cfg',
  ]);
  expect(result.constants).toEqual([20, 20, 1_800_000, 30_000]);
  expect(result.booleans).toEqual({
    test: true, offline: true, ready: false, pending: false, dirty: false,
  });
  expect(result.distinct).toEqual({ stateSynced: true, posStock: true, sentinel: true });
  expect(result.stateKeys).toEqual([
    'schemaVersion', 'ingredientCategories', 'ingredients', 'mixtureDrafts',
    'packaging', 'recipes', 'products',
  ]);
  expect(result.initializerOrder).toEqual({
    stateLoadedFirst: true, syncedDerivedAfterState: true, independentBaseline: true,
  });
  expect(result.initialCells).toEqual({
    session: null,
    currentUserId: null,
    authMode: 'login',
    pendingRemote: null,
    saveTimer: null,
    generations: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    namesShape: { isObject: true, count: 2 },
    ui: { search: '', category: 'all' },
    sourceMutationsEmpty: true,
  });
  expect(result.cloud).toEqual({
    url: '', key: '', client: null, connected: false, channel: null,
  });
  expect(result.saveChainIsPromise).toBe(true);

  const cached = await cachedPhase4JProbe(context) as any;
  expect(cached.pageErrors).toEqual([]);
  expect(cached.consoleErrors).toEqual([]);
  expect(cached.result).toEqual({
    probe: {
      factoryCalls: [1, 1, 1, 1],
      bootCalls: 1,
      finalizedAtBoot: true,
      stateOrderAtBoot: [
        'schemaVersion', 'ingredientCategories', 'ingredients', 'mixtureDrafts',
        'packaging', 'recipes', 'products',
      ],
    },
    finalized: true,
    contractCount: 175,
    scripts: transitionRuntimeFiles,
  });
  expect(cached.runtimeRequests).toEqual(
    transitionRuntimeFiles.map((file) => `${file}?v=phase4j-cached`),
  );
});

async function shapeProbe(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const retained = { nested: true };
    const raw = {
      schemaVersion: 1,
      ingredientCategories: [
        { id: 'cat-a', name: ' Main ' },
        { id: 'cat-b', name: 'main' },
        { id: 'cat-c', name: '' },
      ],
      ingredients: [{
        id: 'mix', name: 'Mix', kind: 'mixture', categoryId: 'cat-a',
        batchYield: null, unit: 'invalid',
        components: [{ ingredientId: 'base', qty: null, unit: 'invalid' }],
      }, {
        id: 'purchased', name: 'Purchased', kind: 'unexpected',
        categoryId: 'missing-category', unit: 'unexpected',
      }],
      mixtureDrafts: [{
        id: 'draft', createdAt: '', updatedAt: '2026-11-04T00:00:00.000Z',
        sourceMixtureId: 'mix', sourceSnapshot: { name: 'source' },
        data: {
          id: '', name: 42, categoryId: 'missing-category',
          batchYield: null, unit: 'unexpected',
          components: [{ ingredientId: null, qty: null, unit: 'unexpected' }],
          pendingIngredients: [{
            id: 'pending', kind: 'mixture', categoryId: 'missing-category',
            unit: 'unexpected',
          }],
        },
        quickIngredient: {
          id: 'quick', kind: 'mixture', categoryId: 'missing-category',
          unit: 'unexpected',
        },
      }],
      packaging: [{ id: 'cup', name: 'Cup', extra: retained }],
      recipes: [{ id: 'recipe', name: 'Recipe', lines: [{ ingredientId: 'mix' }] }],
      products: [{ id: 'product', name: 'Product', packLines: [{ packagingId: 'cup' }] }],
      extra: retained,
    };
    const normalized = app.normalizeState(raw);
    const blank = app.blank();
    const cyclic: any = {}; cyclic.self = cyclic;
    const snapSource = { nested: { value: 1 } };
    const snapped = app.snapshot(snapSource);
    const listDataChecks = [
      'ingredientCategories', 'ingredients', 'mixtureDrafts',
      'packaging', 'recipes', 'products',
    ].map((key) => {
      const value = app.blank();
      value[key].push({ id: key });
      return app.hasData(value);
    });
    const invalidCollections = app.normalizeState({
      ingredientCategories: {}, ingredients: 'bad', mixtureDrafts: null,
      packaging: false, recipes: 1, products: {},
    });
    return {
      brands: ['', 'Scoopies', 'sCoOpIeS', '  Luna Special  ', 0]
        .map((value) => app.brandDisplayName(value)),
      blank,
      normalized,
      normalizationEdges: {
        categoryNames: normalized.ingredientCategories.map((item: any) => item.name),
        mixture: normalized.ingredients[0],
        purchased: normalized.ingredients[1],
        draft: normalized.mixtureDrafts[0],
        recipeLineId: normalized.recipes[0].lines[0].id,
        productLineId: normalized.products[0].packLines[0].id,
        invalidCollectionLengths: [
          invalidCollections.ingredientCategories.length,
          invalidCollections.ingredients.length,
          invalidCollections.mixtureDrafts.length,
          invalidCollections.packaging.length,
          invalidCollections.recipes.length,
          invalidCollections.products.length,
        ],
      },
      inputUnchanged: raw.ingredients[0].unit === 'invalid' &&
        raw.ingredientCategories.length === 3,
      retainedUnknownReference: normalized.extra === retained,
      knownRecordCopied: normalized.packaging[0] !== raw.packaging[0],
      hasData: [
        app.hasData(blank), app.hasData(normalized), app.hasData(null),
        ...listDataChecks,
      ],
      snapshot: snapped,
      snapshotIndependent: snapped !== snapSource && snapped.nested !== snapSource.nested,
      cyclicSnapshot: app.snapshot(cyclic),
      unsupportedSnapshots: [app.snapshot(undefined), app.snapshot(BigInt(1))],
    };
  });
}

test('typed State brand, blank, normalization, data, and snapshot helpers match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await shapeProbe(typedPage);
  const classic = await shapeProbe(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed).toMatchObject({
    brands: [
      'Matcha Luna', 'Matcha Luna', 'Matcha Luna', 'Luna Special', 'Matcha Luna',
    ],
    inputUnchanged: true,
    retainedUnknownReference: true,
    knownRecordCopied: true,
    normalizationEdges: {
      categoryNames: ['Main'],
      mixture: {
        kind: 'mixture', categoryId: 'cat-a', batchYield: '', unit: 'ml',
        components: [{ ingredientId: 'base', qty: '', unit: 'g' }],
      },
      purchased: { kind: 'purchased', categoryId: '', unit: 'unexpected' },
      draft: {
        id: 'draft',
        createdAt: '2026-11-04T00:00:00.000Z',
        updatedAt: '2026-11-04T00:00:00.000Z',
        sourceMixtureId: 'mix',
        data: {
          id: 'mix', kind: 'mixture', name: '42', categoryId: '',
          batchYield: '', unit: 'ml',
          components: [{ ingredientId: '', qty: '', unit: 'g' }],
          pendingIngredients: [{
            id: 'pending', kind: 'purchased', categoryId: '', unit: 'g',
          }],
        },
        quickIngredient: {
          id: 'quick', kind: 'purchased', categoryId: '', unit: 'g',
        },
      },
      recipeLineId: 'recipe_line_0',
      productLineId: 'product_pack_0',
      invalidCollectionLengths: [0, 0, 0, 0, 0, 0],
    },
    hasData: [false, true, false, true, true, true, true, true, true],
    snapshotIndependent: true,
    cyclicSnapshot: null,
    unsupportedSnapshots: [null, null],
  });
});

async function storageProbe(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const original = Object.fromEntries([
      'TEST_MODE', 'KEY', 'DIRTY_KEY', 'SYNCED_KEY', 'CFG_KEY',
      'DEFAULT_URL', 'DEFAULT_KEY', 'state', 'localDirty', 'syncedState',
    ].map((name) => [name, app[name]]));
    const storagePrototype = Object.getPrototypeOf(localStorage);
    const originalGetItem = storagePrototype.getItem;
    const originalSetItem = storagePrototype.setItem;
    const originalRemoveItem = storagePrototype.removeItem;
    const keys = [
      'scoopies_costing_v1', 'scoopies_costing_v1_dirty',
      'scoopies_costing_v1_synced', 'scoopies_cloud_cfg',
    ];
    try {
      app.TEST_MODE = false;
      [app.KEY, app.DIRTY_KEY, app.SYNCED_KEY, app.CFG_KEY] = keys;
      app.DEFAULT_URL = 'https://default.invalid';
      app.DEFAULT_KEY = 'default-key';
      keys.forEach((key) => localStorage.removeItem(key));
      sessionStorage.setItem(app.KEY, JSON.stringify({
        ingredients: [{ id: 'session-only', name: 'Wrong storage' }],
      }));
      const stored = app.blank(); stored.ingredients.push({ id: 'milk', name: 'Milk' });
      localStorage.setItem(app.KEY, JSON.stringify(stored));
      const loaded = app.loadLocal();
      const storageIsolation = loaded.ingredients[0]?.id === 'milk';
      const dirtyBefore = app.loadLocalDirty();
      app.localDirty = false;
      app.markLocalDirty();
      const dirtyMarked = [app.localDirty, localStorage.getItem(app.DIRTY_KEY)];
      app.state = loaded;
      app.rememberSynced(loaded, true);
      const remembered = {
        independent: app.syncedState !== loaded,
        dirty: app.localDirty,
        marker: localStorage.getItem(app.DIRTY_KEY),
        stored: JSON.parse(localStorage.getItem(app.SYNCED_KEY) || 'null'),
      };
      app.saveCfg({ url: ' https://configured.invalid ', key: ' configured ' });
      const config = [app.loadCfg(), app.activeUrl(), app.activeKey()];
      localStorage.setItem(app.KEY, '{broken');
      const malformed = app.loadLocal();
      localStorage.setItem(app.SYNCED_KEY, '{broken');
      const malformedSynced = app.loadSyncedLocal();
      localStorage.setItem(app.CFG_KEY, '{broken');
      const malformedCfg = app.loadCfg();
      storagePrototype.getItem = function () { throw new Error('get blocked'); };
      const throwing = [app.loadLocal(), app.loadCfg(), app.loadLocalDirty()];
      storagePrototype.getItem = originalGetItem;
      storagePrototype.setItem = function () { throw new Error('set blocked'); };
      storagePrototype.removeItem = function () { throw new Error('remove blocked'); };
      app.localDirty = false;
      let markThrew = false;
      try { app.markLocalDirty(); } catch { markThrew = true; }
      let rememberThrew = false;
      try { app.rememberSynced(loaded, true); } catch { rememberThrew = true; }
      let configWriteThrew = false;
      try { app.saveCfg({ url: 'blocked', key: 'blocked' }); } catch {
        configWriteThrew = true;
      }
      storagePrototype.setItem = originalSetItem;
      storagePrototype.removeItem = originalRemoveItem;
      localStorage.setItem(app.DIRTY_KEY, '1');
      app.TEST_MODE = true;
      const testModeDirtyIsolation = app.loadLocalDirty();
      return {
        exactKeys: keys, loaded, storageIsolation, dirtyBefore, dirtyMarked,
        remembered, config, malformed, malformedSynced, malformedCfg, throwing,
        writeFailures: {
          markThrew, rememberThrew, configWriteThrew,
          dirtyAfterMark: app.localDirty,
        },
        testModeDirtyIsolation,
      };
    } finally {
      storagePrototype.getItem = originalGetItem;
      storagePrototype.setItem = originalSetItem;
      storagePrototype.removeItem = originalRemoveItem;
      Object.assign(app, original);
      keys.forEach((key) => localStorage.removeItem(key));
      sessionStorage.removeItem('scoopies_costing_v1');
    }
  });
}

test('typed State local and config persistence matches classic across malformed and storage failures', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await storageProbe(typedPage);
  const classic = await storageProbe(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed).toMatchObject({
    exactKeys: [
      'scoopies_costing_v1', 'scoopies_costing_v1_dirty',
      'scoopies_costing_v1_synced', 'scoopies_cloud_cfg',
    ],
    storageIsolation: true,
    dirtyBefore: false,
    dirtyMarked: [true, '1'],
    remembered: { independent: true, dirty: false, marker: null },
    config: [
      { url: ' https://configured.invalid ', key: ' configured ' },
      'https://configured.invalid', 'configured',
    ],
    malformedSynced: null,
    malformedCfg: {},
    writeFailures: {
      markThrew: false, rememberThrew: false,
      configWriteThrew: true, dirtyAfterMark: false,
    },
    testModeDirtyIsolation: false,
  });
});

async function mergeProbe(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const base = app.normalizeState({
      ingredientCategories: [], mixtureDrafts: [], packaging: [], recipes: [], products: [],
      ingredients: [
        { id: 'a', name: 'Base A', unit: 'g', price: 10 },
        { id: 'b', name: 'Delete B', unit: 'g', price: 20 },
        { id: 'conflict', name: 'Base conflict', unit: 'g', price: 30 },
      ],
    });
    const local = app.snapshot(base);
    local.ingredients = [
      { ...local.ingredients[0], name: 'Local A' },
      { ...local.ingredients[2], name: 'Local conflict' },
      { id: 'c', name: 'Local C', unit: 'g', price: 40 },
    ];
    const remote = app.snapshot(base);
    remote.ingredients = [
      { ...remote.ingredients[0], price: 11 },
      remote.ingredients[1],
      { ...remote.ingredients[2], name: 'Remote conflict' },
      { id: 'd', name: 'Remote D', unit: 'g', price: 50 },
    ];
    const merged = app.mergeStates(base, local, remote);
    const missing = app.MERGE_MISSING;
    const nodeCases = {
      remoteWins: app.mergeNode(1, 1, 2),
      localWins: app.mergeNode(1, 2, 1),
      equal: app.mergeNode(1, 2, 2),
      deleteWins: app.mergeNode({ value: 1 }, missing, { value: 1 }) === missing,
      cloned: app.mergeNode({ value: 1 }, { value: 1 }, { value: { deep: true } }),
    };
    return {
      merged,
      ids: merged.ingredients.map((item: any) => item.id),
      a: merged.ingredients.find((item: any) => item.id === 'a'),
      conflict: merged.ingredients.find((item: any) => item.id === 'conflict'),
      baseUnchanged: base.ingredients.map((item: any) => item.name),
      nodeCases,
      sameValues: [
        app.sameMergeValue(missing, missing),
        app.sameMergeValue(missing, undefined),
        app.sameMergeValue({ a: 1 }, { a: 1 }),
      ],
    };
  });
}

test('typed State three-way primitive, object, entity, deletion, conflict, and ordering merges match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await mergeProbe(typedPage);
  const classic = await mergeProbe(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed).toMatchObject({
    ids: ['a', 'conflict', 'd', 'c'],
    a: { name: 'Local A', price: 11 },
    conflict: { name: 'Local conflict' },
    baseUnchanged: ['Base A', 'Delete B', 'Base conflict'],
    nodeCases: { remoteWins: 2, localWins: 2, equal: 2, deleteWins: true },
    sameValues: [true, false, true],
  });
});

async function draftMergeProbe(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const draft = (name: string, updatedAt: string, pendingId: string) => ({
      id: 'draft-1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt,
      sourceMixtureId: '', sourceSnapshot: null,
      data: {
        id: 'mix-1', kind: 'mixture', name, categoryId: '', batchYield: 100,
        unit: 'ml',
        components: [{ ingredientId: pendingId, qty: 10, unit: 'ml' }],
        pendingIngredients: [{
          id: pendingId, kind: 'purchased', name: `${name} source`,
          categoryId: '', purchaseQty: 1, amountPerItem: 100, unit: 'ml', price: 10,
        }],
      },
      quickIngredient: {
        id: `quick-${pendingId}`, kind: 'purchased', name: 'Quick',
        categoryId: '', purchaseQty: 1, amountPerItem: 1, unit: 'g', price: 1,
      },
    });
    const base = app.blank();
    base.mixtureDrafts = [draft('Base', '2026-01-01T00:00:00.000Z', 'pending')];
    const local = app.snapshot(base);
    local.mixtureDrafts = [draft('Local', '2026-01-03T00:00:00.000Z', 'pending')];
    const remote = app.snapshot(base);
    remote.mixtureDrafts = [draft('Remote', '2026-01-02T00:00:00.000Z', 'pending')];
    const merged = app.mergeStates(base, local, remote);
    const copies = merged.mixtureDrafts.map((item: any) => ({
      id: item.id,
      name: item.data.name,
      conflictCopy: !!item.conflictCopy,
      pending: item.data.pendingIngredients.map((entry: any) => entry.id),
      component: item.data.components.map((entry: any) => entry.ingredientId),
      quick: item.quickIngredient && item.quickIngredient.id,
    }));
    const reorderA = { z: 1, a: { second: 2, first: 1 } };
    const reorderB = { a: { first: 1, second: 2 }, z: 1 };
    const mutable = draft('Mutable', '2026-01-04T00:00:00.000Z', 'owned');
    app.remapDraftOwnedIds(mutable.data, mutable.quickIngredient,
      (old: string, kind: string, index: number) => `${old || kind}-mapped-${index}`);
    return {
      copies,
      stableReorder: app.stableDraftHash(app.stableSerialize(reorderA)) ===
        app.stableDraftHash(app.stableSerialize(reorderB)),
      conflictKeys: [app.draftConflictKey(local.mixtureDrafts[0]),
        app.draftConflictKey(remote.mixtureDrafts[0])],
      remapped: {
        pending: mutable.data.pendingIngredients[0].id,
        component: mutable.data.components[0].ingredientId,
        quick: mutable.quickIngredient.id,
      },
      inputsUnchanged: [
        local.mixtureDrafts[0].data.pendingIngredients[0].id,
        remote.mixtureDrafts[0].data.pendingIngredients[0].id,
      ],
    };
  });
}

test('typed State whole-draft conflicts, hashes, owned-ID remapping, and isolation match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await draftMergeProbe(typedPage);
  const classic = await draftMergeProbe(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  const result = typed as any;
  expect(result.copies).toHaveLength(2);
  expect(result.copies[0]).toMatchObject({ id: 'draft-1', name: 'Local', conflictCopy: false });
  expect(result.copies[1].id).toMatch(/^draft-1_conflict_/);
  expect(result.copies[1].conflictCopy).toBe(true);
  expect(result.copies[1].pending[0]).toMatch(/_copy_/);
  expect(result.copies[1].component[0]).toBe(result.copies[1].pending[0]);
  expect(result.stableReorder).toBe(true);
  expect(result.remapped).toEqual({
    pending: 'owned-mapped-0', component: 'owned-mapped-0',
    quick: 'quick-owned-mapped-0',
  });
  expect(result.inputsUnchanged).toEqual(['pending', 'pending']);
});

async function saveProbe(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const originals = Object.fromEntries([
      'TEST_MODE', 'KEY', 'state', 'cloud', 'session', 'pendingSave', 'pendingRemote',
      'saveTimer', 'saveVersion', 'localDirty', 'stockScopedSourceDeletes',
      'consumePendingRemoteForCommit', 'cloudSave', 'rememberSynced',
      'setTimeout', 'clearTimeout',
    ].map((name) => [name, app[name]]));
    const trace: any[] = [];
    const timers = new Map<number, { callback: () => void; canceled: boolean }>();
    const deferred: Array<{
      resolve: () => void;
      reject: (error: Error) => void;
    }> = [];
    const storagePrototype = Object.getPrototypeOf(localStorage);
    const originalSetItem = storagePrototype.setItem;
    const flush = async () => {
      for (let index = 0; index < 8; index += 1) await Promise.resolve();
    };
    try {
      app.TEST_MODE = true;
      app.KEY = 'scoopies_costing_test';
      localStorage.removeItem(app.KEY);
      app.state = app.blank();
      app.state.ingredients.push({ id: 'milk', name: 'Milk' });
      app.cloud = { connected: true, client: {}, channel: null };
      app.session = { user: { id: 'save-user' } };
      app.pendingSave = false; app.pendingRemote = null;
      app.saveTimer = null; app.saveVersion = 0; app.localDirty = false;
      app.stockScopedSourceDeletes = () => [];
      app.consumePendingRemoteForCommit = (value: unknown) => {
        const hadRemote = !!app.pendingRemote;
        trace.push(['consume', value, hadRemote]);
        if (hadRemote) app.pendingRemote = null;
      };
      app.cloudSave = (payload: any) => {
        trace.push(['cloudSave', {
          schemaVersion: payload?.schemaVersion,
          ingredientCount: payload?.ingredients?.length,
        }]);
        return new Promise<void>((resolve, reject) => deferred.push({ resolve, reject }));
      };
      app.rememberSynced = (payload: any, clean: boolean) => {
        trace.push(['remember', {
          schemaVersion: payload?.schemaVersion,
          ingredientCount: payload?.ingredients?.length,
        }, clean]);
        if (clean) app.localDirty = false;
      };
      Reflect.set(app, 'setTimeout', (callback: () => void, delay: number) => {
        const id = timers.size + 1;
        trace.push(['setTimeout', id, delay]);
        timers.set(id, { callback, canceled: false });
        return id;
      });
      Reflect.set(app, 'clearTimeout', (id: number | null) => {
        trace.push(['clearTimeout', id]);
        const timer = id == null ? undefined : timers.get(id);
        if (timer) timer.canceled = true;
      });
      storagePrototype.setItem = function (key: string, value: string) {
        if (key === app.KEY) {
          const parsed = JSON.parse(value);
          trace.push(['localSet', {
            schemaVersion: parsed.schemaVersion,
            ingredientCount: parsed.ingredients.length,
          }]);
        }
        return originalSetItem.call(this, key, value);
      };

      app.save();
      const firstScheduled = {
        pending: app.pendingSave, dirty: app.localDirty, version: app.saveVersion,
        timer: app.saveTimer, status: document.getElementById('syncStatus')?.textContent,
      };
      app.state.ingredients.push({ id: 'tea', name: 'Tea' });
      app.save();
      const replacement = {
        pending: app.pendingSave,
        version: app.saveVersion,
        timer: app.saveTimer,
        firstCanceled: timers.get(1)?.canceled,
        localBeforeAnyCloud: trace.filter((entry) => entry[0] === 'localSet').length === 2 &&
          trace.every((entry) => entry[0] !== 'cloudSave'),
      };
      timers.get(1)?.callback();
      timers.get(2)?.callback();
      await flush();
      const inFlight = {
        cloudCalls: deferred.length,
        pending: app.pendingSave,
        version: app.saveVersion,
      };
      const remote = app.blank();
      remote.ingredients.push({ id: 'remote', name: 'Remote' });
      app.pendingRemote = remote;
      deferred[0].reject(new Error('stale failure'));
      await flush();
      const staleFailure = {
        pending: app.pendingSave,
        status: document.getElementById('syncStatus')?.textContent,
      };
      deferred[1].resolve();
      await flush();
      const recursive = {
        version: app.saveVersion,
        timer: app.saveTimer,
        pending: app.pendingSave,
        remote: app.pendingRemote,
        timerCount: timers.size,
      };
      timers.get(3)?.callback();
      await flush();
      deferred[2].resolve();
      await flush();
      const completed = {
        pending: app.pendingSave, remote: app.pendingRemote, dirty: app.localDirty,
        status: document.getElementById('syncStatus')?.textContent,
      };

      app.state.ingredients.push({ id: 'cream', name: 'Cream' });
      app.save();
      timers.get(4)?.callback();
      await flush();
      deferred[3].reject(new Error('current failure'));
      await flush();
      const currentFailure = {
        pending: app.pendingSave,
        dirty: app.localDirty,
        status: document.getElementById('syncStatus')?.textContent,
      };

      app.stockScopedSourceDeletes = () => [{ source: 'blocked' }];
      app.pendingSave = false; app.saveTimer = null;
      app.save();
      const blocked = {
        pending: app.pendingSave, timer: app.saveTimer,
        status: document.getElementById('syncStatus')?.textContent,
      };
      return {
        trace, firstScheduled, replacement, inFlight, staleFailure,
        recursive, completed, currentFailure, blocked,
      };
    } finally {
      storagePrototype.setItem = originalSetItem;
      Object.assign(app, originals);
      localStorage.removeItem('scoopies_costing_test');
    }
  });
}

test('typed State local-first save, debounce, versions, completion, and source guard match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await saveProbe(typedPage);
  const classic = await saveProbe(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed).toMatchObject({
    firstScheduled: {
      pending: true, dirty: true, version: 1, timer: 1, status: 'Saving…',
    },
    replacement: {
      pending: true, version: 2, timer: 2,
      firstCanceled: true, localBeforeAnyCloud: true,
    },
    inFlight: { cloudCalls: 2, pending: true, version: 2 },
    staleFailure: { pending: true, status: 'Saving…' },
    recursive: { version: 3, timer: 3, pending: true, remote: null, timerCount: 3 },
    completed: {
      pending: false, remote: null, dirty: false, status: 'Saved to cloud ✓',
    },
    currentFailure: {
      pending: false, dirty: true, status: 'Saved on device — will retry cloud',
    },
    blocked: {
      pending: false, timer: null,
      status: 'Inventory source recovery pending - refresh Stocks',
    },
  });
  expect((typed as any).trace.filter((entry: any[]) => entry[0] === 'setTimeout'))
    .toEqual([
      ['setTimeout', 1, 600], ['setTimeout', 2, 600],
      ['setTimeout', 3, 600], ['setTimeout', 4, 600],
    ]);
});

async function clientProbe(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const originalSupabase = app.supabase;
    const originalHandleAuth = app.handleAuth;
    const trace: any[] = [];
    try {
      app.supabase = null;
      const missing = app.initClient('https://missing.invalid', 'key');
      const missingStatus = document.getElementById('syncStatus')?.textContent;
      const client: any = {
        marker: 'client',
        auth: {
          marker: 'auth',
          onAuthStateChange(callback: (...args: any[]) => unknown) {
            trace.push(['listenerReceiver', this.marker]);
            client.listener = callback;
          },
        },
      };
      app.supabase = {
        marker: 'supabase',
        createClient(url: string, key: string, options: unknown) {
          trace.push([
            'createReceiver', this.marker,
            { secureUrl: /^https:\/\//.test(url), hasKey: key.length > 0 },
            options,
          ]);
          return client;
        },
      };
      app.handleAuth = (session: any, event: string) => trace.push([
        'handleAuth',
        { hasSession: !!session, hasUser: !!session?.user, hasUserId: !!session?.user?.id },
        event,
      ]);
      const empty = app.initClient('', 'key');
      const success = app.initClient('https://project.invalid', 'publishable');
      client.listener('TOKEN_REFRESHED', { user: { id: 'user' } });
      return {
        missing, missingStatus, empty, success, trace,
        cloud: {
          secureUrl: /^https:\/\//.test(app.cloud.url),
          hasKey: !!app.cloud.key,
          sameClient: app.cloud.client === client,
        },
      };
    } finally {
      app.supabase = originalSupabase;
      app.handleAuth = originalHandleAuth;
    }
  });
}

async function deferredBootstrapProbe(context: BrowserContext): Promise<unknown> {
  const page = await context.newPage();
  const supabaseScript = `
    (() => {
      let release;
      const sessionLookup = new Promise((resolve) => { release = resolve; });
      const probe = window.__stateDeferredBoot = {
        getSessionCalls: 0, listenerCalls: 0, bootCalls: 0,
        bootSettled: false, finalizedAtBoot: false,
        lateAuth: null, release: () => release({ data: { session: { user: { id: 'not-reported' } } } })
      };
      const auth = {
        getSession() { probe.getSessionCalls += 1; return sessionLookup; },
        onAuthStateChange(callback) {
          probe.listenerCalls += 1;
          probe.listenerShape = typeof callback === 'function';
        }
      };
      const client = {
        auth,
        realtime: { setAuth() {} },
        from() { throw new Error('Unexpected cloud query in deferred Bootstrap fixture'); }
      };
      window.supabase = { createClient() { return client; } };
    })();
  `;
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'MatchaLunaApp', {
      configurable: true,
      enumerable: true,
      get: () => undefined,
      set: (facade: any) => {
        Object.defineProperty(window, 'MatchaLunaApp', {
          configurable: true,
          enumerable: true,
          value: facade,
          writable: true,
        });
        const originalRegisterModule = facade.registerModule;
        facade.registerModule = function (
          domain: string,
          descriptors: Record<string, PropertyDescriptor>,
        ) {
          if (domain === 'bootstrap') {
            const bootDescriptor = descriptors.boot;
            const originalBoot = bootDescriptor.value;
            descriptors = {
              ...descriptors,
              boot: {
                ...bootDescriptor,
                value: function (this: unknown, ...args: unknown[]) {
                  const probe = (window as any).__stateDeferredBoot;
                  probe.bootCalls += 1;
                  probe.finalizedAtBoot = !!(window as any).MatchaLunaApp?.finalized;
                  const result = originalBoot.apply(this, args);
                  probe.bootReturnedPromise = !!result &&
                    typeof result.then === 'function';
                  Promise.resolve(result).then(
                    () => { probe.bootSettled = true; },
                    () => { probe.bootSettled = true; },
                  );
                  return result;
                },
              },
            };
          }
          return originalRegisterModule.call(this, domain, descriptors);
        };
      },
    });
  });
  await installNetworkGuards(page, supabaseScript);
  await page.goto('index.html?deferred-bootstrap=1', { waitUntil: 'load' });
  await page.evaluate(() =>
    (window as typeof window & { MatchaLunaApp: { ready: Promise<void> } })
      .MatchaLunaApp.ready,
  );
  const beforeRelease = await page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    const probe = root.__stateDeferredBoot;
    return {
      getSessionCalls: probe.getSessionCalls,
      listenerCalls: probe.listenerCalls,
      listenerShape: probe.listenerShape,
      bootCalls: probe.bootCalls,
      finalizedAtBoot: probe.finalizedAtBoot,
      bootReturnedPromise: probe.bootReturnedPromise,
      bootSettled: probe.bootSettled,
      facadeReady: root.MatchaLunaApp.finalized,
    };
  });
  await page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    root.handleAuth = async (session: any, event: unknown) => {
      root.__stateDeferredBoot.lateAuth = {
        hasSession: !!session,
        hasUser: !!session?.user,
        hasUserId: !!session?.user?.id,
        eventWasOmitted: event === undefined,
      };
      root.offlineMode = false;
      root.lastState = { writtenThroughRootAccessor: true };
    };
    root.MatchaLunaApp.domains.state.offlineMode = true;
    root.__stateDeferredBoot.release();
  });
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & Record<string, any>).__stateDeferredBoot.bootSettled,
  )).toBe(true);
  const afterRelease = await page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    const stateDomain = root.MatchaLunaApp.domains.state as Record<string, any>;
    return {
      lateAuth: root.__stateDeferredBoot.lateAuth,
      bootCalls: root.__stateDeferredBoot.bootCalls,
      rootOffline: root.offlineMode,
      domainOffline: stateDomain.offlineMode,
      rootLastStateMarker: root.lastState?.writtenThroughRootAccessor,
      domainLastStateMarker: stateDomain.lastState?.writtenThroughRootAccessor,
    };
  });
  await page.close();
  return { beforeRelease, afterRelease, pageErrors, consoleErrors };
}

test('typed State client creation, exact auth options, receivers, and live listener match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await clientProbe(typedPage);
  const classic = await clientProbe(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed).toMatchObject({
    missing: false, missingStatus: 'No internet', empty: false, success: true,
    cloud: { secureUrl: true, hasKey: true, sameClient: true },
    trace: [
      ['createReceiver', 'supabase', { secureUrl: true, hasKey: true }, {
        auth: { persistSession: true, autoRefreshToken: true },
      }],
      ['listenerReceiver', 'auth'],
      ['handleAuth', { hasSession: true, hasUser: true, hasUserId: true }, 'TOKEN_REFRESHED'],
    ],
  });

  const testModeBootstrapAccessors = await typedPage.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    const stateDomain = root.MatchaLunaApp.domains.state;
    return {
      offline: [root.offlineMode, stateDomain.offlineMode],
      lastStateIsSnapshot: !!root.lastState &&
        root.lastState !== root.state &&
        root.lastState.schemaVersion === root.state.schemaVersion,
      domainSharesLastState: stateDomain.lastState === root.lastState,
    };
  });
  expect(testModeBootstrapAccessors).toEqual({
    offline: [true, true], lastStateIsSnapshot: true, domainSharesLastState: true,
  });
  const deferred = await deferredBootstrapProbe(context) as any;
  expect(deferred.pageErrors).toEqual([]);
  expect(deferred.consoleErrors).toEqual([]);
  expect(deferred.beforeRelease).toEqual({
    getSessionCalls: 1,
    listenerCalls: 1,
    listenerShape: true,
    bootCalls: 1,
    finalizedAtBoot: true,
    bootReturnedPromise: true,
    bootSettled: false,
    facadeReady: true,
  });
  expect(deferred.afterRelease).toEqual({
    lateAuth: {
      hasSession: true, hasUser: true, hasUserId: true, eventWasOmitted: true,
    },
    bootCalls: 1,
    rootOffline: false,
    domainOffline: false,
    rootLastStateMarker: true,
    domainLastStateMarker: true,
  });
});

async function cloudProbe(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const originalDate = app.Date;
    const trace: any[] = [];
    const releases: Array<() => void> = [];
    try {
      Reflect.set(app, 'Date', class {
        toISOString() { return '2026-11-04T00:00:00.000Z'; }
      });
      const loadQuery: any = {
        select(columns: string) { trace.push(['select', this === loadQuery, columns]); return this; },
        eq(column: string, value: string) {
          trace.push(['eq', this === loadQuery, column, value]); return this;
        },
        async maybeSingle() {
          trace.push(['maybeSingle', this === loadQuery]);
          return { data: { data: { ingredients: [{ id: 'milk', name: 'Milk' }] } } };
        },
      };
      const saveTable: any = {
        upsert(payload: unknown, options: unknown) {
          const index = releases.length;
          trace.push(['upsert', this === saveTable, index, payload, options]);
          return new Promise((resolve) => releases.push(() => resolve({ error: null })));
        },
      };
      const client: any = {
        from(table: string) {
          trace.push(['from', this === client, table]);
          return table === 'scoopies_state' && trace.filter((item) => item[0] === 'from').length === 1
            ? loadQuery : saveTable;
        },
      };
      app.cloud = { client, connected: true, channel: null };
      const loaded = await app.cloudLoad();
      app.cloudSaveChain = Promise.resolve();
      const first = app.cloudSave({ schemaVersion: 3, ingredients: [{ id: 'a' }] });
      const second = app.cloudSave({ schemaVersion: 3, ingredients: [{ id: 'b' }] });
      await Promise.resolve(); await Promise.resolve();
      const startsBeforeFirstRelease = trace.filter((item) => item[0] === 'upsert').length;
      releases[0](); await first; await Promise.resolve(); await Promise.resolve();
      const startsAfterFirstRelease = trace.filter((item) => item[0] === 'upsert').length;
      releases[1](); await second;
      const errorQuery: any = {
        select() { return this; }, eq() { return this; },
        async maybeSingle() { return { error: { message: 'cloud read failed' } }; },
      };
      app.cloud.client = { from: () => errorQuery };
      let loadError = '';
      try { await app.cloudLoad(); } catch (error) {
        loadError = (error as Error).message;
      }
      return {
        loaded,
        startsBeforeFirstRelease,
        startsAfterFirstRelease,
        loadError,
        trace,
      };
    } finally {
      Reflect.set(app, 'Date', originalDate);
    }
  });
}

test('typed State cloud load/save payloads, timestamps, serialization, receivers, and failures match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await cloudProbe(typedPage);
  const classic = await cloudProbe(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed).toMatchObject({
    startsBeforeFirstRelease: 1,
    startsAfterFirstRelease: 2,
    loadError: 'cloud read failed',
  });
  const trace = (typed as any).trace;
  expect(trace).toContainEqual(['select', true, 'data']);
  expect(trace).toContainEqual(['eq', true, 'id', 'main']);
  expect(trace).toContainEqual(['maybeSingle', true]);
  expect(trace.filter((item: any[]) => item[0] === 'upsert')).toEqual([
    ['upsert', true, 0, {
      id: 'main', data: { schemaVersion: 3, ingredients: [{ id: 'a' }] },
      updated_at: '2026-11-04T00:00:00.000Z',
    }, { onConflict: 'id' }],
    ['upsert', true, 1, {
      id: 'main', data: { schemaVersion: 3, ingredients: [{ id: 'b' }] },
      updated_at: '2026-11-04T00:00:00.000Z',
    }, { onConflict: 'id' }],
  ]);
});

async function remoteProbe(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const originals = Object.fromEntries([
      'state', 'localDirty', 'pendingSave', 'pendingRemote', 'lastState',
      'categoryModalOpen', 'purchasedIngredientModalOpen', 'mixtureModalOpen',
      'draftsModalOpen', 'publishModalOpen', 'posOpsModal', 'stockModal',
      'rememberSynced', 'renderAll', 'setStatus',
    ].map((name) => [name, app[name]]));
    const trace: any[] = [];
    try {
      const base = app.blank();
      base.ingredients.push({ id: 'base', name: 'Base' });
      const remote = app.blank();
      remote.ingredients.push({ id: 'remote', name: 'Remote' });
      app.state = app.normalizeState(base);
      app.localDirty = false; app.pendingSave = false; app.pendingRemote = null;
      app.categoryModalOpen = false; app.purchasedIngredientModalOpen = false;
      app.mixtureModalOpen = false; app.draftsModalOpen = false;
      app.publishModalOpen = false; app.posOpsModal = { open: false };
      app.stockModal = { open: false };
      app.rememberSynced = (value: unknown, clean: boolean) =>
        trace.push(['remember', app.snapshot(value), clean]);
      app.renderAll = () => trace.push(['render']);
      app.setStatus = (text: string, kind: string) => trace.push(['status', text, kind]);
      const editingStates: boolean[] = [];
      editingStates.push(app.appIsEditing());
      app.categoryModalOpen = true;
      editingStates.push(app.appIsEditing());
      app.categoryModalOpen = false;
      const input = document.createElement('input');
      document.querySelector('.wrap')?.appendChild(input); input.focus();
      editingStates.push(app.appIsEditing()); input.remove();
      app.maybeApplyRemote(app.snapshot(app.state));
      const echo = { pending: app.pendingRemote, trace: app.snapshot(trace) };
      trace.length = 0;
      app.localDirty = true;
      app.maybeApplyRemote(remote);
      const queued = { pendingId: app.pendingRemote?.ingredients?.[0]?.id, trace: app.snapshot(trace) };
      trace.length = 0;
      app.localDirty = false; app.pendingRemote = null;
      app.maybeApplyRemote(remote);
      const applied = {
        stateId: app.state.ingredients[0].id,
        pending: app.pendingRemote,
        lastStateId: app.lastState.ingredients[0].id,
        trace: app.snapshot(trace),
      };
      return { editingStates, echo, queued, applied };
    } finally {
      Object.assign(app, originals);
    }
  });
}

test('typed State editing detection and remote echo, queue, cache, render, and status behavior match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await remoteProbe(typedPage);
  const classic = await remoteProbe(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed).toMatchObject({
    editingStates: [false, true, true],
    echo: { pending: null },
    queued: { pendingId: 'remote', trace: [] },
    applied: {
      stateId: 'remote', pending: null, lastStateId: 'remote',
      trace: [
        ['remember', expect.any(Object), true],
        ['render'],
        ['status', 'Updated from partner ✓', 'good'],
      ],
    },
  });
});

async function retryProbe(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const originals = Object.fromEntries([
      'retryingDirty', 'cloud', 'session', 'localDirty', 'pendingSave',
      'stockScopedSourceDeletes', 'stockRecoverSourceDeletes', 'cloudLoad',
      'consumePendingRemoteForCommit', 'save', 'setStatus',
    ].map((name) => [name, app[name]]));
    const trace: any[] = [];
    try {
      app.retryingDirty = false;
      app.cloud = { connected: true, client: {}, channel: null };
      app.session = { user: { id: 'retry-user' } };
      app.localDirty = true; app.pendingSave = false;
      let deletes = [{ id: 'pending-delete' }];
      app.stockScopedSourceDeletes = () => deletes;
      app.stockRecoverSourceDeletes = async () => {
        trace.push(['recover']); deletes = [];
      };
      app.cloudLoad = async () => {
        trace.push(['load']); return { ingredients: [{ id: 'remote' }] };
      };
      app.consumePendingRemoteForCommit = (force: boolean) =>
        trace.push(['consume', force, app.pendingRemote?.ingredients?.[0]?.id]);
      app.save = () => trace.push(['save']);
      app.setStatus = (text: string, kind: string) => trace.push(['status', text, kind]);
      const returned = await app.retryDirtySave();
      const success = {
        returned, trace: app.snapshot(trace), retrying: app.retryingDirty,
        pendingRemote: app.pendingRemote,
      };
      trace.length = 0; deletes = [];
      app.retryingDirty = false; app.localDirty = true;
      app.cloudLoad = async () => { trace.push(['load']); throw new Error('offline'); };
      await app.retryDirtySave();
      const failure = { trace: app.snapshot(trace), retrying: app.retryingDirty };
      app.retryingDirty = true;
      const beforeGuard = trace.length;
      await app.retryDirtySave();
      return { success, failure, guardAdded: trace.length - beforeGuard };
    } finally {
      Object.assign(app, originals);
    }
  });
}

test('typed State dirty retry, source recovery, merge dispatch, failure, cleanup, and guards match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await retryProbe(typedPage);
  const classic = await retryProbe(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed).toMatchObject({
    success: {
      retrying: false,
      trace: [
        ['status', 'Checking cloud before retry…', ''], ['recover'], ['load'],
        ['consume', false, 'remote'], ['save'],
      ],
    },
    failure: {
      retrying: false,
      trace: [
        ['status', 'Checking cloud before retry…', ''], ['load'],
        ['status', 'Saved on device — will retry cloud', 'bad'],
      ],
    },
    guardAdded: 0,
  });
});

async function realtimeProbe(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const originals = Object.fromEntries([
      'cloud', 'maybeApplyRemote', 'loadHistory',
    ].map((name) => [name, app[name]]));
    const trace: any[] = [];
    const callbacks: Array<(payload?: any) => void> = [];
    try {
      const oldChannel = { id: 'old' };
      const channel: any = {
        on(event: string, filter: unknown, callback: (payload?: any) => void) {
          trace.push(['on', this === channel, event, filter]); callbacks.push(callback); return this;
        },
        subscribe() { trace.push(['subscribe', this === channel]); return this; },
      };
      const client: any = {
        removeChannel(value: unknown) { trace.push(['remove', this === client, value === oldChannel]); },
        channel(name: string) { trace.push(['channel', this === client, name]); return channel; },
      };
      app.cloud = { client, connected: true, channel: oldChannel };
      app.maybeApplyRemote = (value: unknown) => trace.push(['remote', value]);
      app.loadHistory = () => trace.push(['history']);
      document.getElementById('history')?.classList.add('active');
      app.subscribeRealtime();
      callbacks[0]({ new: { data: { revision: 2 } } });
      callbacks[1]();
      const installedChannel = app.cloud.channel === channel;
      app.cloud = {
        client: { channel() { throw new Error('channel blocked'); } },
        connected: true, channel: null,
      };
      let swallowed = true;
      try { app.subscribeRealtime(); } catch { swallowed = false; }
      return { trace, installedChannel, swallowed };
    } finally {
      document.getElementById('history')?.classList.remove('active');
      Object.assign(app, originals);
    }
  });
}

test('typed State realtime removal, filters, callbacks, receivers, and swallowed setup failures match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await realtimeProbe(typedPage);
  const classic = await realtimeProbe(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed).toMatchObject({ installedChannel: true, swallowed: true });
  expect((typed as any).trace).toEqual([
    ['remove', true, true],
    ['channel', true, 'scoopies-rt'],
    ['on', true, 'postgres_changes', {
      event: '*', schema: 'public', table: 'scoopies_state',
    }],
    ['on', true, 'postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'scoopies_activity',
    }],
    ['subscribe', true],
    ['remote', { revision: 2 }],
    ['history'],
  ]);
});

async function historyProbe(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const originals = Object.fromEntries([
      'state', 'lastState', 'session', 'cloud', 'NAMES',
    ].map((name) => [name, app[name]]));
    const trace: any[] = [];
    try {
      const oldState = app.blank();
      oldState.ingredientCategories.push({ id: 'old-cat', name: 'Old' });
      oldState.ingredients.push({
        id: 'milk', name: 'Milk', kind: 'purchased', categoryId: 'old-cat',
        purchaseQty: 1, amountPerItem: 1000, unit: 'ml', price: 100,
      });
      const newState = app.snapshot(oldState);
      newState.ingredientCategories.push({ id: 'new-cat', name: 'New' });
      newState.ingredients[0].name = 'Oat Milk';
      newState.ingredients[0].categoryId = 'new-cat';
      newState.ingredients[0].price = 120;
      newState.recipes.push({ id: 'recipe', name: 'Latte', lines: [] });
      app.state = app.normalizeState(newState);
      app.lastState = app.normalizeState(oldState);
      app.session = { user: { id: 'history-user', email: 'owner@example.test' } };
      app.NAMES = { 'owner@example.test': 'Owner' };
      const rows = [
        {
          at: '2026-11-04T04:30:00.000Z', actor: '<Owner>',
          summary: '<img id="state-history-unsafe"> Changed',
        },
        { at: '2026-11-03T04:00:00.000Z', actor: 'Partner', summary: 'Added milk' },
      ];
      let queryMode = 'rows';
      let releaseRows: (() => void) | null = null;
      const query: any = {
        select(columns: string) { trace.push(['select', this === query, columns]); return this; },
        order(column: string, options: unknown) {
          trace.push(['order', this === query, column, options]); return this;
        },
        gte(column: string, value: string) { trace.push(['gte', column, value]); return this; },
        lt(column: string, value: string) { trace.push(['lt', column, value]); return this; },
        limit(limit: number) {
          trace.push(['limit', this === query, limit]);
          if (queryMode === 'deferred-rows') {
            return new Promise((resolve) => {
              releaseRows = () => resolve({ data: rows, error: null });
            });
          }
          if (queryMode === 'empty') return Promise.resolve({ data: [], error: null });
          if (queryMode === 'error') {
            return Promise.resolve({
              data: null, error: { message: '<img id="state-history-error-unsafe"> failed' },
            });
          }
          return Promise.resolve({ data: rows, error: null });
        },
      };
      const insertTable: any = {
        insert(payload: unknown) {
          trace.push(['insert', this === insertTable, payload]); return Promise.resolve({ error: null });
        },
      };
      const client: any = {
        from(table: string) {
          trace.push(['from', this === client, table]);
          return trace.filter((item) => item[0] === 'from').length <= 2
            ? insertTable : query;
        },
      };
      app.cloud = { client, connected: true, channel: null };
      const helpers = {
        actor: app.actorName(),
        fmtv: [app.fmtv(''), app.fmtv(null), app.fmtv(0)],
        category: [app.categoryNameIn(oldState, 'old-cat'), app.categoryNameIn(oldState, '')],
        diff: app.diffStates(oldState, newState),
        time: app.fmtTime(rows[0].at),
        day: app.fmtDay(rows[0].at),
        key: app.dayKey(rows[0].at),
      };
      app.logChanges();
      app.logCoarse('Manual history marker');
      const dateInput = document.getElementById('histDate') as HTMLInputElement | null;
      if (dateInput) dateInput.value = '';
      const history = document.getElementById('historyList');
      queryMode = 'deferred-rows';
      const rowsPromise = app.loadHistory();
      const loadingText = history?.textContent;
      (releaseRows as (() => void) | null)?.();
      await rowsPromise;
      const rowsText = history?.textContent;
      const rowsUnsafeRendered = !!document.getElementById('state-history-unsafe');
      queryMode = 'empty';
      if (dateInput) dateInput.value = '2026-11-04';
      await app.loadHistory();
      const filteredEmptyText = history?.textContent;
      if (dateInput) dateInput.value = '';
      await app.loadHistory();
      const allEmptyText = history?.textContent;
      queryMode = 'error';
      await app.loadHistory();
      const errorText = history?.textContent;
      const errorUnsafeRendered = !!document.getElementById('state-history-error-unsafe');
      app.session = null;
      await app.loadHistory();
      const signedOutText = history?.textContent;
      const filterTrace = trace.filter((entry) => entry[0] === 'gte' || entry[0] === 'lt');
      return {
        helpers,
        trace,
        renderStates: {
          loadingText, rowsText, rowsUnsafeRendered, filteredEmptyText,
          allEmptyText, errorText, errorUnsafeRendered, signedOutText,
        },
        filterTrace,
        lastStateName: app.lastState.ingredients[0].name,
      };
    } finally {
      Object.assign(app, originals);
    }
  });
}

test('typed State actors, diffs, logs, locale helpers, history query, escaping, and DOM match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await historyProbe(typedPage);
  const classic = await historyProbe(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  const result = typed as any;
  expect(result.helpers.actor).toBe('Owner');
  expect(result.helpers.fmtv).toEqual(['(blank)', '(blank)', 0]);
  expect(result.helpers.category).toEqual(['Old', 'Uncategorized']);
  expect(result.helpers.diff).toEqual(expect.arrayContaining([
    'Added category "New"',
    'Renamed ingredient "Milk" → "Oat Milk"',
    '"Oat Milk" total price ₱100 → ₱120',
    'Moved "Oat Milk" from Old to New',
    'Added recipe "Latte"',
  ]));
  expect(result.trace).toContainEqual(['select', true, 'at,actor,summary']);
  expect(result.trace).toContainEqual(['order', true, 'at', { ascending: false }]);
  expect(result.trace).toContainEqual(['limit', true, 500]);
  expect(result.renderStates).toEqual({
    loadingText: 'Loading…',
    rowsText: expect.stringContaining('<img id="state-history-unsafe"> Changed'),
    rowsUnsafeRendered: false,
    filteredEmptyText: 'No changes on that date.',
    allEmptyText: 'No changes logged yet. Edit something and it will appear here.',
    errorText: 'Could not load history: <img id="state-history-error-unsafe"> failed',
    errorUnsafeRendered: false,
    signedOutText: 'Sign in to see the history.',
  });
  expect(result.filterTrace).toHaveLength(2);
  expect(result.filterTrace[0][0]).toBe('gte');
  expect(result.filterTrace[1][0]).toBe('lt');
  expect(new Date(result.filterTrace[1][2]).getTime() -
    new Date(result.filterTrace[0][2]).getTime()).toBe(86_400_000);
  expect(result.lastStateName).toBe('Oat Milk');
});

async function authUiProbe(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const names = [
      'cloud', 'session', 'offlineMode', 'authMode', 'currentUserId',
      'costingCloudReady', 'costingCloudLoading', 'resetPosContext',
      'renderAll', 'renderAccount', 'setStatus', 'alert',
    ];
    const originals = Object.fromEntries(names.map((name) => [name, app[name]]));
    const trace: any[] = [];
    try {
      const auth: any = {
        async signInWithPassword(payload: any) {
          trace.push(['signIn', this === auth, {
            keys: Object.keys(payload || {}).sort(),
            hasEmail: !!payload?.email,
            hasPassword: !!payload?.password,
          }]);
          return { data: { session: {} }, error: null };
        },
        async signUp(payload: any) {
          trace.push(['signUp', this === auth, {
            keys: Object.keys(payload || {}).sort(),
            hasEmail: !!payload?.email,
            hasPassword: !!payload?.password,
          }]);
          return { data: { session: {} }, error: null };
        },
        async signOut() { trace.push(['signOut', this === auth]); },
      };
      const client: any = {
        auth,
        removeChannel(channel: unknown) { trace.push(['removeChannel', this === client, channel]); },
      };
      app.cloud = { client, connected: true, channel: { id: 'channel' }, url: '', key: '' };
      app.resetPosContext = (message: string) => trace.push(['reset', message]);
      app.renderAll = () => trace.push(['renderAll']);
      app.renderAccount = originals.renderAccount;
      app.setStatus = (text: string, kind: string) => trace.push(['status', text, kind]);
      app.alert = (message: string) => trace.push(['alert', message]);
      const email = document.getElementById('authEmail') as HTMLInputElement;
      const password = document.getElementById('authPass') as HTMLInputElement;
      email.value = ' owner@example.test '; password.value = 'not-reported';
      app.authMode = 'login'; app.renderGate();
      const loginGate = {
        title: document.getElementById('authTitle')?.textContent,
        submit: document.getElementById('authSubmit')?.textContent,
      };
      await app.doLogin();
      app.authMode = 'signup'; app.renderGate(); await app.doLogin();
      app.toggleAuthMode();
      const toggledMode = app.authMode;
      app.openLogin();
      const openLogin = {
        mode: app.authMode, offline: app.offlineMode,
        display: (document.getElementById('authGate') as HTMLElement).style.display,
      };
      app.goOffline();
      const offline = {
        value: app.offlineMode, connected: app.cloud.connected,
        display: (document.getElementById('authGate') as HTMLElement).style.display,
      };
      await app.doLogout();
      const channelAfterLogout = app.cloud.channel;
      app.session = { user: { email: '<owner@example.test>' } };
      app.offlineMode = false; originals.renderAccount();
      const signedInHtml = document.getElementById('cloudState')?.innerHTML;
      app.session = null; app.offlineMode = true; originals.renderAccount();
      const offlineHtml = document.getElementById('cloudState')?.innerHTML;
      const cfgUrl = document.getElementById('cfgUrl') as HTMLInputElement;
      const cfgKey = document.getElementById('cfgKey') as HTMLInputElement;
      cfgUrl.value = ''; cfgKey.value = '';
      await app.doReconnect();
      return {
        trace, loginGate, toggledMode, openLogin, offline,
        channelAfterLogout,
        accountDom: {
          signedInCopy: !!signedInHtml?.includes('Signed in as'),
          sessionValueEscaped: !!signedInHtml?.includes('&lt;') &&
            !signedInHtml?.includes('<owner@example.test>'),
          offlineCopy: !!offlineHtml?.includes('Working on this device only'),
        },
        authMessage: document.getElementById('authMsg')?.textContent,
      };
    } finally {
      Object.assign(app, originals);
    }
  });
}

test('typed State gate, login/signup, offline, logout, reconnect guard, and account DOM match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await authUiProbe(typedPage);
  const classic = await authUiProbe(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed).toMatchObject({
    loginGate: { title: 'Log in to Matcha Luna', submit: 'Log in' },
    toggledMode: 'login',
    openLogin: { mode: 'login', offline: false, display: 'flex' },
    offline: { value: true, connected: false, display: 'none' },
    channelAfterLogout: null,
  });
  const result = typed as any;
  expect(result.trace).toContainEqual([
    'signIn', true, {
      keys: ['email', 'password'], hasEmail: true, hasPassword: true,
    },
  ]);
  expect(result.trace).toContainEqual([
    'signUp', true, {
      keys: ['email', 'password'], hasEmail: true, hasPassword: true,
    },
  ]);
  expect(result.trace).toContainEqual(['removeChannel', true, { id: 'channel' }]);
  expect(result.trace).toContainEqual(['signOut', true]);
  expect(result.trace).toContainEqual(['alert', 'Enter both the Project URL and the key.']);
  expect(result.accountDom).toEqual({
    signedInCopy: true, sessionValueEscaped: true, offlineCopy: true,
  });
});

async function authSuccessProbe(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const names = [
      'session', 'currentUserId', 'offlineMode', 'costingCloudReady',
      'costingCloudLoading', 'costingLoadGeneration', 'localDirty',
      'syncedState', 'state', 'lastState', 'cloud', 'posContext', 'posCheckout',
      'activateAppTab', 'resetPosContext', 'loadPosContext',
      'loadPosCheckoutData', 'cloudLoad', 'cloudSave', 'costingRequestIsCurrent',
      'reconcileCostingInventoryLifecycle', 'rememberSynced', 'renderAll',
      'setStatus', 'save', 'subscribeRealtime', 'renderAccount', 'renderPos',
      'setTimeout', 'alert',
    ];
    const originals = Object.fromEntries(names.map((name) => [name, app[name]]));
    const trace: any[] = [];
    const timers: Array<() => void> = [];
    try {
      app.session = null; app.currentUserId = null; app.offlineMode = true;
      app.costingCloudReady = false; app.costingCloudLoading = false;
      app.costingLoadGeneration = 5; app.localDirty = true;
      app.syncedState = app.blank();
      app.state = app.blank();
      app.state.ingredients.push({ id: 'local', name: 'Local' });
      app.posContext = {
        loaded: false, loading: false, businessId: '', businessName: '',
        role: '', publications: {}, error: '',
      };
      app.posCheckout = { catalogLoading: false, catalog: [] };
      const realtime: any = {
        setAuth(token: string) {
          trace.push(['setAuth', this === realtime, { hasToken: !!token }]);
        },
      };
      app.cloud = { connected: false, client: { realtime }, channel: null };
      app.activateAppTab = (...args: unknown[]) => trace.push(['tab', ...args]);
      app.resetPosContext = (message: string) => trace.push(['reset', message]);
      app.loadPosContext = async () => {
        trace.push(['loadContext']); app.posContext.loaded = true;
        app.posContext.businessId = 'business-1'; return true;
      };
      app.loadPosCheckoutData = async () => {
        trace.push(['loadCheckout']); app.posCheckout.catalog = [{ id: 'drink' }]; return true;
      };
      const remote = app.blank();
      remote.ingredients.push({ id: 'remote', name: 'Remote' });
      let remoteResult: any = remote;
      app.cloudLoad = async () => { trace.push(['cloudLoad']); return remoteResult; };
      app.cloudSave = async (value: any) => trace.push(['cloudSave', {
        schemaVersion: value?.schemaVersion,
        ingredientCount: value?.ingredients?.length,
      }]);
      app.costingRequestIsCurrent = (generation: number, userId: string) => {
        const result = generation === app.costingLoadGeneration && userId === app.currentUserId;
        trace.push(['current', {
          generationMatches: generation === app.costingLoadGeneration,
          userMatches: userId === app.currentUserId,
        }]);
        return result;
      };
      app.reconcileCostingInventoryLifecycle = (_remote: unknown, merged: unknown) => {
        trace.push(['reconcile']); return { state: merged, blocked: ['Milk'] };
      };
      app.rememberSynced = (_value: unknown, clean: boolean) => trace.push(['remember', clean]);
      app.renderAll = () => trace.push(['renderAll']);
      app.setStatus = (text: string, kind: string) => trace.push(['status', text, kind]);
      app.save = () => trace.push(['save']);
      app.subscribeRealtime = () => trace.push(['subscribe']);
      app.renderAccount = () => trace.push(['account']);
      app.renderPos = () => trace.push(['pos']);
      Reflect.set(app, 'setTimeout', (callback: () => void, delay: number) => {
        trace.push(['timer', delay]); timers.push(callback); return timers.length;
      });
      app.alert = (message: string) => trace.push(['alert', message]);
      const session = {
        access_token: 'not-reported',
        user: { id: 'auth-user', email: 'owner@example.test' },
      };
      const first = await app.handleAuth(session, 'SIGNED_IN');
      timers.splice(0).forEach((callback) => callback());
      const firstResult = {
        returned: first,
        ready: app.costingCloudReady,
        loading: app.costingCloudLoading,
        hasCurrentUser: !!app.currentUserId,
        ingredientIds: app.state.ingredients.map((item: any) => item.id),
        trace: app.snapshot(trace),
      };
      trace.length = 0;
      const sameUser = await app.handleAuth(session, 'TOKEN_REFRESHED');
      const sameUserResult = { returned: sameUser, trace: app.snapshot(trace) };

      const resetForNextUser = () => {
        app.session = null; app.currentUserId = null;
        app.costingCloudReady = false; app.costingCloudLoading = false;
        app.localDirty = false; app.syncedState = app.blank();
        app.posContext = {
          loaded: false, loading: false, businessId: '', businessName: '',
          role: '', publications: {}, error: '',
        };
        app.posCheckout = { catalogLoading: false, catalog: [] };
      };
      trace.length = 0;
      resetForNextUser();
      app.state = app.blank();
      app.state.ingredients.push({ id: 'discarded-local', name: 'Discarded local' });
      const cleanRemote = app.blank();
      cleanRemote.ingredients.push({ id: 'clean-remote', name: 'Clean remote' });
      remoteResult = cleanRemote;
      const cleanReturned = await app.handleAuth({
        access_token: 'not-reported',
        user: { id: 'clean-user', email: 'clean@example.test' },
      }, 'SIGNED_IN');
      const cleanResult = {
        returned: cleanReturned,
        ready: app.costingCloudReady,
        ingredientIds: app.state.ingredients.map((item: any) => item.id),
        trace: app.snapshot(trace),
      };

      trace.length = 0;
      resetForNextUser();
      app.state = app.blank();
      app.state.ingredients.push({ id: 'first-upload', name: 'First upload' });
      remoteResult = null;
      const emptyReturned = await app.handleAuth({
        access_token: 'not-reported',
        user: { id: 'empty-user', email: 'empty@example.test' },
      }, 'SIGNED_IN');
      const emptyResult = {
        returned: emptyReturned,
        ready: app.costingCloudReady,
        ingredientIds: app.state.ingredients.map((item: any) => item.id),
        trace: app.snapshot(trace),
      };
      return { firstResult, sameUserResult, cleanResult, emptyResult };
    } finally {
      Object.assign(app, originals);
    }
  });
}

test('typed State successful first-user, dirty-cloud, POS, realtime, and same-user auth paths match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await authSuccessProbe(typedPage);
  const classic = await authSuccessProbe(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  const result = typed as any;
  expect(result.firstResult).toMatchObject({
    ready: true, loading: false, hasCurrentUser: true,
    ingredientIds: ['remote', 'local'],
  });
  expect(result.firstResult.trace).toEqual(expect.arrayContaining([
    ['tab', 'pos', false], ['reset', ''], ['loadContext'],
    ['status', 'Connecting…', ''], ['setAuth', true, { hasToken: true }],
    ['cloudLoad'], ['reconcile'], ['remember', false], ['renderAll'],
    ['timer', 0], ['save'], ['subscribe'], ['loadCheckout'], ['account'], ['pos'],
  ]));
  expect(result.firstResult.trace.some((item: any[]) => item[0] === 'alert')).toBe(true);
  expect(result.sameUserResult).toEqual({
    returned: true,
    trace: [['setAuth', true, { hasToken: true }], ['account']],
  });
  expect(result.cleanResult).toMatchObject({
    ready: true,
    ingredientIds: ['clean-remote'],
    trace: expect.arrayContaining([
      ['cloudLoad'], ['remember', true], ['status', 'Saved to cloud ✓', 'good'],
      ['subscribe'],
    ]),
  });
  expect(result.cleanResult.trace.some((entry: any[]) => entry[0] === 'save')).toBe(false);
  expect(result.emptyResult).toMatchObject({
    ready: true,
    ingredientIds: ['first-upload'],
    trace: expect.arrayContaining([
      ['cloudLoad'],
      ['cloudSave', { schemaVersion: 3, ingredientCount: 1 }],
      ['remember', true], ['status', 'Saved to cloud ✓', 'good'], ['subscribe'],
    ]),
  });
});

async function authFailureProbe(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const names = [
      'session', 'currentUserId', 'offlineMode', 'costingCloudReady',
      'costingCloudLoading', 'costingLoadGeneration', 'localDirty', 'cloud',
      'posContext', 'posCheckout', 'publishModalOpen', 'publishSubmitting',
      'activateAppTab', 'resetPosContext', 'loadPosContext',
      'loadPosCheckoutData', 'cloudLoad', 'costingRequestIsCurrent',
      'rememberSynced', 'renderAll', 'setStatus', 'subscribeRealtime',
      'renderAccount', 'renderPos', 'posClearCatalogCache',
      'closePublishProductModal',
    ];
    const originals = Object.fromEntries(names.map((name) => [name, app[name]]));
    const trace: any[] = [];
    try {
      const realtime = { setAuth: () => trace.push(['setAuth']) };
      app.cloud = { connected: false, client: { realtime }, channel: null };
      app.posContext = {
        loaded: true, loading: false, businessId: '', businessName: '',
        role: '', publications: {}, error: '',
      };
      app.posCheckout = { catalogLoading: false, catalog: [] };
      app.activateAppTab = () => trace.push(['tab']);
      app.resetPosContext = (message: string) => trace.push(['reset', message]);
      app.loadPosContext = async () => { trace.push(['context']); return false; };
      app.loadPosCheckoutData = async () => { trace.push(['checkout']); return false; };
      app.costingRequestIsCurrent = (generation: number, userId: string) =>
        generation === app.costingLoadGeneration && userId === String(app.currentUserId || '');
      app.rememberSynced = () => trace.push(['remember']);
      app.renderAll = () => trace.push(['renderAll']);
      app.setStatus = (text: string, kind: string) => trace.push(['status', text, kind]);
      app.subscribeRealtime = () => trace.push(['subscribe']);
      app.renderAccount = () => trace.push(['account']);
      app.renderPos = () => trace.push(['pos']);
      app.posClearCatalogCache = () => trace.push(['clearCache']);
      app.closePublishProductModal = () => trace.push(['closePublish']);
      app.currentUserId = null; app.costingLoadGeneration = 10;
      app.localDirty = false; app.offlineMode = false;
      app.cloudLoad = async () => { trace.push(['cloudLoad']); throw new Error('read failed'); };
      await app.handleAuth({
        access_token: 'not-reported', user: { id: 'failure-user', email: 'failure@example.test' },
      });
      const failure = {
        ready: app.costingCloudReady, loading: app.costingCloudLoading,
        trace: app.snapshot(trace),
      };
      trace.length = 0;
      let release!: (value: unknown) => void;
      app.currentUserId = null; app.costingLoadGeneration = 20;
      app.cloudLoad = () => {
        trace.push(['cloudLoad']); return new Promise((resolve) => { release = resolve; });
      };
      const stalePromise = app.handleAuth({
        access_token: 'not-reported', user: { id: 'stale-user', email: 'stale@example.test' },
      });
      await Promise.resolve(); await Promise.resolve();
      await app.handleAuth(null, 'SIGNED_OUT');
      release(app.blank());
      await stalePromise;
      const stale = {
        currentUserId: app.currentUserId,
        renderedRemote: trace.some((item) => item[0] === 'renderAll'),
        subscribedAfterRemote: trace.filter((item) => item[0] === 'subscribe').length,
        trace: app.snapshot(trace),
      };
      trace.length = 0;
      app.currentUserId = 'logout-user'; app.offlineMode = false;
      app.publishModalOpen = true; app.publishSubmitting = true;
      await app.handleAuth(null, 'SIGNED_OUT');
      const logout = {
        currentUserId: app.currentUserId,
        publishSubmitting: app.publishSubmitting,
        connected: app.cloud.connected,
        trace: app.snapshot(trace),
      };
      return { failure, stale, logout };
    } finally {
      Object.assign(app, originals);
    }
  });
}

test('typed State cloud failure, stale generation, logout cleanup, and partial auth effects match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await authFailureProbe(typedPage);
  const classic = await authFailureProbe(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  const result = typed as any;
  expect(result.failure).toMatchObject({
    ready: false, loading: false,
    trace: expect.arrayContaining([
      ['status', 'Signed in — cloud read failed', 'bad'], ['subscribe'],
    ]),
  });
  expect(result.stale.currentUserId).toBe(null);
  expect(result.stale.renderedRemote).toBe(false);
  expect(result.stale.subscribedAfterRemote).toBe(0);
  expect(result.logout).toMatchObject({
    currentUserId: null, publishSubmitting: false, connected: false,
    trace: expect.arrayContaining([
      ['clearCache'], ['closePublish'], ['reset', ''],
      ['status', 'Sign in to sync', 'bad'], ['account'], ['pos'],
    ]),
  });
});
