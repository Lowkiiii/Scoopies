import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const runtimeFactoryNames = [
  'freshPosOpsModal',
  'freshPosSalesHistory',
  'freshStockState',
  'freshStockModal',
];

const activeRuntimeFiles = [
  'state.js',
  'workspace-sync.js',
  'pos-operations.js',
  'boot.js',
  'start.js',
];

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

const expectedValues = {
  freshPosOpsModal: {
    open: false,
    type: '',
    submitting: false,
    error: '',
    notice: '',
    step: 'edit',
    mode: 'live',
    openingCash: '0.00',
    countedCash: '',
    verifiedGcash: '',
    verifiedGotyme: '',
    notes: '',
    sale: null,
    reason: '',
    result: null,
    uncertain: false,
    rpcArgs: null,
    cartAction: '',
    cartProductId: '',
    cartProductName: '',
    cartQuantity: 0,
    productId: '',
    selectedMatchaOptionId: '',
    mediaRows: [],
    mediaLoading: false,
    mediaLoaded: false,
    mediaProductId: '',
    mediaRemoveProductId: '',
    mediaEditor: null,
  },
  freshPosSalesHistory: {
    rows: [],
    summary: null,
    mode: 'live',
    view: 'receipts',
    loading: false,
    loaded: false,
    error: '',
    summaryError: '',
    hasMore: true,
    cursorCompletedAt: null,
    cursorSaleId: null,
    tallyRows: [],
    tallyLoading: false,
    tallyLoaded: false,
    tallyError: '',
    filterDateInput: '',
    filterDate: '',
    filterShiftId: '',
    selectedShiftRow: null,
    shiftRows: [],
    shiftLoading: false,
    shiftLoaded: false,
    shiftError: '',
    shiftHasMore: true,
    shiftCursorClosedAt: null,
    shiftCursorShiftId: null,
  },
  freshStockState: {
    loaded: false,
    loading: false,
    refreshing: false,
    error: '',
    notice: '',
    sourceConflict: '',
    items: [],
    transactions: [],
    search: '',
    status: 'all',
    kind: 'all',
    lastUpdatedAt: 0,
  },
  freshStockModal: {
    open: false,
    itemId: '',
    action: '',
    quantity: '',
    unit: '',
    reason: '',
    note: '',
    submitting: false,
    error: '',
    notice: '',
    uncertain: false,
    pendingRpc: null,
  },
};

async function stubSupabase(page: Page) {
  await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/, async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: 'window.supabase={createClient:function(){throw new Error("Supabase is disabled in browser tests");}};',
    });
  });
}

async function openPrimary(page: Page) {
  await stubSupabase(page);
  await page.goto('index.html?test=1', { waitUntil: 'load' });
  await page.evaluate(() =>
    (
      window as typeof window & {
        MatchaLunaApp: { ready: Promise<void> };
      }
    ).MatchaLunaApp.ready,
  );
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
}

async function factorySnapshot(page: Page) {
  return page.evaluate((names) => {
    const root = window as typeof window & Record<string, any>;
    const values: Record<string, unknown> = {};
    const keys: Record<string, string[]> = {};
    names.forEach((name) => {
      const value = root[name]();
      values[name] = value;
      keys[name] = Object.keys(value);
    });
    return { keys, values };
  }, runtimeFactoryNames);
}

test('typed Runtime factories preserve exact shapes and fresh identity', async ({ page }) => {
  await openPrimary(page);
  const result = await page.evaluate((names) => {
    const root = window as typeof window & Record<string, any>;
    const runtime = root.MatchaLunaApp.domains.runtime as Record<string, () => Record<string, any>>;
    const first = names.map((name) => runtime[name]());
    const second = names.map((name) => runtime[name]());
    const arrayFields = [
      [first[0].mediaRows, second[0].mediaRows],
      [first[1].rows, second[1].rows],
      [first[1].tallyRows, second[1].tallyRows],
      [first[1].shiftRows, second[1].shiftRows],
      [first[2].items, second[2].items],
      [first[2].transactions, second[2].transactions],
    ];
    arrayFields.forEach(([left]) => left.push('changed'));
    return {
      order: Object.keys(runtime),
      keys: Object.fromEntries(names.map((name, index) => [name, Object.keys(first[index])])),
      values: Object.fromEntries(names.map((name, index) => [name, second[index]])),
      objectsAreFresh: first.map((value, index) => value !== second[index]),
      arraysAreFresh: arrayFields.map(([left, right]) => left !== right),
      firstArrayLengths: arrayFields.map(([left]) => left.length),
      secondArrayLengths: arrayFields.map(([, right]) => right.length),
      rootMatches: names.map((name) => root[name] === runtime[name]),
    };
  }, runtimeFactoryNames);

  expect(result.order).toEqual(runtimeFactoryNames);
  expect(result.keys).toEqual(
    Object.fromEntries(
      Object.entries(expectedValues).map(([name, value]) => [name, Object.keys(value)]),
    ),
  );
  expect(result.values).toEqual(expectedValues);
  expect(result.objectsAreFresh).toEqual([true, true, true, true]);
  expect(result.arraysAreFresh).toEqual([true, true, true, true, true, true]);
  expect(result.firstArrayLengths).toEqual([1, 1, 1, 1, 1, 1]);
  expect(result.secondArrayLengths).toEqual([0, 0, 0, 0, 0, 0]);
  expect(result.rootMatches).toEqual([true, true, true, true]);
});

test('typed Runtime factories match the retained classic asset', async ({ page, context }) => {
  await openPrimary(page);
  const typed = await factorySnapshot(page);
  const builtHtml = readFileSync(resolve(process.cwd(), 'dist/index.html'), 'utf8');
  const classicScripts = transitionRuntimeFiles
    .map((fileName) => `<script src="/Scoopies/assets/js/${fileName}"></script>`)
    .join('\n');
  const transitionHtml = builtHtml
    .replace(/\s*<script type="module"[^>]*><\/script>/, '')
    .replace('</body>', `${classicScripts}\n</body>`);
  const classicPage = await context.newPage();
  await stubSupabase(classicPage);
  await classicPage.route('**/index.html?test=1&runtime-transition=1', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: transitionHtml });
  });
  await classicPage.goto('index.html?test=1&runtime-transition=1', { waitUntil: 'load' });
  await expect(classicPage.locator('#syncStatus')).toHaveText('Test mode');
  const provenance = await classicPage.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    return {
      moduleScripts: document.querySelectorAll('script[type="module"]').length,
      hasTypedRuntimeDomain: Boolean(root.MatchaLunaApp.domains.runtime),
    };
  });
  const classic = await factorySnapshot(classicPage);
  await classicPage.close();

  expect(provenance).toEqual({ moduleScripts: 0, hasTypedRuntimeDomain: false });
  expect(typed).toEqual(classic);
});

test('Runtime registers before state and preserves startup replacement paths', async ({ page }) => {
  await stubSupabase(page);
  let registrationProbe: unknown;
  await page.route('**/assets/js/state.js*', async (route) => {
    registrationProbe = await page.evaluate((names) => {
      const root = window as typeof window & Record<string, any>;
      const runtime = root.MatchaLunaApp.domains.runtime as Record<string, () => Record<string, any>>;
      const originals = Object.fromEntries(names.map((name) => [name, runtime[name]]));
      runtime.freshPosOpsModal = () => ({ ...originals.freshPosOpsModal(), startupSource: 'runtime' });
      root.freshPosSalesHistory = () => ({
        ...originals.freshPosSalesHistory(),
        startupSource: 'root',
      });
      runtime.freshStockState = () => ({ ...originals.freshStockState(), startupSource: 'runtime' });
      root.freshStockModal = () => ({ ...originals.freshStockModal(), startupSource: 'root' });
      return {
        order: Object.keys(runtime),
        rootMatches: names.map((name) => root[name] === runtime[name]),
      };
    }, runtimeFactoryNames);
    await route.continue();
  });
  await page.goto('index.html?test=1', { waitUntil: 'load' });
  await page.evaluate(() =>
    (
      window as typeof window & {
        MatchaLunaApp: { ready: Promise<void> };
      }
    ).MatchaLunaApp.ready,
  );
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
  const initialized = await page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    return {
      sources: [
        root.posOpsModal.startupSource,
        root.posSalesHistory.startupSource,
        root.stockState.startupSource,
        root.stockModal.startupSource,
      ],
      activeRuntime: Array.from(
        document.querySelectorAll('script[data-matcha-luna-runtime]'),
        (script) => (script as HTMLScriptElement).dataset.matchaLunaRuntime,
      ),
      protectedLegacyMatches: [
        root.MatchaLunaApp.domains.legacy.freshStockState ===
          root.MatchaLunaApp.domains.runtime.freshStockState,
        root.MatchaLunaApp.domains.legacy.freshStockModal ===
          root.MatchaLunaApp.domains.runtime.freshStockModal,
      ],
    };
  });
  const liveBindings = await page.evaluate((names) => {
    const root = window as typeof window & Record<string, any>;
    const runtime = root.MatchaLunaApp.domains.runtime as Record<
      string,
      () => Record<string, any>
    >;
    const originals = Object.fromEntries(names.map((name) => [name, runtime[name]]));
    const roundTrips = names.map((name) => {
      const fromRuntime = () => ({ source: `${name}-runtime` });
      runtime[name] = fromRuntime;
      const namespaceReachedRoot = root[name] === fromRuntime;
      const fromRoot = () => ({ source: `${name}-root` });
      root[name] = fromRoot;
      const rootReachedNamespace = runtime[name] === fromRoot;
      root[name] = originals[name];
      return { namespaceReachedRoot, rootReachedNamespace };
    });

    runtime.freshPosSalesHistory = () => ({
      ...originals.freshPosSalesHistory(),
      laterSource: 'classic-pos',
    });
    root.resetPosCheckout();
    const classicCallerSource = root.posSalesHistory.laterSource;
    runtime.freshPosSalesHistory = originals.freshPosSalesHistory;

    runtime.freshStockModal = () => ({
      ...originals.freshStockModal(),
      laterSource: 'typed-stocks',
    });
    root.stockModal = { ...originals.freshStockModal(), open: true };
    root.closeStockModal(true);
    const typedCallerSource = root.stockModal.laterSource;
    runtime.freshStockModal = originals.freshStockModal;

    names.forEach((name) => {
      root[name] = originals[name];
    });
    return { roundTrips, classicCallerSource, typedCallerSource };
  }, runtimeFactoryNames);

  expect(registrationProbe).toEqual({
    order: runtimeFactoryNames,
    rootMatches: [true, true, true, true],
  });
  expect(initialized.sources).toEqual(['runtime', 'root', 'runtime', 'root']);
  expect(initialized.activeRuntime).toEqual(activeRuntimeFiles);
  expect(initialized.protectedLegacyMatches).toEqual([true, true]);
  expect(liveBindings.roundTrips).toEqual(
    runtimeFactoryNames.map(() => ({
      namespaceReachedRoot: true,
      rootReachedNamespace: true,
    })),
  );
  expect(liveBindings.classicCallerSource).toBe('classic-pos');
  expect(liveBindings.typedCallerSource).toBe('typed-stocks');
});
