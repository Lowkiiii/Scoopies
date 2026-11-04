import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const catalogNames = [
  'freshPosCheckout', 'clearPosReportData', 'setPosReportsLoading',
  'syncOpenPosReportModal', 'stockCanManage', 'resetStocks',
  'resetPosCheckout', 'posUuid', 'posCartLines', 'posCatalogMatchaOptions',
  'posVariantKey', 'posProductCartLines', 'posProductCartQuantity',
  'posCartTotalCentavos', 'posCartUnits', 'strictPesoCentavos',
  'posLoadRequestStillCurrent', 'posCatalogRequestStillCurrent',
  'posCatalogCacheScope', 'posHydrateCatalogCache',
  'posRememberCatalogCache', 'posClearCatalogCache', 'posDrinkGroupKey',
  'normalizePosCategory', 'posSubmitRequestStillCurrent', 'posPendingScope',
  'posPendingRecords', 'posSavePending', 'posClearPending',
  'posStoredPending', 'posRestorePending', 'posLatestCatalogProduct',
  'posLatestMatchaOption', 'markPosCartAgainstCatalog',
  'acceptPosCatalogChanges', 'addPosProduct', 'addPosProductVariant',
  'confirmPosProductOption', 'changePosQuantity', 'removePosLine',
  'clearPosCart', 'confirmPosCartAction', 'resetPosContext', 'posCanPublish',
  'posFriendlyError', 'rpcRows', 'posCanManageMedia', 'posPublicImageUrl',
  'posDrinkImageHtml', 'posMediaRequestCurrent', 'posMediaRow',
  'posPatchProductImage', 'openManageDrinksModal', 'posLoadImageElement',
  'posValidateDrinkImageFile', 'posCloseDrinkImageSource',
  'posDecodeDrinkImageFile', 'posDrinkImageCropGeometry',
  'posDrawDrinkImageCrop', 'posEncodeDrinkImageCanvas',
  'posPrepareDrinkImage', 'disposePosDrinkImageEditor',
  'openPosDrinkImageEditor', 'posCurrentDrinkImageEditor',
  'posClampDrinkImageEditor', 'drawPosDrinkImageEditor',
  'setPosDrinkImageZoom', 'adjustPosDrinkImageZoom',
  'nudgePosDrinkImageEditor', 'resetPosDrinkImageEditor',
  'cancelPosDrinkImageEditor', 'posExportDrinkImage',
  'savePosDrinkImageEditor', 'beginPosDrinkImageDrag',
  'movePosDrinkImageDrag', 'endPosDrinkImageDrag', 'posReloadMediaRows',
  'uploadPosDrinkImage', 'requestRemovePosDrinkImage',
  'cancelRemovePosDrinkImage', 'confirmRemovePosDrinkImage',
] as const;

const protectedCatalogNames = [
  'setPosReportsLoading', 'resetPosCheckout', 'posCartLines',
  'posProductCartQuantity', 'posCartTotalCentavos', 'posCartUnits',
  'strictPesoCentavos', 'posHydrateCatalogCache',
  'posRememberCatalogCache', 'posClearCatalogCache', 'posDrinkGroupKey',
  'posPendingScope', 'posPendingRecords', 'posSavePending',
  'posClearPending', 'posStoredPending', 'posRestorePending',
  'acceptPosCatalogChanges', 'addPosProduct', 'addPosProductVariant',
  'resetPosContext', 'posCanPublish', 'openManageDrinksModal',
  'posDecodeDrinkImageFile', 'posDrinkImageCropGeometry',
  'posEncodeDrinkImageCanvas', 'posPrepareDrinkImage',
  'openPosDrinkImageEditor', 'cancelPosDrinkImageEditor',
  'posExportDrinkImage', 'savePosDrinkImageEditor', 'uploadPosDrinkImage',
] as const;

const activeRuntimeFiles = [
  'boot.js', 'start.js',
] as const;

const transitionRuntimeFiles = [
  'core.js', 'runtime-factories.js', 'state.js', 'costing.js',
  'pos-catalog.js', 'stocks.js', 'workspace-sync.js', 'pos-operations.js',
  'publication.js', 'render-costing.js', 'render-modals.js',
  'render-pos.js', 'render-stocks.js', 'support.js', 'events.js',
  'boot.js', 'compatibility.js', 'start.js',
] as const;

async function stubSupabase(page: Page): Promise<void> {
  await page.route(
    /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/,
    async (route) => route.fulfill({
      contentType: 'application/javascript',
      body: 'window.supabase={createClient:function(){throw new Error("Supabase is disabled in browser tests");}};',
    }),
  );
}

async function installHarness(page: Page): Promise<void> {
  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const h: Record<string, any> = {};
    h.reset = () => {
      h.trace = [];
      h.focus = [];
      localStorage.removeItem(app.POS_PENDING_KEY);
      sessionStorage.removeItem(app.POS_CATALOG_CACHE_KEY);
      app.session = { user: { id: 'catalog-user', email: 'owner@example.test' } };
      app.currentUserId = 'catalog-user';
      app.cloud = {
        connected: true,
        url: 'https://catalog.example.test',
        client: null,
      };
      app.costingCloudReady = true;
      app.posContext = {
        loaded: true, loading: false, businessId: 'business-1',
        businessName: 'Matcha Luna', role: 'owner', publications: {}, error: '',
      };
      app.posCheckout = app.freshPosCheckout();
      app.posSalesHistory = app.freshPosSalesHistory();
      app.posOpsModal = app.freshPosOpsModal();
      app.stockState = app.freshStockState();
      app.stockModal = app.freshStockModal();
      app.posCheckoutLoadGeneration = 7;
      app.posCheckoutSubmitGeneration = 11;
      app.posCatalogGeneration = 13;
      app.posLoadGeneration = 17;
      app.posStatusGeneration = 19;
      app.posOpsGeneration = 23;
      app.posHistoryGeneration = 29;
      app.posMediaGeneration = 31;
      app.posMediaSelectionGeneration = 37;
      app.stockLoadGeneration = 41;
      app.stockMutationGeneration = 43;
      app.posSilentRefreshPromise = { marker: 'pending' };
      app.posLastSilentRefreshAttemptAt = 99;
      app.posOpsModalReturnFocus = null;
      app.stockModalReturnFocus = null;
      document.body.classList.remove('pos-reports-loading', 'pos-training');
      const stockModal = document.getElementById('stockModal');
      const opsModal = document.getElementById('posOpsModal');
      if (stockModal) stockModal.hidden = true;
      if (opsModal) opsModal.hidden = true;
      return true;
    };
    h.product = (overrides: Record<string, unknown> = {}) => Object.assign({
      product_id: 'product-1', active_version_id: 'version-1',
      product_name: 'Matcha Latte', category_name: 'Matcha',
      size_snapshot: '12oz', selling_price_centavos: 17_000,
      image_object_path: null,
      matcha_upgrades: [
        { id: 'aya', revision: 2, code: 'aya', display_name: 'Aya no Mori', surcharge_centavos: 8_000, sort_order: 2 },
        { id: 'waka', revision: 1, code: 'waka', display_name: 'Wakatake', surcharge_centavos: 7_000, sort_order: 1 },
      ],
    }, overrides);
    h.line = (overrides: Record<string, unknown> = {}) => Object.assign({
      key: 'product-1|version-1|standard|standard', productId: 'product-1',
      productVersionId: 'version-1', name: 'Matcha Latte', size: '12oz',
      basePriceCentavos: 17_000, priceCentavos: 17_000, quantity: 1,
      matchaOptionId: '', matchaOptionRevision: null, matchaOptionCode: '',
      matchaOptionName: '', matchaSurchargeCentavos: 0,
      stale: false, latest: null,
    }, overrides);
    app.__phase4hCatalogHarness = h;
    h.reset();
  });
}

async function openPrimary(page: Page): Promise<void> {
  await stubSupabase(page);
  await page.goto('index.html?test=1', { waitUntil: 'load' });
  await page.evaluate(() =>
    (window as typeof window & { MatchaLunaApp: { ready: Promise<void> } })
      .MatchaLunaApp.ready,
  );
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
  await installHarness(page);
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
  await stubSupabase(page);
  await page.route('**/index.html?test=1&catalog-transition=1', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.goto('index.html?test=1&catalog-transition=1', { waitUntil: 'load' });
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
  await installHarness(page);
  return page;
}

async function openPair(
  page: Page,
  context: BrowserContext,
): Promise<[Page, Page]> {
  await openPrimary(page);
  const classic = await openClassic(context);
  return [page, classic];
}

test('typed Catalog boundary preserves API, registration, live descriptors, runtime paths, and fallback', async ({ page, context }) => {
  await openPrimary(page);
  const contract = await page.evaluate((names) => {
    const root = window as typeof window & Record<string, any>;
    const facade = root.MatchaLunaApp;
    const catalog = facade.domains.catalog as Record<string, any>;
    const descriptor = (target: object, name: string) => {
      const value = Object.getOwnPropertyDescriptor(target, name)!;
      return {
        configurable: value.configurable, enumerable: value.enumerable,
        writable: value.writable, hasGetter: typeof value.get === 'function',
        hasSetter: typeof value.set === 'function',
      };
    };
    const originals = Object.fromEntries(names.map((name) => [name, catalog[name]]));
    const roundTrips = names.map((name, index) => {
      const domainValue = function domainReplacement() { return index; };
      catalog[name] = domainValue;
      const domainReachedRoot = root[name] === domainValue;
      const domainReachedLegacy = facade.domains.legacy[name] === domainValue;
      const rootValue = function rootReplacement() { return index + 100; };
      root[name] = rootValue;
      const rootReachedDomain = catalog[name] === rootValue;
      const rootReachedLegacy = facade.domains.legacy[name] === rootValue;
      catalog[name] = originals[name];
      return { domainReachedRoot, domainReachedLegacy, rootReachedDomain, rootReachedLegacy };
    });
    return {
      version: facade.contractVersion,
      contractLength: facade.contractNames.length,
      domainOrder: Object.keys(facade.domains),
      domainSizes: Object.fromEntries(Object.entries(facade.domains)
        .map(([name, domain]) => [name, Object.keys(domain as object).length])),
      catalogOrder: Object.keys(catalog),
      protectedNames: names.filter((name) => facade.contractNames.includes(name)),
      rootMatches: names.map((name) => root[name] === catalog[name]),
      namespaceDescriptors: names.map((name) => descriptor(catalog, name)),
      rootDescriptors: names.map((name) => descriptor(root, name)),
      roundTrips,
      activeRuntime: Array.from(
        document.querySelectorAll<HTMLScriptElement>('script[data-matcha-luna-runtime]'),
        (script) => script.dataset.matchaLunaRuntime,
      ),
    };
  }, [...catalogNames]);

  const classic = await openClassic(context);
  const classicRuntime = await classic.evaluate(() => ({
    modules: document.querySelectorAll('script[type="module"]').length,
    scripts: Array.from(
      document.querySelectorAll<HTMLScriptElement>('script[src*="/assets/js/"]'),
      (script) => new URL(script.src).pathname.split('/').pop(),
    ),
    hasCatalogDomain: Boolean(
      (window as typeof window & Record<string, any>).MatchaLunaApp?.domains?.catalog,
    ),
  }));
  await classic.close();

  const response = await page.request.get(
    'http://127.0.0.1:4173/Scoopies/assets/js/pos-catalog.js',
  );
  const served = (await response.text()).replace(/\r\n?/g, '\n');
  const source = readFileSync(resolve(process.cwd(), 'assets/js/pos-catalog.js'), 'utf8')
    .replace(/\r\n?/g, '\n');
  const bytes = Buffer.from(served, 'utf8');
  const sha256 = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  const gitBlob = createHash('sha1')
    .update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');
  const main = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8');
  const costingSlot = main.indexOf('registerCostingModule(facade, window)');
  const catalogSlot = main.indexOf('registerCatalogModule(facade, window)');
  const stocksSlot = main.indexOf('registerStocksModule(facade, window)');

  expect(contract).toMatchObject({
    version: 1,
    contractLength: 175,
    domainOrder: [
      'core', 'runtime', 'state', 'costing', 'catalog', 'stocks', 'workspace', 'pos',
      'publication', 'modals', 'support', 'events', 'legacy',
    ],
    domainSizes: {
      core: 15, runtime: 4, state: 141, costing: 37, catalog: 81, stocks: 63, workspace: 18,
      publication: 10, modals: 46, pos: 79, support: 3, events: 1,
    },
    catalogOrder: catalogNames,
    protectedNames: protectedCatalogNames,
    activeRuntime: activeRuntimeFiles,
  });
  expect(contract.rootMatches).toEqual(catalogNames.map(() => true));
  expect(contract.namespaceDescriptors).toEqual(catalogNames.map(() => ({
    configurable: true, enumerable: true, writable: true,
    hasGetter: false, hasSetter: false,
  })));
  expect(contract.rootDescriptors).toEqual(catalogNames.map(() => ({
    configurable: true, enumerable: true, writable: undefined,
    hasGetter: true, hasSetter: true,
  })));
  expect(contract.roundTrips).toEqual(catalogNames.map((name) => ({
    domainReachedRoot: true,
    domainReachedLegacy: (protectedCatalogNames as readonly string[]).includes(name),
    rootReachedDomain: true,
    rootReachedLegacy: (protectedCatalogNames as readonly string[]).includes(name),
  })));
  expect(classicRuntime).toEqual({
    modules: 0, scripts: transitionRuntimeFiles, hasCatalogDomain: false,
  });
  expect(response.status()).toBe(200);
  expect(served).toBe(source);
  expect(gitBlob).toBe('34e2b5bfb1fd53637cb65fee9fd07358ff751230');
  expect(sha256).toBe('35DE3699B50201D64F4F574C45E8D296917C63A8EE70E1C95103D25BE08B8DFC');
  expect(catalogSlot).toBeGreaterThan(costingSlot);
  expect(stocksSlot).toBeGreaterThan(catalogSlot);
});

async function collectLifecycle(page: Page) {
  return page.evaluate(() => {
    const app = window as any;
    const api = app.MatchaLunaApp?.domains?.catalog || app;
    const h = app.__phase4hCatalogHarness;
    h.reset();
    const originals = Object.fromEntries([
      'freshStockState', 'freshStockModal', 'freshPosSalesHistory',
      'freshPosOpsModal', 'refreshModalBodyClass', 'renderStocks', 'renderPos',
      'renderPosOpsModal', 'disposePosDrinkImageEditor', 'resetStocks',
      'resetPosCheckout', 'posCloseOpsModal',
    ].map((name) => [name, app[name]]));
    try {
      const freshA = api.freshPosCheckout();
      const freshB = api.freshPosCheckout();
      freshA.catalog.push({ id: 'x' });
      app.posCheckout.summary = { gross: 1 };
      app.posCheckout.dailyReport = { day: 1 };
      app.posCheckout.recent = [{ id: 1 }];
      app.posCheckout.reportLoadedMode = 'live';
      app.posCheckout.reportLoadedDate = '2026-10-03';
      const clearReturn = api.clearPosReportData();
      const clearedReportState = [
        app.posCheckout.summary, app.posCheckout.dailyReport,
        app.posCheckout.recent.length, app.posCheckout.reportLoadedMode,
        app.posCheckout.reportLoadedDate,
      ];
      api.setPosReportsLoading(1);
      const loadingClass = document.body.classList.contains('pos-reports-loading');
      api.setPosReportsLoading(false);
      const loadingClassRemoved = !document.body.classList.contains('pos-reports-loading') &&
        app.posCheckout.reportsLoading === false;
      app.renderPosOpsModal = () => h.trace.push('renderOps');
      app.posOpsModal = { open: false };
      const closedSync = api.syncOpenPosReportModal();
      app.posOpsModal = { open: true, type: 'other' };
      const otherSync = api.syncOpenPosReportModal();
      app.posCheckout.dailyReport = { report: 1 };
      app.posCheckout.reportsLoading = true;
      app.posOpsModal = { open: true, type: 'report', notice: '' };
      const reportSync = api.syncOpenPosReportModal();
      const reportModal = JSON.parse(JSON.stringify(app.posOpsModal));

      const roleResults = ['owner', 'manager', 'cashier'].map((role) => {
        app.posContext.role = role;
        return api.stockCanManage();
      });
      app.freshStockState = () => ({ items: [], error: '' });
      app.freshStockModal = () => ({ open: false });
      app.refreshModalBodyClass = () => h.trace.push('refreshBody');
      app.renderStocks = () => h.trace.push('renderStocks');
      api.resetStocks('offline');
      const stockReset = {
        load: app.stockLoadGeneration, mutation: app.stockMutationGeneration,
        state: app.stockState, modal: app.stockModal,
      };

      app.freshPosSalesHistory = () => ({ open: false, marker: 'history' });
      app.freshPosOpsModal = () => ({ open: false, marker: 'ops' });
      app.disposePosDrinkImageEditor = () => h.trace.push('disposeEditor');
      app.renderPos = () => h.trace.push('renderPos');
      document.body.classList.add('pos-training');
      api.resetPosCheckout();
      const checkoutReset = {
        load: app.posCheckoutLoadGeneration,
        submit: app.posCheckoutSubmitGeneration,
        catalog: app.posCatalogGeneration,
        operations: app.posOpsGeneration,
        history: app.posHistoryGeneration,
        media: app.posMediaGeneration,
        silent: app.posSilentRefreshPromise,
        attempt: app.posLastSilentRefreshAttemptAt,
        historyState: app.posSalesHistory,
        opsState: app.posOpsModal,
        training: document.body.classList.contains('pos-training'),
      };

      app.resetStocks = (message: string) => h.trace.push(`resetStocks:${message}`);
      app.resetPosCheckout = () => h.trace.push('resetCheckout');
      app.posCloseOpsModal = (skip: boolean) => {
        h.trace.push(`closeOps:${skip}`);
        app.posOpsModal.open = false;
      };
      app.freshPosSalesHistory = () => ({ open: false, marker: 'context-history' });
      app.posOpsModal = { open: true };
      const beforePreserve = {
        load: app.posLoadGeneration, status: app.posStatusGeneration,
        ops: app.posOpsGeneration, history: app.posHistoryGeneration,
        media: app.posMediaGeneration, checkoutLoad: app.posCheckoutLoadGeneration,
        catalog: app.posCatalogGeneration,
      };
      const contextPreserveReturn = api.resetPosContext('offline', true);
      const contextPreserve = {
        returnValue: contextPreserveReturn ?? null,
        context: app.posContext,
        history: app.posSalesHistory,
        deltas: {
          load: app.posLoadGeneration - beforePreserve.load,
          status: app.posStatusGeneration - beforePreserve.status,
          ops: app.posOpsGeneration - beforePreserve.ops,
          history: app.posHistoryGeneration - beforePreserve.history,
          media: app.posMediaGeneration - beforePreserve.media,
          checkoutLoad: app.posCheckoutLoadGeneration - beforePreserve.checkoutLoad,
          catalog: app.posCatalogGeneration - beforePreserve.catalog,
        },
      };
      app.posOpsModal = { open: false };
      const contextResetReturn = api.resetPosContext('', false);
      const contextReset = {
        returnValue: contextResetReturn ?? null,
        context: app.posContext,
      };

      app.session = { user: { id: 'catalog-user' } };
      app.posContext = { businessId: 'business-1', role: 'owner' };
      app.cloud.connected = true;
      app.costingCloudReady = true;
      const requests = [
        api.posLoadRequestStillCurrent(app.posCheckoutLoadGeneration, 'catalog-user', 'business-1'),
        api.posLoadRequestStillCurrent(app.posCheckoutLoadGeneration + 1, 'catalog-user', 'business-1'),
        api.posCatalogRequestStillCurrent(app.posCatalogGeneration, 'catalog-user', 'business-1'),
        api.posSubmitRequestStillCurrent(app.posCheckoutSubmitGeneration, 'catalog-user', 'business-1'),
      ];
      app.session.user.id = 'different-user';
      requests.push(
        api.posLoadRequestStillCurrent(app.posCheckoutLoadGeneration, 'catalog-user', 'business-1'),
        api.posCatalogRequestStillCurrent(app.posCatalogGeneration, 'catalog-user', 'business-1'),
        api.posSubmitRequestStillCurrent(app.posCheckoutSubmitGeneration, 'catalog-user', 'business-1'),
      );
      app.session.user.id = 'catalog-user';
      app.posContext.businessId = 'different-business';
      requests.push(
        api.posLoadRequestStillCurrent(app.posCheckoutLoadGeneration, 'catalog-user', 'business-1'),
        api.posCatalogRequestStillCurrent(app.posCatalogGeneration, 'catalog-user', 'business-1'),
        api.posSubmitRequestStillCurrent(app.posCheckoutSubmitGeneration, 'catalog-user', 'business-1'),
      );
      app.posContext.businessId = 'business-1';
      const publishResults = [api.posCanPublish()];
      app.posContext.role = 'manager';
      publishResults.push(api.posCanPublish());
      app.posContext.role = 'cashier';
      publishResults.push(api.posCanPublish());
      app.posContext.role = 'owner';
      app.cloud.connected = false;
      publishResults.push(api.posCanPublish());
      app.cloud.connected = true;
      app.costingCloudReady = false;
      publishResults.push(api.posCanPublish());
      app.costingCloudReady = true;
      app.posContext.businessId = '';
      publishResults.push(api.posCanPublish());
      app.posContext.businessId = 'business-1';
      const errors = [
        api.posFriendlyError({ code: '40001' }),
        api.posFriendlyError({ code: '42501' }),
        api.posFriendlyError({ code: 'other' }),
      ];
      let thrown = '';
      try { api.rpcRows({ error: new Error('rpc-failed') }); } catch (error) { thrown = String(error); }
      const rows = [api.rpcRows(null), api.rpcRows({ data: { id: 1 } }), api.rpcRows({ data: [{ id: 2 }] })];
      const cryptoObject = app.crypto;
      const ownRandomUuid = Object.getOwnPropertyDescriptor(cryptoObject, 'randomUUID');
      const ownRandomValues = Object.getOwnPropertyDescriptor(cryptoObject, 'getRandomValues');
      const nativeUuid = api.posUuid();
      let fallbackUuid = '';
      let uuidError = '';
      try {
        Object.defineProperty(cryptoObject, 'randomUUID', {
          configurable: true, value: undefined,
        });
        Object.defineProperty(cryptoObject, 'getRandomValues', {
          configurable: true,
          value: (bytes: Uint8Array) => {
            bytes.forEach((_value, index) => { bytes[index] = index; });
            return bytes;
          },
        });
        fallbackUuid = api.posUuid();
        Object.defineProperty(cryptoObject, 'getRandomValues', {
          configurable: true,
          value: () => { throw new Error('uuid-random-failed'); },
        });
        try { api.posUuid(); } catch (error) { uuidError = String(error); }
      } finally {
        if (ownRandomUuid) Object.defineProperty(cryptoObject, 'randomUUID', ownRandomUuid);
        else delete cryptoObject.randomUUID;
        if (ownRandomValues) Object.defineProperty(cryptoObject, 'getRandomValues', ownRandomValues);
        else delete cryptoObject.getRandomValues;
      }
      return {
        freshKeys: Object.keys(freshA), isolated: freshB.catalog.length === 0,
        clearReturn: clearReturn ?? null,
        reportCleared: clearedReportState,
        loadingClass, loadingClassRemoved, closedSync, otherSync, reportSync, reportModal,
        roleResults, stockReset, checkoutReset, contextPreserve, contextReset,
        requests,
        canPublish: api.posCanPublish(), publishResults, errors, thrown, rows,
        nativeUuidShape: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nativeUuid),
        fallbackUuid, uuidError,
        trace: h.trace,
      };
    } finally {
      Object.entries(originals).forEach(([name, value]) => { app[name] = value; });
    }
  });
}

test('typed checkout/report/reset/request/error helpers match classic', async ({ page, context }) => {
  const [typed, classic] = await openPair(page, context);
  const typedResult = await collectLifecycle(typed);
  expect(typedResult).toEqual(await collectLifecycle(classic));
  expect(typedResult.checkoutReset.training).toBe(false);
  expect(typedResult.reportCleared).toEqual([null, null, 0, '', '']);
  expect([typedResult.loadingClass, typedResult.loadingClassRemoved]).toEqual([true, true]);
  expect(typedResult.contextPreserve.deltas).toEqual({
    load: 1, status: 1, ops: 1, history: 1, media: 1,
    checkoutLoad: 1, catalog: 1,
  });
  expect(typedResult.fallbackUuid).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
  expect(typedResult.uuidError).toContain('uuid-random-failed');
  expect(typedResult.requests).toEqual([
    true, false, true, true, false, false, false, false, false, false,
  ]);
  expect(typedResult.publishResults).toEqual([true, true, false, false, false, false]);
  await classic.close();
});

async function collectCartMath(page: Page) {
  return page.evaluate(() => {
    const app = window as any;
    const api = app.MatchaLunaApp?.domains?.catalog || app;
    const h = app.__phase4hCatalogHarness;
    h.reset();
    const standard = h.line({ quantity: 2 });
    const upgraded = h.line({
      key: 'product-1|version-1|waka|1', quantity: 3,
      priceCentavos: 24_000, matchaOptionId: 'waka', matchaOptionRevision: 1,
    });
    app.posCheckout.cart = { standard, missing: null, upgraded };
    const options = api.posCatalogMatchaOptions(h.product({
      matcha_upgrades: JSON.stringify([
        { id: 'b', revision: 1, surcharge_centavos: 1, sort_order: 2, display_name: 'Beta' },
        { id: 'a', revision: 1, surcharge_centavos: 0, sort_order: 1, display_name: 'Alpha' },
        { id: '', revision: 1, surcharge_centavos: 1 },
        { id: 'bad', revision: 0, surcharge_centavos: 1 },
      ]),
    }));
    const strict = [undefined, '', '0', '1', '1.2', '1.23', '1.234', '-1',
      '1000000000', '1000000000.01'].map((value) => api.strictPesoCentavos(value));
    app.posCheckout.catalog = [h.product()];
    app.posCheckout.category = 'hojicha';
    const normalizedMissing = api.normalizePosCategory();
    app.posCheckout.category = 'matcha';
    const normalizedExisting = api.normalizePosCategory();
    return {
      lines: api.posCartLines().map((line: any) => line.key),
      options: options.map((option: any) => option.id),
      invalidOptions: api.posCatalogMatchaOptions({ matcha_upgrades: '{bad' }),
      keys: [
        api.posVariantKey('p', 'v', '', null),
        api.posVariantKey('p', 'v', 'o', 2),
      ],
      productLines: api.posProductCartLines('product-1').length,
      quantity: api.posProductCartQuantity('product-1'),
      total: api.posCartTotalCentavos(), units: api.posCartUnits(), strict,
      groups: [
        api.posDrinkGroupKey({ product_name: 'Hojicha Latte' }),
        api.posDrinkGroupKey({ product_name: 'Matcha', category_name: 'Tea' }),
      ],
      normalizedMissing, normalizedExisting, category: app.posCheckout.category,
    };
  });
}

test('typed cart math, variants, matcha options, money parsing, and categories match classic', async ({ page, context }) => {
  const [typed, classic] = await openPair(page, context);
  expect(await collectCartMath(typed)).toEqual(await collectCartMath(classic));
  await classic.close();
});

async function collectCache(page: Page) {
  return page.evaluate(() => {
    const app = window as any;
    const api = app.MatchaLunaApp?.domains?.catalog || app;
    const h = app.__phase4hCatalogHarness;
    h.reset();
    const originalSet = Storage.prototype.setItem;
    const originalGet = Storage.prototype.getItem;
    const originalRemove = Storage.prototype.removeItem;
    const originals = Object.fromEntries([
      'snapshot', 'posRestorePending', 'markPosCartAgainstCatalog',
      'normalizePosCategory',
    ].map((name) => [name, app[name]]));
    try {
      const scope = api.posCatalogCacheScope();
      const noScopeContext = app.posContext;
      app.posContext = { businessId: '' };
      const noScope = api.posCatalogCacheScope();
      app.posContext = noScopeContext;
      app.posCheckout.catalog = [h.product()];
      const remembered = api.posRememberCatalogCache();
      const saved = JSON.parse(
        sessionStorage.getItem(app.POS_CATALOG_CACHE_KEY) || 'null',
      ) as any;
      app.snapshot = (value: unknown) => {
        h.trace.push('snapshot');
        return JSON.parse(JSON.stringify(value));
      };
      app.normalizePosCategory = () => { h.trace.push('normalize'); return false; };
      app.posRestorePending = () => { h.trace.push('restore:false'); return false; };
      app.markPosCartAgainstCatalog = () => { h.trace.push('mark'); return true; };
      app.posCheckout = app.freshPosCheckout();
      app.posCheckout.category = 'hojicha';
      const hydrated = api.posHydrateCatalogCache();
      const hydratedState = {
        catalog: app.posCheckout.catalog.map((row: any) => row.product_id),
        fromCache: app.posCheckout.catalogFromCache,
        loading: app.posCheckout.catalogLoading,
        error: app.posCheckout.catalogError,
        category: app.posCheckout.category,
        detached: app.posCheckout.catalog !== saved.catalog,
      };

      const storeRecord = (overrides: Record<string, unknown> = {}) => {
        originalSet.call(sessionStorage, app.POS_CATALOG_CACHE_KEY, JSON.stringify(Object.assign({
          schemaVersion: 2, scope, savedAt: Date.now(), catalog: [h.product()],
        }, overrides)));
        app.posCheckout = app.freshPosCheckout();
      };
      storeRecord({ savedAt: Date.now() - app.POS_CATALOG_CACHE_MAX_AGE_MS - 1 });
      const expired = api.posHydrateCatalogCache();
      storeRecord({ schemaVersion: 1 });
      const wrongSchema = api.posHydrateCatalogCache();
      storeRecord({ scope: `${scope}|other` });
      const crossScope = api.posHydrateCatalogCache();
      storeRecord({ catalog: {} });
      const nonArray = api.posHydrateCatalogCache();
      originalSet.call(sessionStorage, app.POS_CATALOG_CACHE_KEY, '{bad');
      app.posCheckout = app.freshPosCheckout();
      const corrupt = api.posHydrateCatalogCache();

      storeRecord();
      app.posCheckout.loaded = true;
      const loadedGate = api.posHydrateCatalogCache();
      app.posCheckout.loaded = false;
      app.posCheckout.catalogFromCache = true;
      const cachedGate = api.posHydrateCatalogCache();

      storeRecord();
      app.posRestorePending = () => { h.trace.push('restore:true'); return true; };
      const traceStart = h.trace.length;
      const pendingHydrated = api.posHydrateCatalogCache();
      const pendingTrace = h.trace.slice(traceStart);

      Storage.prototype.getItem = function failingGet() { throw new Error('read-failed'); };
      app.posCheckout = app.freshPosCheckout();
      const readFailure = api.posHydrateCatalogCache();
      Storage.prototype.getItem = originalGet;
      Storage.prototype.setItem = function failingSet() { throw new Error('quota'); };
      app.posCheckout.catalog = [];
      const quota = api.posRememberCatalogCache();
      Storage.prototype.setItem = originalSet;
      Storage.prototype.removeItem = function failingRemove() { throw new Error('remove-failed'); };
      const clearFailure = api.posClearCatalogCache();
      Storage.prototype.removeItem = originalRemove;
      api.posClearCatalogCache();
      return {
        scope, noScope, remembered,
        saved: { schemaVersion: saved.schemaVersion, scope: saved.scope, catalogLength: saved.catalog.length, savedAtPositive: saved.savedAt > 0 },
        hydrated, hydratedState, expired, wrongSchema, crossScope, nonArray,
        corrupt, loadedGate, cachedGate, pendingHydrated, pendingTrace,
        readFailure, quota, clearFailure: clearFailure ?? null,
        cleared: sessionStorage.getItem(app.POS_CATALOG_CACHE_KEY), trace: h.trace,
      };
    } finally {
      Storage.prototype.getItem = originalGet;
      Storage.prototype.setItem = originalSet;
      Storage.prototype.removeItem = originalRemove;
      Object.entries(originals).forEach(([name, value]) => { app[name] = value; });
    }
  });
}

test('typed scoped catalog cache success, expiry, corruption, and storage failures match classic', async ({ page, context }) => {
  const [typed, classic] = await openPair(page, context);
  const typedResult = await collectCache(typed);
  expect(typedResult).toEqual(await collectCache(classic));
  expect(typedResult.hydratedState.detached).toBe(true);
  expect([
    typedResult.expired, typedResult.wrongSchema, typedResult.crossScope,
    typedResult.nonArray, typedResult.corrupt, typedResult.loadedGate,
    typedResult.cachedGate, typedResult.readFailure, typedResult.quota,
  ]).toEqual([false, false, false, false, false, false, false, false, false]);
  expect(typedResult.pendingTrace).toContain('restore:true');
  expect(typedResult.pendingTrace).not.toContain('mark');
  await classic.close();
});

async function collectPending(page: Page) {
  return page.evaluate(() => {
    const app = window as any;
    const api = app.MatchaLunaApp?.domains?.catalog || app;
    const h = app.__phase4hCatalogHarness;
    h.reset();
    const record = {
      schemaVersion: 3, userId: 'catalog-user', businessId: 'business-1',
      rpcArgs: {
        p_payment_method: 'gcash', p_cash_tendered_centavos: null,
        p_reference_number: 'REF-1', p_is_training: true,
      },
      cartSnapshot: [{
        productId: 'product-1', productVersionId: 'version-1',
        name: 'Matcha Latte', size: '12oz', basePriceCentavos: 17_000,
        priceCentavos: 24_000, quantity: 2, matchaOptionId: 'waka',
        matchaOptionRevision: 1, matchaOptionCode: 'waka',
        matchaOptionName: 'Wakatake', matchaSurchargeCentavos: 7_000,
      }],
    };
    const originalGet = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    const originalRemove = Storage.prototype.removeItem;
    const originalMark = app.markPosCartAgainstCatalog;
    try {
      localStorage.setItem(app.POS_PENDING_KEY, JSON.stringify(record));
      const migrated = api.posPendingRecords();
      const migratedKeys = Object.keys(migrated);
      localStorage.setItem(app.POS_PENDING_KEY, '{bad');
      const malformed = api.posPendingRecords();
      localStorage.setItem(app.POS_PENDING_KEY, 'null');
      const nullSaved = api.posPendingRecords();
      localStorage.removeItem(app.POS_PENDING_KEY);
      let saveSawPending = false;
      Storage.prototype.setItem = function tracedSet(key: string, value: string) {
        if (key === app.POS_PENDING_KEY) saveSawPending = app.posCheckout.pending === record;
        return originalSet.call(this, key, value);
      };
      api.posSavePending(record);
      Storage.prototype.setItem = originalSet;
      const stored = api.posStoredPending();
      app.markPosCartAgainstCatalog = () => { h.trace.push('mark'); return true; };
      app.posCheckout = app.freshPosCheckout();
      app.posCheckout.catalog = [h.product()];
      const restored = api.posRestorePending();
      const restoredAgain = api.posRestorePending();
      const restoredState = {
        keys: Object.keys(app.posCheckout.cart),
        line: Object.values(app.posCheckout.cart)[0],
        payment: app.posCheckout.paymentMethod,
        cash: app.posCheckout.cashReceived,
        reference: app.posCheckout.referenceNumber,
        mode: app.posCheckout.reportMode,
        notice: app.posCheckout.notice,
        pending: app.posCheckout.pending?.businessId,
      };

      const v2 = Object.assign({}, record, {
        schemaVersion: 2,
        rpcArgs: Object.assign({}, record.rpcArgs, {
          p_payment_method: 'cash', p_cash_tendered_centavos: 12345,
          p_is_training: false,
        }),
      });
      const scope = api.posPendingScope('catalog-user', 'business-1');
      localStorage.setItem(app.POS_PENDING_KEY, JSON.stringify({ [scope]: v2 }));
      app.posCheckout = app.freshPosCheckout();
      const restoredV2 = api.posRestorePending();
      const v2State = {
        keys: Object.keys(app.posCheckout.cart),
        cash: app.posCheckout.cashReceived,
        mode: app.posCheckout.reportMode,
      };

      localStorage.setItem(app.POS_PENDING_KEY, JSON.stringify({
        [scope]: record,
        'other-user|other-business': Object.assign({}, record, {
          userId: 'other-user', businessId: 'other-business',
        }),
      }));
      app.posCheckout.pending = record;
      api.posClearPending();
      const retainedMap = JSON.parse(localStorage.getItem(app.POS_PENDING_KEY) || '{}');
      const retainedKeys = Object.keys(retainedMap);
      app.posCheckout.pending = retainedMap['other-user|other-business'];
      app.session.user.id = 'other-user';
      app.posContext.businessId = 'other-business';
      api.posClearPending();
      const emptyStorage = localStorage.getItem(app.POS_PENDING_KEY);

      app.session.user.id = 'catalog-user';
      app.posContext.businessId = 'business-1';
      app.posCheckout.pending = null;
      Storage.prototype.setItem = function failingSet(key: string) {
        if (key === app.POS_PENDING_KEY) {
          h.trace.push(`setFailed:${app.posCheckout.pending === record}`);
          throw new Error('quota');
        }
        return undefined;
      };
      api.posSavePending(record);
      const failedSavePending = app.posCheckout.pending === record;
      Storage.prototype.setItem = originalSet;
      Storage.prototype.getItem = function failingGet() { throw new Error('read'); };
      const readFailure = api.posPendingRecords();
      Storage.prototype.getItem = originalGet;
      localStorage.setItem(app.POS_PENDING_KEY, JSON.stringify({ [scope]: record }));
      app.posCheckout.pending = record;
      Storage.prototype.removeItem = function failingRemove() { h.trace.push('removeFailed'); throw new Error('remove'); };
      api.posClearPending();
      const failedClearPending = app.posCheckout.pending;
      Storage.prototype.removeItem = originalRemove;
      return {
        scope, migratedKeys, malformed, nullSaved, stored: stored?.businessId,
        saveSawPending, restored, restoredAgain, restoredState,
        restoredV2, v2State, retainedKeys, emptyStorage,
        failedSavePending, readFailure, failedClearPending, trace: h.trace,
      };
    } finally {
      Storage.prototype.getItem = originalGet;
      Storage.prototype.setItem = originalSet;
      Storage.prototype.removeItem = originalRemove;
      app.markPosCartAgainstCatalog = originalMark;
    }
  });
}

test('typed pending-sale migration, scoping, save, restore, and clear match classic', async ({ page, context }) => {
  const [typed, classic] = await openPair(page, context);
  const typedResult = await collectPending(typed);
  expect(typedResult).toEqual(await collectPending(classic));
  expect(typedResult.saveSawPending).toBe(true);
  expect(typedResult.restoredAgain).toBe(false);
  expect(typedResult.v2State.keys).toEqual(['product-1']);
  expect(typedResult.v2State.cash).toBe('123.45');
  expect(typedResult.failedSavePending).toBe(true);
  expect(typedResult.trace).toContain('setFailed:true');
  await classic.close();
});

async function collectDrift(page: Page) {
  return page.evaluate(() => {
    const app = window as any;
    const api = app.MatchaLunaApp?.domains?.catalog || app;
    const h = app.__phase4hCatalogHarness;
    h.reset();
    const originals = { renderPos: app.renderPos };
    try {
      app.renderPos = () => h.trace.push('renderPos');
      const latest = h.product({ active_version_id: 'version-2', selling_price_centavos: 18_000 });
      app.posCheckout.catalog = [latest];
      const stale = h.line({ quantity: 3 });
      const missing = h.line({ key: 'missing', productId: 'missing', name: 'Missing' });
      app.posCheckout.cart = { stale, missing };
      app.posCheckout.confirming = true;
      const marked = api.markPosCartAgainstCatalog();
      const markedState = {
        stale: stale.stale, latestVersion: stale.latest?.active_version_id,
        missing: missing.stale, changed: app.posCheckout.catalogChanged,
        confirming: app.posCheckout.confirming,
      };
      const accepted = api.acceptPosCatalogChanges();
      const cleanCartReference = app.posCheckout.cart;
      const cleanCartSnapshot = JSON.stringify(app.posCheckout.cart);
      const cleanTraceStart = h.trace.length;
      app.posCheckout.catalogChanged = false;
      app.posCheckout.pending = { id: 'clean-noop' };
      const cleanNoop = api.acceptPosCatalogChanges();
      const cleanNoopState = {
        sameReference: app.posCheckout.cart === cleanCartReference,
        sameSnapshot: JSON.stringify(app.posCheckout.cart) === cleanCartSnapshot,
        changed: app.posCheckout.catalogChanged,
        newTrace: h.trace.slice(cleanTraceStart),
      };
      app.posCheckout.pending = null;
      app.posCheckout.catalogChanged = true;
      app.posCheckout.pending = { id: 'pending' };
      const blockedPending = api.acceptPosCatalogChanges();
      const blockedPendingChanged = app.posCheckout.catalogChanged;
      app.posCheckout.pending = null;
      app.posCheckout.catalogChanged = true;
      app.posCheckout.submitting = true;
      const blockedSubmitting = api.acceptPosCatalogChanges();
      const blockedSubmittingChanged = app.posCheckout.catalogChanged;
      app.posCheckout.submitting = false;
      app.posCheckout.catalogChanged = true;
      app.posCheckout.confirming = true;
      const blockedConfirming = api.acceptPosCatalogChanges();
      const blockedConfirmingChanged = app.posCheckout.catalogChanged;
      app.posCheckout.confirming = false;

      const mergeA = h.line({ key: 'merge-a', quantity: 9999 });
      const mergeB = h.line({ key: 'merge-b', quantity: 25 });
      const goneA = h.line({ key: 'gone-a', productId: 'gone-a' });
      const goneB = h.line({ key: 'gone-b', productId: 'gone-b' });
      app.posCheckout.cart = { mergeA, mergeB, goneA, goneB };
      app.posCheckout.catalog = [latest];
      app.posCheckout.catalogChanged = true;
      const merged = api.acceptPosCatalogChanges();
      const mergedLines = Object.values(app.posCheckout.cart) as any[];
      const mergeState = {
        quantity: mergedLines[0]?.quantity,
        count: mergedLines.length,
        notice: app.posCheckout.notice,
      };
      return {
        marked, markedState, accepted, cleanNoop, cleanNoopState,
        cart: Object.values(app.posCheckout.cart),
        notice: app.posCheckout.notice, error: app.posCheckout.error,
        changed: app.posCheckout.catalogChanged,
        blockedPending, blockedSubmitting, blockedConfirming,
        blockedChanged: [blockedPendingChanged, blockedSubmittingChanged, blockedConfirmingChanged],
        merged, mergeState, trace: h.trace,
      };
    } finally { app.renderPos = originals.renderPos; }
  });
}

test('typed catalog drift, stale marking, rebuild, removal, and notice order match classic', async ({ page, context }) => {
  const [typed, classic] = await openPair(page, context);
  const typedResult = await collectDrift(typed);
  expect(typedResult).toEqual(await collectDrift(classic));
  expect([
    typedResult.blockedPending, typedResult.blockedSubmitting,
    typedResult.blockedConfirming,
  ]).toEqual([false, false, false]);
  expect(typedResult.blockedChanged).toEqual([true, true, true]);
  expect(typedResult.cleanNoop).toBe(false);
  expect(typedResult.cleanNoopState).toEqual({
    sameReference: true, sameSnapshot: true, changed: false, newTrace: [],
  });
  expect(typedResult.mergeState).toEqual({
    quantity: 10000, count: 1,
    notice: '2 prices were updated. 2 unavailable items were removed.',
  });
  await classic.close();
});

async function collectCartActions(page: Page) {
  return page.evaluate(() => {
    const app = window as any;
    const api = app.MatchaLunaApp?.domains?.catalog || app;
    const h = app.__phase4hCatalogHarness;
    h.reset();
    const originals = Object.fromEntries([
      'renderPos', 'renderPosOpsModal', 'posOpenOpsModal', 'posCloseOpsModal',
      'focusSoon',
    ].map((name) => [name, app[name]]));
    try {
      app.renderPos = () => h.trace.push('renderPos');
      app.renderPosOpsModal = () => h.trace.push('renderOps');
      app.focusSoon = (selector: string) => h.trace.push(`focus:${selector}`);
      app.posOpenOpsModal = (type: string, values: Record<string, unknown>) => {
        h.trace.push(`open:${type}`);
        app.posOpsModal = Object.assign(app.freshPosOpsModal(), values, { open: true, type });
      };
      app.posCloseOpsModal = (skip: boolean) => {
        h.trace.push(`close:${skip}`);
        app.posOpsModal.open = false;
      };
      const plain = h.product({ product_id: 'plain', active_version_id: 'v1', matcha_upgrades: [] });
      const upgraded = h.product();
      app.posCheckout.catalog = [plain, upgraded];
      const addPlain = api.addPosProduct('plain');
      const addOptions = api.addPosProduct('product-1');
      app.posOpsModal.selectedMatchaOptionId = 'waka';
      const confirmOption = api.confirmPosProductOption();
      const keys = Object.keys(app.posCheckout.cart);
      const change = api.changePosQuantity(keys[0], 2);
      const removeOpen = api.removePosLine(keys[0]);
      const removeConfirm = api.confirmPosCartAction();
      const clearOpen = api.clearPosCart();
      const clearConfirm = api.confirmPosCartAction();

      const blocked: Record<string, unknown> = {};
      app.posCheckout.pending = { id: 'pending' };
      blocked.addPending = api.addPosProduct('plain');
      blocked.variantPending = api.addPosProductVariant(plain, null);
      app.posCheckout.pending = null;
      const blockedLineKey = 'blocked-key';
      app.posCheckout.cart = {
        [blockedLineKey]: h.line({
          key: blockedLineKey, productId: 'plain', productVersionId: 'v1',
          quantity: 3,
        }),
      };
      app.posOpsModal = app.freshPosOpsModal();
      app.posCheckout.submitting = true;
      blocked.addSubmitting = api.addPosProduct('plain');
      blocked.variantSubmitting = api.addPosProductVariant(plain, null);
      blocked.changeSubmitting = api.changePosQuantity(blockedLineKey, 1);
      blocked.removeSubmitting = api.removePosLine(blockedLineKey);
      blocked.clearSubmitting = api.clearPosCart();
      app.posCheckout.submitting = false;
      app.posCheckout.confirming = true;
      blocked.addConfirming = api.addPosProduct('plain');
      blocked.variantConfirming = api.addPosProductVariant(plain, null);
      blocked.changeConfirming = api.changePosQuantity(blockedLineKey, 1);
      blocked.removeConfirming = api.removePosLine(blockedLineKey);
      blocked.clearConfirming = api.clearPosCart();
      app.posCheckout.confirming = false;
      const blockedCartState = {
        keys: Object.keys(app.posCheckout.cart),
        quantity: app.posCheckout.cart[blockedLineKey]?.quantity,
        modalOpen: app.posOpsModal.open,
      };

      app.posCheckout.cart = {
        stale: h.line({ key: 'stale', productId: 'plain', productVersionId: 'old' }),
      };
      const staleAdd = api.addPosProduct('plain');
      const staleState = {
        changed: app.posCheckout.catalogChanged, error: app.posCheckout.error,
      };
      app.posCheckout.cart = {};
      api.addPosProductVariant(plain, null);
      const capKey = Object.keys(app.posCheckout.cart)[0];
      app.posCheckout.cart[capKey].quantity = 10000;
      const capAdd = api.addPosProductVariant(plain, null);
      const cappedQuantity = app.posCheckout.cart[capKey].quantity;
      app.posCheckout.pending = { id: 'pending' };
      blocked.changePending = api.changePosQuantity(capKey, 1);
      blocked.removePending = api.removePosLine(capKey);
      blocked.clearPending = api.clearPosCart();
      app.posCheckout.pending = null;
      app.posOpsModal = Object.assign(app.freshPosOpsModal(), { open: true, type: 'other' });
      blocked.removeModal = api.removePosLine(capKey);
      blocked.clearModal = api.clearPosCart();
      const optionGuardBefore = {
        keys: Object.keys(app.posCheckout.cart),
        quantity: app.posCheckout.cart[capKey].quantity,
      };
      app.posOpsModal = Object.assign(app.freshPosOpsModal(), {
        productId: 'product-1', selectedMatchaOptionId: 'waka',
      });
      const optionWrongModal = api.confirmPosProductOption();
      app.posOpsModal = Object.assign(app.freshPosOpsModal(), {
        open: true, type: 'productOptions', submitting: true,
        productId: 'product-1', selectedMatchaOptionId: 'waka',
      });
      const optionSubmitting = api.confirmPosProductOption();
      const optionGuardAfter = {
        keys: Object.keys(app.posCheckout.cart),
        quantity: app.posCheckout.cart[capKey].quantity,
      };
      const optionCheckoutGates = ['pending', 'submitting', 'confirming'].map((gate) => {
        app.posOpsModal = Object.assign(app.freshPosOpsModal(), {
          open: true, type: 'productOptions', submitting: false,
          productId: 'product-1', selectedMatchaOptionId: 'waka',
        });
        const before = JSON.stringify(app.posCheckout.cart);
        app.posCheckout[gate] = gate === 'pending' ? { id: 'pending' } : true;
        const result = api.confirmPosProductOption();
        const state = {
          gate, result,
          cartUnchanged: JSON.stringify(app.posCheckout.cart) === before,
          modalOpen: app.posOpsModal.open,
        };
        app.posCheckout[gate] = gate === 'pending' ? null : false;
        return state;
      });
      app.posOpsModal = Object.assign(app.freshPosOpsModal(), {
        open: true, type: 'productOptions', productId: 'missing',
        selectedMatchaOptionId: '',
      });
      const missingProduct = api.confirmPosProductOption();
      const missingProductError = app.posOpsModal.error;
      app.posOpsModal = Object.assign(app.freshPosOpsModal(), {
        open: true, type: 'productOptions', productId: 'product-1',
        selectedMatchaOptionId: 'missing-option',
      });
      const missingOption = api.confirmPosProductOption();
      const missingOptionError = app.posOpsModal.error;

      const setConfirm = (action: string, key = capKey) => {
        app.posOpsModal = Object.assign(app.freshPosOpsModal(), {
          open: true, type: 'cartConfirm', cartAction: action,
          cartProductId: key,
        });
      };
      app.posOpsModal = app.freshPosOpsModal();
      const confirmWrongModal = api.confirmPosCartAction();
      setConfirm('removeLine');
      app.posCheckout.pending = { id: 'pending' };
      const confirmPending = api.confirmPosCartAction();
      app.posCheckout.pending = null;
      setConfirm('removeLine');
      app.posCheckout.submitting = true;
      const confirmSubmitting = api.confirmPosCartAction();
      app.posCheckout.submitting = false;
      setConfirm('removeLine');
      app.posCheckout.confirming = true;
      const confirmConfirming = api.confirmPosCartAction();
      app.posCheckout.confirming = false;
      setConfirm('invalid');
      const confirmInvalid = api.confirmPosCartAction();
      setConfirm('removeLine', 'missing-line');
      const confirmMissing = api.confirmPosCartAction();
      app.posCheckout.cart = {};
      setConfirm('clear');
      const confirmEmpty = api.confirmPosCartAction();
      return {
        addPlain, addOptions, confirmOption, change, removeOpen, removeConfirm,
        clearOpen, clearConfirm, cart: app.posCheckout.cart,
        error: app.posCheckout.error, notice: app.posCheckout.notice,
        blocked, blockedCartState, staleAdd, staleState, capAdd, cappedQuantity,
        optionWrongModal, optionSubmitting, optionGuardBefore, optionGuardAfter,
        optionCheckoutGates,
        missingProduct, missingProductError, missingOption, missingOptionError,
        confirmGuards: [confirmWrongModal, confirmPending, confirmSubmitting,
          confirmConfirming, confirmInvalid, confirmMissing, confirmEmpty],
        trace: h.trace,
      };
    } finally {
      Object.entries(originals).forEach(([name, value]) => { app[name] = value; });
    }
  });
}

test('typed product options, cart quantity, remove, clear, modal, render, and focus actions match classic', async ({ page, context }) => {
  const [typed, classic] = await openPair(page, context);
  const typedResult = await collectCartActions(typed);
  expect(typedResult).toEqual(await collectCartActions(classic));
  expect(Object.values(typedResult.blocked)).toEqual([
    false, false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
  ]);
  expect(typedResult.blockedCartState).toEqual({
    keys: ['blocked-key'], quantity: 3, modalOpen: false,
  });
  expect(typedResult.staleAdd).toBe(false);
  expect(typedResult.staleState.changed).toBe(true);
  expect(typedResult.cappedQuantity).toBe(10000);
  expect([typedResult.missingProduct, typedResult.missingOption]).toEqual([false, false]);
  expect([typedResult.optionWrongModal, typedResult.optionSubmitting]).toEqual([false, false]);
  expect(typedResult.optionGuardAfter).toEqual(typedResult.optionGuardBefore);
  expect(typedResult.optionCheckoutGates).toEqual([
    { gate: 'pending', result: false, cartUnchanged: true, modalOpen: true },
    { gate: 'submitting', result: false, cartUnchanged: true, modalOpen: true },
    { gate: 'confirming', result: false, cartUnchanged: true, modalOpen: true },
  ]);
  expect(typedResult.confirmGuards).toEqual([false, false, false, false, false, false, false]);
  await classic.close();
});

async function collectMediaHelpers(page: Page) {
  return page.evaluate(async () => {
    const app = window as any;
    const api = app.MatchaLunaApp?.domains?.catalog || app;
    const h = app.__phase4hCatalogHarness;
    h.reset();
    const originals = Object.fromEntries([
      'posCanManageOperations', 'posOpenOpsModal', 'renderPosOpsModal',
      'focusSoon', 'posRememberCatalogCache',
    ].map((name) => [name, app[name]]));
    try {
      app.posCanManageOperations = () => true;
      app.posOpenOpsModal = (type: string, values: Record<string, unknown>) => {
        h.trace.push(`open:${type}`);
        app.posOpsModal = Object.assign(app.freshPosOpsModal(), values, { open: true, type });
      };
      app.renderPosOpsModal = () => h.trace.push('renderOps');
      app.focusSoon = (selector: string) => h.trace.push(`focus:${selector}`);
      app.posRememberCatalogCache = () => { h.trace.push('rememberCache'); return true; };
      const permissionResults: boolean[] = [];
      app.cloud.client = null;
      permissionResults.push(api.posCanManageMedia());
      app.cloud.client = {};
      app.posCanManageOperations = () => false;
      permissionResults.push(api.posCanManageMedia());
      app.posCanManageOperations = () => true;
      const savedSession = app.session;
      app.session = null;
      permissionResults.push(api.posCanManageMedia());
      app.session = savedSession;
      const savedBusinessId = app.posContext.businessId;
      app.posContext.businessId = '';
      permissionResults.push(api.posCanManageMedia());
      app.posContext.businessId = savedBusinessId;

      const emptyUrl = api.posPublicImageUrl('');
      app.cloud.client = {};
      const missingStorageUrl = api.posPublicImageUrl('missing.webp');
      app.cloud.client = { storage: { from: () => { throw new Error('public-url-failed'); } } };
      const throwingUrl = api.posPublicImageUrl('throw.webp');
      app.cloud.client = { storage: { from: () => ({ getPublicUrl: () => ({ data: null }) }) } };
      const missingDataUrl = api.posPublicImageUrl('none.webp');
      const fallbackHtml = api.posDrinkImageHtml({ product_name: '<Tea>', image_object_path: 'none.webp' }, '<wide>');
      const storage = {
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://images.test/${path}` } }),
      };
      app.cloud.client = {
        storage: { from: (bucket: string) => { h.trace.push(`bucket:${bucket}`); return storage; } },
        rpc: async (name: string, args: unknown) => {
          h.trace.push(`rpc:${name}:${JSON.stringify(args)}`);
          return { data: [{ product_id: 'product-1', product_name: 'Matcha Latte', image_object_path: null }] };
        },
      };
      app.posCheckout.catalog = [h.product()];
      const canManage = api.posCanManageMedia();
      const url = api.posPublicImageUrl('folder/photo.webp');
      const html = api.posDrinkImageHtml(h.product({ image_object_path: 'folder/photo.webp' }), 'wide');
      const opened = await api.openManageDrinksModal();
      const requestCurrent = api.posMediaRequestCurrent(
        app.posMediaGeneration, 'catalog-user', 'business-1',
      );
      const row = api.posMediaRow('product-1');
      const patched = api.posPatchProductImage('product-1', 'new.webp', '2026-10-03T00:00:00.000Z');
      const successModal = {
        loaded: app.posOpsModal.mediaLoaded,
        loading: app.posOpsModal.mediaLoading,
        error: app.posOpsModal.error,
        rowPath: app.posOpsModal.mediaRows[0]?.image_object_path,
      };

      app.cloud.client = {
        storage: { from: () => storage },
        rpc: async () => { throw { message: 'read failed' }; },
      };
      const rpcFailure = await api.openManageDrinksModal();
      const rpcFailureState = {
        loading: app.posOpsModal.mediaLoading,
        loaded: app.posOpsModal.mediaLoaded,
        error: app.posOpsModal.error,
      };

      let resolveGeneration!: (value: unknown) => void;
      app.cloud.client = {
        storage: { from: () => storage },
        rpc: () => new Promise((resolve) => { resolveGeneration = resolve; }),
      };
      const staleGenerationPromise = api.openManageDrinksModal();
      await Promise.resolve();
      app.posMediaGeneration++;
      resolveGeneration({ data: [{ product_id: 'stale-generation' }] });
      const staleGeneration = await staleGenerationPromise;
      const staleGenerationRows = app.posOpsModal.mediaRows.slice();

      let resolveSession!: (value: unknown) => void;
      app.cloud.client = {
        storage: { from: () => storage },
        rpc: () => new Promise((resolve) => { resolveSession = resolve; }),
      };
      app.session.user.id = 'catalog-user';
      const staleSessionPromise = api.openManageDrinksModal();
      await Promise.resolve();
      app.session.user.id = 'changed-user';
      resolveSession({ data: [{ product_id: 'stale-session' }] });
      const staleSession = await staleSessionPromise;
      app.session.user.id = 'catalog-user';

      app.posOpsModal = Object.assign(app.freshPosOpsModal(), {
        open: true, type: 'manageDrinks', mediaRows: [{ product_id: 'before' }],
      });
      app.cloud.client = {
        storage: { from: () => storage },
        rpc: async () => ({ data: [{ product_id: 'reloaded' }] }),
      };
      const reloaded = await api.posReloadMediaRows(
        app.posMediaGeneration, 'catalog-user', 'business-1',
      );
      app.posOpsModal.mediaRows = [{ product_id: 'kept' }];
      const staleReload = await api.posReloadMediaRows(
        app.posMediaGeneration - 1, 'catalog-user', 'business-1',
      );
      return {
        permissionResults, emptyUrl, missingStorageUrl, throwingUrl,
        missingDataUrl, fallbackHtml, canManage, url, html, opened,
        requestCurrent, row, patched,
        modal: successModal,
        catalogPath: app.posCheckout.catalog[0].image_object_path,
        rpcFailure, rpcFailureState, staleGeneration, staleGenerationRows,
        staleSession, reloaded, staleReload,
        staleReloadRows: app.posOpsModal.mediaRows.slice(),
        trace: h.trace,
      };
    } finally {
      Object.entries(originals).forEach(([name, value]) => { app[name] = value; });
    }
  });
}

test('typed media permission, public URL/HTML, rows, patching, modal load, and generation guards match classic', async ({ page, context }) => {
  const [typed, classic] = await openPair(page, context);
  const typedResult = await collectMediaHelpers(typed);
  expect(typedResult).toEqual(await collectMediaHelpers(classic));
  expect(typedResult.permissionResults).toEqual([false, false, false, false]);
  expect([typedResult.emptyUrl, typedResult.missingStorageUrl,
    typedResult.throwingUrl, typedResult.missingDataUrl]).toEqual(['', '', '', '']);
  expect([typedResult.rpcFailure, typedResult.staleGeneration,
    typedResult.staleSession]).toEqual([false, false, false]);
  expect(typedResult.reloaded).toHaveLength(1);
  expect(typedResult.staleReload).toEqual([]);
  expect(typedResult.staleReloadRows).toEqual([{ product_id: 'kept' }]);
  await classic.close();
});

async function collectImagePrimitives(page: Page) {
  return page.evaluate(async () => {
    const app = window as any;
    const api = app.MatchaLunaApp?.domains?.catalog || app;
    const h = app.__phase4hCatalogHarness;
    h.reset();
    const originalUrl = app.URL;
    const originalImage = app.Image;
    const originalBitmap = app.createImageBitmap;
    const originalCreateElement = document.createElement;
    const originals = Object.fromEntries([
      'posLoadImageElement', 'posDecodeDrinkImageFile',
      'posDrawDrinkImageCrop', 'posEncodeDrinkImageCanvas',
      'posCloseDrinkImageSource',
    ].map((name) => [name, app[name]]));
    const errorText = (error: any) => String(error?.posMessage || error);
    try {
      const errors: string[] = [];
      for (const file of [
        null,
        { type: 'text/plain', size: 10 },
        { type: 'image/png', size: 0 },
        { type: 'image/webp', size: 5 * 1024 * 1024 + 1 },
      ]) {
        try { api.posValidateDrinkImageFile(file); errors.push('none'); }
        catch (error) { errors.push(errorText(error)); }
      }
      const valid = api.posValidateDrinkImageFile({ type: 'IMAGE/JPEG', size: 20 });
      const geometry = [
        api.posDrinkImageCropGeometry(4000, 2000, 0, 9999, -9999, 1200, 900),
        api.posDrinkImageCropGeometry(0, 2000, 1, 0, 0),
        api.posDrinkImageCropGeometry(800, 1200, 5, 10, 20, 600, 600),
      ];
      const trace: unknown[] = [];
      const context = {
        setTransform: (...args: unknown[]) => trace.push(['setTransform', ...args]),
        clearRect: (...args: unknown[]) => trace.push(['clearRect', ...args]),
        fillStyle: '', fillRect: (...args: unknown[]) => trace.push(['fillRect', ...args]),
        save: () => trace.push(['save']), translate: (...args: unknown[]) => trace.push(['translate', ...args]),
        scale: (...args: unknown[]) => trace.push(['scale', ...args]),
        imageSmoothingEnabled: false, imageSmoothingQuality: '',
        drawImage: (...args: unknown[]) => trace.push(['drawImage', ...args.slice(1)]),
        restore: () => trace.push(['restore']),
      };
      const canvas = { width: 1200, height: 900, getContext: () => context };
      const drawGeometry = api.posDrawDrinkImageCrop(canvas, { source: true }, 4000, 2000, 2, 10, -20);
      const drawGuards = [
        api.posDrawDrinkImageCrop(null, {}, 1, 1, 1, 0, 0),
        api.posDrawDrinkImageCrop(canvas, null, 1, 1, 1, 0, 0),
      ];
      let drawError = '';
      try {
        api.posDrawDrinkImageCrop({ width: 1, height: 1, getContext: () => null }, {}, 1, 1, 1, 0, 0);
      } catch (error) { drawError = errorText(error); }

      const qualities: number[] = [];
      const encodeCanvas = {
        toBlob: (callback: (value: Blob | null) => void, type: string, quality: number) => {
          qualities.push(quality);
          callback(new Blob(['ok'], { type }));
        },
      };
      const encoded = await api.posEncodeDrinkImageCanvas(encodeCanvas);
      const retryQualities: number[] = [];
      const retrySizes = [2 * 1024 * 1024 + 1, 2 * 1024 * 1024 + 1, 10];
      const retried = await api.posEncodeDrinkImageCanvas({
        toBlob: (callback: (value: Blob | null) => void, type: string, quality: number) => {
          retryQualities.push(quality);
          callback(new Blob([new Uint8Array(retrySizes.shift() || 10)], { type }));
        },
      });
      let nullEncodeError = '';
      try {
        await api.posEncodeDrinkImageCanvas({
          toBlob: (callback: (value: Blob | null) => void) => callback(null),
        });
      } catch (error) { nullEncodeError = errorText(error); }
      let oversizedEncodeError = '';
      try {
        await api.posEncodeDrinkImageCanvas({
          toBlob: (callback: (value: Blob | null) => void, type: string) => callback(
            new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type }),
          ),
        });
      } catch (error) { oversizedEncodeError = errorText(error); }

      let closed = 0;
      const source = { close: () => { closed++; } };
      api.posCloseDrinkImageSource(source);

      const urlTrace: string[] = [];
      let imageMode = 'load';
      app.URL = {
        createObjectURL: () => { urlTrace.push('create'); return 'blob:test'; },
        revokeObjectURL: (url: string) => urlTrace.push(`revoke:${url}`),
      };
      app.Image = class FakeImage {
        onload: null | (() => void) = null;
        onerror: null | (() => void) = null;
        set src(_value: string) {
          queueMicrotask(() => {
            if (imageMode === 'load') this.onload?.();
            else this.onerror?.();
          });
        }
      };
      const loadedImage = await api.posLoadImageElement({});
      imageMode = 'error';
      let loadImageError = '';
      try { await api.posLoadImageElement({}); }
      catch (error) { loadImageError = errorText(error); }

      const decodeTrace: unknown[] = [];
      const bitmapSource = { width: 100, height: 50, close: () => decodeTrace.push('bitmapClose') };
      app.createImageBitmap = async (...args: unknown[]) => {
        decodeTrace.push(['bitmap', args[1]]);
        return bitmapSource;
      };
      const bitmapDecoded = await api.posDecodeDrinkImageFile({ type: 'image/png', size: 1 });
      app.createImageBitmap = async () => { throw new Error('bitmap-failed'); };
      app.posLoadImageElement = async () => {
        decodeTrace.push('fallbackImage');
        return { naturalWidth: 320, naturalHeight: 240, close: () => decodeTrace.push('fallbackClose') };
      };
      const fallbackDecoded = await api.posDecodeDrinkImageFile({ type: 'image/png', size: 1 });
      app.createImageBitmap = undefined;
      const noBitmapDecoded = await api.posDecodeDrinkImageFile({ type: 'image/png', size: 1 });

      const downscaleContext = {
        imageSmoothingEnabled: false, imageSmoothingQuality: '',
        drawImage: (...args: unknown[]) => decodeTrace.push(['downscaleDraw', ...args.slice(1)]),
      };
      const downscaleCanvas: any = { width: 0, height: 0, getContext: () => downscaleContext };
      document.createElement = ((tag: string) => tag === 'canvas'
        ? downscaleCanvas : originalCreateElement.call(document, tag)) as typeof document.createElement;
      app.createImageBitmap = async () => ({
        width: 7200, height: 3600, close: () => decodeTrace.push('largeClose'),
      });
      const downscaled = await api.posDecodeDrinkImageFile({ type: 'image/webp', size: 1 });
      app.createImageBitmap = async () => ({
        width: 0, height: 0, close: () => decodeTrace.push('invalidClose'),
      });
      let invalidDimensionError = '';
      try { await api.posDecodeDrinkImageFile({ type: 'image/webp', size: 1 }); }
      catch (error) { invalidDimensionError = errorText(error); }

      const prepareTrace: string[] = [];
      const preparedSource = { close: () => prepareTrace.push('source.close') };
      app.posDecodeDrinkImageFile = async () => ({ source: preparedSource, width: 10, height: 20 });
      app.posDrawDrinkImageCrop = () => { prepareTrace.push('draw'); return {}; };
      app.posEncodeDrinkImageCanvas = async () => { prepareTrace.push('encode'); return new Blob(['prepared'], { type: 'image/webp' }); };
      app.posCloseDrinkImageSource = (value: any) => { prepareTrace.push('close'); value?.close?.(); };
      const prepared = await api.posPrepareDrinkImage({ type: 'image/png', size: 1 }, { zoom: 2, panX: 3, panY: 4 });
      app.posEncodeDrinkImageCanvas = async () => { prepareTrace.push('encode:fail'); throw new Error('prepare-failed'); };
      let prepareError = '';
      try { await api.posPrepareDrinkImage({ type: 'image/png', size: 1 }, {}); }
      catch (error) { prepareError = errorText(error); }

      return {
        errors, valid, geometry, drawGeometry, drawGuards, drawError, trace,
        fillStyle: context.fillStyle, smoothing: context.imageSmoothingEnabled,
        quality: context.imageSmoothingQuality, qualities, retryQualities,
        encoded: { size: encoded.size, type: encoded.type },
        retried: { size: retried.size, type: retried.type },
        nullEncodeError, oversizedEncodeError, closed,
        loadedImage: loadedImage instanceof app.Image, loadImageError, urlTrace,
        bitmapDecoded: [bitmapDecoded.width, bitmapDecoded.height],
        fallbackDecoded: [fallbackDecoded.width, fallbackDecoded.height],
        noBitmapDecoded: [noBitmapDecoded.width, noBitmapDecoded.height],
        downscaled: [downscaled.width, downscaled.height],
        downscaleSmoothing: [downscaleContext.imageSmoothingEnabled, downscaleContext.imageSmoothingQuality],
        invalidDimensionError, decodeTrace,
        prepared: { size: prepared.size, type: prepared.type }, prepareError, prepareTrace,
      };
    } finally {
      app.URL = originalUrl;
      app.Image = originalImage;
      app.createImageBitmap = originalBitmap;
      document.createElement = originalCreateElement;
      Object.entries(originals).forEach(([name, value]) => { app[name] = value; });
    }
  });
}

test('typed image validation, crop/draw, encoding, and source cleanup match classic', async ({ page, context }) => {
  const [typed, classic] = await openPair(page, context);
  const typedResult = await collectImagePrimitives(typed);
  expect(typedResult).toEqual(await collectImagePrimitives(classic));
  expect(typedResult.retryQualities).toHaveLength(3);
  expect(typedResult.nullEncodeError).toContain('Image conversion failed');
  expect(typedResult.oversizedEncodeError).toContain('still too large');
  expect(typedResult.urlTrace).toEqual([
    'create', 'revoke:blob:test', 'create', 'revoke:blob:test',
  ]);
  expect(typedResult.downscaled).toEqual([3600, 1800]);
  expect(typedResult.invalidDimensionError).toContain('Invalid image dimensions');
  expect(typedResult.prepareTrace.filter((item) => item === 'close')).toHaveLength(2);
  await classic.close();
});

async function collectEditor(page: Page) {
  return page.evaluate(async () => {
    const app = window as any;
    const api = app.MatchaLunaApp?.domains?.catalog || app;
    const h = app.__phase4hCatalogHarness;
    h.reset();
    const originals = Object.fromEntries([
      'posCanManageOperations', 'posDecodeDrinkImageFile',
      'posDrawDrinkImageCrop', 'posEncodeDrinkImageCanvas',
      'uploadPosDrinkImage', 'renderPosOpsModal', 'renderPos', 'focusSoon',
    ].map((name) => [name, app[name]]));
    const host = document.createElement('div');
    host.innerHTML = '<div id="posPhotoEditorFrame"><canvas id="posPhotoCropCanvas" width="1200" height="900" tabindex="0"></canvas></div>' +
      '<input id="posPhotoZoom"><output id="posPhotoZoomValue"></output><div id="posManageDrinksList"></div>' +
      '<input data-pos-image-product="product-1">';
    document.body.append(host);
    const canvas = host.querySelector('#posPhotoCropCanvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', { value: () => ({ width: 600, height: 450 }) });
    (canvas as any).setPointerCapture = (id: number) => h.trace.push(`capture:${id}`);
    (canvas as any).releasePointerCapture = (id: number) => h.trace.push(`release:${id}`);
    try {
      app.posCanManageOperations = () => true;
      app.cloud.client = {};
      const gateWrongModal = await api.openPosDrinkImageEditor(
        'product-1', { name: 'photo.png', type: 'image/png', size: 100 },
      );
      app.posOpsModal = Object.assign(app.freshPosOpsModal(), {
        open: true, type: 'manageDrinks', mediaRows: [{ product_id: 'product-1', product_name: 'Matcha Latte' }],
      });
      app.posOpsModal.submitting = true;
      const gateSubmitting = await api.openPosDrinkImageEditor(
        'product-1', { name: 'photo.png', type: 'image/png', size: 100 },
      );
      app.posOpsModal.submitting = false;
      const gateMissingRow = await api.openPosDrinkImageEditor(
        'missing', { name: 'photo.png', type: 'image/png', size: 100 },
      );
      const invalidOpen = await api.openPosDrinkImageEditor(
        'product-1', { name: 'photo.txt', type: 'text/plain', size: 100 },
      );
      const invalidError = app.posOpsModal.error;
      const source = { close: () => h.trace.push('sourceClose') };
      app.posDecodeDrinkImageFile = async () => ({ source, width: 2400, height: 1200 });
      app.posDrawDrinkImageCrop = (...args: unknown[]) => {
        h.trace.push(`draw:${args.slice(2).join(':')}`);
        return { scale: 1 };
      };
      app.renderPosOpsModal = () => h.trace.push('renderOps');
      app.renderPos = () => h.trace.push('renderPos');
      app.focusSoon = (selector: string) => h.trace.push(`focus:${selector}`);
      const opened = await api.openPosDrinkImageEditor('product-1', { name: 'photo.png', type: 'image/png', size: 100 });
      const current = api.posCurrentDrinkImageEditor();
      let waitExportError = '';
      try { await api.posExportDrinkImage({ loading: true }); }
      catch (error) { waitExportError = String((error as any)?.posMessage || error); }
      app.posEncodeDrinkImageCanvas = async () => new Blob(['editor'], { type: 'image/webp' });
      const exported = await api.posExportDrinkImage(current);
      current.loading = true;
      const loadingControls = [
        api.setPosDrinkImageZoom(2), api.adjustPosDrinkImageZoom(1),
        api.nudgePosDrinkImageEditor(1, 1), api.resetPosDrinkImageEditor(),
        api.beginPosDrinkImageDrag({ target: canvas, isPrimary: true, button: 0 }),
        await api.savePosDrinkImageEditor(),
      ];
      current.loading = false;
      app.posOpsModal.submitting = true;
      const submittingControls = [
        api.setPosDrinkImageZoom(2), api.nudgePosDrinkImageEditor(1, 1),
        api.resetPosDrinkImageEditor(),
        api.beginPosDrinkImageDrag({ target: canvas, isPrimary: true, button: 0 }),
        api.cancelPosDrinkImageEditor(), await api.savePosDrinkImageEditor(),
      ];
      app.posOpsModal.submitting = false;
      const zoomed = api.setPosDrinkImageZoom(9);
      const adjusted = api.adjustPosDrinkImageZoom(-0.5);
      const nudged = api.nudgePosDrinkImageEditor(30, -20);
      const began = api.beginPosDrinkImageDrag({
        target: canvas, isPrimary: true, button: 0, pointerId: 5,
        clientX: 100, clientY: 100, preventDefault: () => h.trace.push('prevent:start'),
      });
      const moved = api.movePosDrinkImageDrag({
        pointerId: 5, clientX: 130, clientY: 145,
        preventDefault: () => h.trace.push('prevent:move'),
      });
      const ended = api.endPosDrinkImageDrag({ pointerId: 5 });
      const reset = api.resetPosDrinkImageEditor();
      const beforeCancel = {
        zoom: current.zoom, panX: current.panX, panY: current.panY,
        dirty: current.dirty, drag: current.drag,
      };
      const cancelled = api.cancelPosDrinkImageEditor();

      const makeEditor = (token: number, label: string) => ({
        token, productId: 'product-1', productName: 'Matcha Latte',
        file: {}, fileName: 'photo.png',
        source: { close: () => h.trace.push(`close:${label}`) },
        sourceWidth: 1200, sourceHeight: 900, zoom: 1, panX: 0, panY: 0,
        drag: null, loading: false, dirty: false,
      });
      app.posOpsModal.mediaEditor = makeEditor(101, 'save-success');
      app.uploadPosDrinkImage = async () => true;
      const saveSuccess = await api.savePosDrinkImageEditor();
      const editorAfterSave = app.posOpsModal.mediaEditor;
      app.posOpsModal.mediaEditor = makeEditor(102, 'save-false');
      app.uploadPosDrinkImage = async () => false;
      const saveFalse = await api.savePosDrinkImageEditor();
      const editorAfterFalse = app.posOpsModal.mediaEditor?.token;
      app.posOpsModal.mediaEditor = makeEditor(103, 'save-stale-old');
      app.uploadPosDrinkImage = async () => {
        app.posOpsModal.mediaEditor = makeEditor(104, 'save-stale-new');
        return true;
      };
      const saveStale = await api.savePosDrinkImageEditor();
      const editorAfterStale = app.posOpsModal.mediaEditor?.token;

      let resolveStale!: (value: unknown) => void;
      app.posOpsModal.mediaEditor = null;
      app.posDecodeDrinkImageFile = () => new Promise((resolve) => { resolveStale = resolve; });
      const stalePromise = api.openPosDrinkImageEditor(
        'product-1', { name: 'stale.png', type: 'image/png', size: 100 },
      );
      await Promise.resolve();
      app.posMediaSelectionGeneration++;
      resolveStale({ source: { close: () => h.trace.push('close:stale') }, width: 20, height: 10 });
      const staleOpen = await stalePromise;

      const runDriftedDecode = async (label: string, drift: () => void) => {
        app.posOpsModal.mediaEditor = null;
        let resolveDecode!: (value: unknown) => void;
        app.posDecodeDrinkImageFile = () => new Promise((resolve) => { resolveDecode = resolve; });
        const pending = api.openPosDrinkImageEditor(
          'product-1', { name: `${label}.png`, type: 'image/png', size: 100 },
        );
        await Promise.resolve();
        drift();
        resolveDecode({
          source: { close: () => h.trace.push(`close:${label}`) }, width: 20, height: 10,
        });
        return pending;
      };
      const staleMedia = await runDriftedDecode('stale-media', () => { app.posMediaGeneration++; });
      const staleSession = await runDriftedDecode('stale-session', () => { app.session.user.id = 'other-user'; });
      app.session.user.id = 'catalog-user';
      const staleBusiness = await runDriftedDecode('stale-business', () => { app.posContext.businessId = 'other-business'; });
      app.posContext.businessId = 'business-1';

      app.posOpsModal.mediaEditor = null;
      app.posDecodeDrinkImageFile = async () => { throw { posMessage: 'decode-specific' }; };
      const decodeFailure = await api.openPosDrinkImageEditor(
        'product-1', { name: 'bad.png', type: 'image/png', size: 100 },
      );
      const decodeFailureState = {
        error: app.posOpsModal.error, editor: app.posOpsModal.mediaEditor,
      };
      app.posDecodeDrinkImageFile = async () => { throw new Error('generic-decode'); };
      const genericDecodeFailure = await api.openPosDrinkImageEditor(
        'product-1', { name: 'generic.png', type: 'image/png', size: 100 },
      );
      const genericDecodeError = app.posOpsModal.error;

      app.posOpsModal.mediaEditor = makeEditor(105, 'old-editor');
      app.posDecodeDrinkImageFile = async () => ({
        source: { close: () => h.trace.push('close:new-editor') }, width: 100, height: 100,
      });
      const repeatedOpen = await api.openPosDrinkImageEditor(
        'product-1', { name: 'new.png', type: 'image/png', size: 100 },
      );
      return {
        gateWrongModal, gateSubmitting, gateMissingRow, invalidOpen, invalidError,
        opened, currentProduct: current.productId, waitExportError,
        exported: { size: exported.size, type: exported.type },
        loadingControls, submittingControls,
        zoomed, adjusted, nudged,
        began, moved, ended, reset, beforeCancel, cancelled,
        saveSuccess, editorAfterSave, saveFalse, editorAfterFalse,
        saveStale, editorAfterStale, staleOpen, staleMedia, staleSession,
        staleBusiness, decodeFailure, decodeFailureState,
        genericDecodeFailure, genericDecodeError, repeatedOpen,
        editorAfter: app.posOpsModal.mediaEditor?.token, trace: h.trace,
      };
    } finally {
      host.remove();
      Object.entries(originals).forEach(([name, value]) => { app[name] = value; });
    }
  });
}

test('typed image editor open, zoom, pan, pointer, reset, cancel, focus, and cleanup match classic', async ({ page, context }) => {
  const [typed, classic] = await openPair(page, context);
  const typedResult = await collectEditor(typed);
  expect(typedResult).toEqual(await collectEditor(classic));
  expect([typedResult.gateWrongModal, typedResult.gateSubmitting,
    typedResult.gateMissingRow, typedResult.invalidOpen]).toEqual([false, false, false, false]);
  expect(typedResult.saveSuccess).toBe(true);
  expect(typedResult.editorAfterSave).toBeNull();
  expect(typedResult.editorAfterFalse).toBe(102);
  expect(typedResult.editorAfterStale).toBe(104);
  expect([typedResult.staleOpen, typedResult.decodeFailure]).toEqual([false, false]);
  expect(typedResult.loadingControls).toEqual([false, false, false, false, false, false]);
  expect(typedResult.submittingControls).toEqual([false, false, false, false, false, false]);
  expect([typedResult.staleMedia, typedResult.staleSession,
    typedResult.staleBusiness, typedResult.genericDecodeFailure]).toEqual([false, false, false, false]);
  expect(typedResult.genericDecodeError).toBe('That photo could not be read. Choose another image.');
  expect(typedResult.trace).toContain('close:stale');
  await classic.close();
});

async function collectUpload(page: Page) {
  return page.evaluate(async () => {
    const app = window as any;
    const api = app.MatchaLunaApp?.domains?.catalog || app;
    const h = app.__phase4hCatalogHarness;
    h.reset();
    const originals = Object.fromEntries([
      'posCanManageOperations', 'posExportDrinkImage', 'posPrepareDrinkImage', 'posUuid',
      'renderPosOpsModal', 'renderPos', 'posRememberCatalogCache',
    ].map((name) => [name, app[name]]));
    const setup = () => {
      app.posCheckout = app.freshPosCheckout();
      app.posCheckout.catalog = [h.product({ image_object_path: 'old.webp' })];
      app.posOpsModal = Object.assign(app.freshPosOpsModal(), {
        open: true, type: 'manageDrinks', submitting: false,
        mediaRows: [{ product_id: 'product-1', product_name: 'Matcha Latte', image_object_path: 'old.webp' }],
      });
      app.posMediaGeneration = 31;
    };
    try {
      app.posCanManageOperations = () => true;
      app.posExportDrinkImage = async () => new Blob(['image'], { type: 'image/webp' });
      app.posUuid = () => 'fixed-uuid';
      app.renderPosOpsModal = () => h.trace.push('renderOps');
      app.renderPos = () => h.trace.push('renderPos');
      app.posRememberCatalogCache = () => { h.trace.push('remember'); return true; };
      const storage = {
        upload: async (path: string, _blob: Blob, options: unknown) => {
          h.trace.push(`upload:${path}:${JSON.stringify(options)}`); return { error: null };
        },
        remove: async (paths: string[]) => { h.trace.push(`remove:${paths.join(',')}`); return { error: null }; },
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
      };
      setup();
      app.cloud.client = { storage: { from: () => storage }, rpc: async () => ({ data: [] }) };
      app.posCanManageOperations = () => false;
      const gatePermission = await api.uploadPosDrinkImage('product-1', { source: {} });
      app.posCanManageOperations = () => true;
      app.posOpsModal.type = 'other';
      const gateWrongModal = await api.uploadPosDrinkImage('product-1', { source: {} });
      setup();
      app.cloud.client = { storage: { from: () => storage }, rpc: async () => ({ data: [] }) };
      app.posOpsModal.submitting = true;
      const gateSubmitting = await api.uploadPosDrinkImage('product-1', { source: {} });
      app.posOpsModal.submitting = false;
      const gateMissingRow = await api.uploadPosDrinkImage('missing', { source: {} });

      setup();
      app.cloud.client = {
        storage: { from: (bucket: string) => { h.trace.push(`bucket:${bucket}`); return storage; } },
        rpc: async (name: string, args: any) => {
          h.trace.push(`rpc:${name}:${JSON.stringify(args)}`);
          return { data: [{ image_object_path: args.p_new_path, updated_at: 'saved-at' }] };
        },
      };
      const success = await api.uploadPosDrinkImage('product-1', { source: {} });
      const successState = {
        row: app.posOpsModal.mediaRows[0].image_object_path,
        catalog: app.posCheckout.catalog[0].image_object_path,
        notice: app.posOpsModal.notice, error: app.posOpsModal.error,
        submitting: app.posOpsModal.submitting,
      };

      h.trace.push('---raw-file---');
      setup();
      app.posPrepareDrinkImage = async (file: any) => {
        h.trace.push(`prepare:${file.name}`);
        return new Blob(['prepared'], { type: 'image/webp' });
      };
      app.cloud.client = {
        storage: { from: () => storage },
        rpc: async (_name: string, args: any) => ({
          data: [{ image_object_path: args.p_new_path, updated_at: 'raw-at' }],
        }),
      };
      const rawFile = await api.uploadPosDrinkImage('product-1', {
        name: 'raw.png', type: 'image/png', size: 100,
      });

      h.trace.push('---recovery---');
      setup();
      app.cloud.client = {
        storage: { from: (bucket: string) => { h.trace.push(`bucket:${bucket}`); return storage; } },
        rpc: async (name: string, args: any) => {
          h.trace.push(`rpc:${name}:${JSON.stringify(args)}`);
          if (name === 'pos_set_product_image') throw { message: 'lost response' };
          return { data: [{ product_id: 'product-1', product_name: 'Matcha Latte', image_object_path: 'business-1/product-1/fixed-uuid.webp', updated_at: 'recovered-at' }] };
        },
      };
      const recovered = await api.uploadPosDrinkImage('product-1', { source: {} });
      const recoveryState = {
        row: app.posOpsModal.mediaRows[0].image_object_path,
        notice: app.posOpsModal.notice, error: app.posOpsModal.error,
        submitting: app.posOpsModal.submitting,
      };

      h.trace.push('---cleanup-warning---');
      setup();
      const warningStorage = {
        upload: storage.upload,
        remove: async (paths: string[]) => {
          h.trace.push(`warning-remove:${paths.join(',')}`);
          return { error: { message: 'cleanup-failed' } };
        },
      };
      app.cloud.client = {
        storage: { from: () => warningStorage },
        rpc: async (_name: string, args: any) => ({
          data: [{ image_object_path: args.p_new_path, updated_at: 'warning-at' }],
        }),
      };
      const cleanupWarning = await api.uploadPosDrinkImage('product-1', { source: {} });
      const cleanupWarningNotice = app.posOpsModal.notice;

      h.trace.push('---cleanup-throw---');
      setup();
      app.cloud.client = {
        storage: { from: () => ({
          upload: storage.upload,
          remove: async () => { h.trace.push('old-cleanup-throw'); throw new Error('old-cleanup-failed'); },
        }) },
        rpc: async (_name: string, args: any) => ({
          data: [{ image_object_path: args.p_new_path, updated_at: 'cleanup-throw-at' }],
        }),
      };
      const cleanupThrow = await api.uploadPosDrinkImage('product-1', { source: {} });
      const cleanupThrowNotice = app.posOpsModal.notice;

      h.trace.push('---verified-loser---');
      setup();
      const loserTraceStart = h.trace.length;
      app.cloud.client = {
        storage: { from: () => storage },
        rpc: async (name: string) => {
          h.trace.push(`loser-rpc:${name}`);
          if (name === 'pos_set_product_image') throw { message: 'attach-failed' };
          return { data: [{ product_id: 'product-1', product_name: 'Matcha Latte', image_object_path: 'winner.webp' }] };
        },
      };
      const verifiedLoser = await api.uploadPosDrinkImage('product-1', { source: {} });
      const loserTrace = h.trace.slice(loserTraceStart);
      const verifiedLoserState = {
        row: app.posOpsModal.mediaRows[0].image_object_path,
        notice: app.posOpsModal.notice, error: app.posOpsModal.error,
        submitting: app.posOpsModal.submitting,
      };

      const runUploadFailure = async (label: string, throws: boolean) => {
        h.trace.push(`---${label}---`);
        setup();
        app.cloud.client = {
          storage: { from: () => ({
            upload: async () => {
              h.trace.push(`${label}:upload`);
              if (throws) throw new Error(`${label}-threw`);
              return { error: { message: `${label}-error` } };
            },
            remove: async (paths: string[]) => {
              h.trace.push(`${label}:remove:${paths.join(',')}`);
              return { error: null };
            },
          }) },
          rpc: async (name: string) => {
            h.trace.push(`${label}:rpc:${name}`);
            return { data: [{ product_id: 'product-1', image_object_path: 'old.webp' }] };
          },
        };
        return api.uploadPosDrinkImage('product-1', { source: {} });
      };
      const uploadError = await runUploadFailure('upload-error', false);
      const uploadThrow = await runUploadFailure('upload-throw', true);

      h.trace.push('---empty-attach---');
      setup();
      let emptyAttachCalls = 0;
      app.cloud.client = {
        storage: { from: () => storage },
        rpc: async () => {
          emptyAttachCalls++;
          if (emptyAttachCalls === 1) return { data: [] };
          return { data: [{
            product_id: 'product-1', image_object_path: 'business-1/product-1/fixed-uuid.webp',
            updated_at: 'empty-recovered-at',
          }] };
        },
      };
      const emptyAttachRecovered = await api.uploadPosDrinkImage('product-1', { source: {} });

      h.trace.push('---unverifiable---');
      setup();
      const unverifiableStart = h.trace.length;
      app.cloud.client = {
        storage: { from: () => storage },
        rpc: async (name: string) => {
          h.trace.push(`unverifiable-rpc:${name}`);
          throw { message: name === 'pos_set_product_image' ? 'attach-failed' : 'refresh-failed' };
        },
      };
      const unverifiable = await api.uploadPosDrinkImage('product-1', { source: {} });
      const unverifiableTrace = h.trace.slice(unverifiableStart);

      h.trace.push('---prepare-failure---');
      setup();
      app.posExportDrinkImage = async () => { throw { posMessage: 'prepare-failed' }; };
      const prepareFailureStart = h.trace.length;
      const prepareFailure = await api.uploadPosDrinkImage('product-1', { source: {} });
      const prepareFailureTrace = h.trace.slice(prepareFailureStart);
      const prepareFailureState = {
        error: app.posOpsModal.error, submitting: app.posOpsModal.submitting,
      };

      h.trace.push('---stale-before-upload---');
      setup();
      let resolveExport!: (value: Blob) => void;
      app.posExportDrinkImage = () => new Promise((resolve) => { resolveExport = resolve; });
      app.cloud.client = {
        storage: { from: () => storage },
        rpc: async () => ({ data: [] }),
      };
      const staleStart = h.trace.length;
      const stalePromise = api.uploadPosDrinkImage('product-1', { source: {} });
      await Promise.resolve();
      app.posMediaGeneration++;
      resolveExport(new Blob(['stale'], { type: 'image/webp' }));
      const staleBeforeUpload = await stalePromise;
      const staleTrace = h.trace.slice(staleStart);

      const runIdentityStale = async (label: string, drift: () => void, restore: () => void) => {
        h.trace.push(`---${label}---`);
        setup();
        let resolveIdentity!: (value: Blob) => void;
        app.posExportDrinkImage = () => new Promise((resolve) => { resolveIdentity = resolve; });
        app.cloud.client = {
          storage: { from: () => storage }, rpc: async () => ({ data: [] }),
        };
        const pending = api.uploadPosDrinkImage('product-1', { source: {} });
        await Promise.resolve();
        drift();
        resolveIdentity(new Blob([label], { type: 'image/webp' }));
        const result = await pending;
        restore();
        return result;
      };
      const staleSession = await runIdentityStale(
        'stale-session',
        () => { app.session.user.id = 'other-user'; },
        () => { app.session.user.id = 'catalog-user'; },
      );
      const staleBusiness = await runIdentityStale(
        'stale-business',
        () => { app.posContext.businessId = 'other-business'; },
        () => { app.posContext.businessId = 'business-1'; },
      );

      h.trace.push('---stale-after-upload---');
      setup();
      app.posExportDrinkImage = async () => new Blob(['image'], { type: 'image/webp' });
      let resolveUpload!: (value: unknown) => void;
      const staleAfterUploadStart = h.trace.length;
      app.cloud.client = {
        storage: { from: () => ({
          upload: (path: string) => {
            h.trace.push(`deferred-upload:${path}`);
            return new Promise((resolve) => { resolveUpload = resolve; });
          },
          remove: storage.remove,
        }) },
        rpc: async (name: string) => {
          h.trace.push(`unexpected-rpc:${name}`);
          return { data: [] };
        },
      };
      const staleAfterUploadPromise = api.uploadPosDrinkImage('product-1', { source: {} });
      await Promise.resolve();
      await Promise.resolve();
      app.posMediaGeneration++;
      resolveUpload({ error: null });
      const staleAfterUpload = await staleAfterUploadPromise;
      const staleAfterUploadTrace = h.trace.slice(staleAfterUploadStart);
      return {
        gatePermission, gateWrongModal, gateSubmitting, gateMissingRow,
        success, successState, rawFile, recovered, recoveryState,
        cleanupWarning, cleanupWarningNotice, cleanupThrow, cleanupThrowNotice,
        verifiedLoser, verifiedLoserState, loserTrace,
        uploadError, uploadThrow, emptyAttachRecovered,
        unverifiable, unverifiableTrace,
        prepareFailure, prepareFailureState, prepareFailureTrace,
        staleBeforeUpload, staleTrace, staleSession, staleBusiness,
        staleAfterUpload,
        staleAfterUploadTrace, trace: h.trace,
      };
    } finally {
      Object.entries(originals).forEach(([name, value]) => { app[name] = value; });
    }
  });
}

test('typed media upload, replacement cleanup, lost-response recovery, and exact operation order match classic', async ({ page, context }) => {
  const [typed, classic] = await openPair(page, context);
  const typedResult = await collectUpload(typed);
  expect(typedResult).toEqual(await collectUpload(classic));
  expect(typedResult.cleanupWarning).toBe(true);
  expect(typedResult.cleanupWarningNotice).toContain('previous file could not be cleaned up');
  expect([typedResult.gatePermission, typedResult.gateWrongModal,
    typedResult.gateSubmitting, typedResult.gateMissingRow]).toEqual([false, false, false, false]);
  expect(typedResult.rawFile).toBe(true);
  expect(typedResult.cleanupThrow).toBe(true);
  expect(typedResult.cleanupThrowNotice).toContain('previous file could not be cleaned up');
  expect(typedResult.verifiedLoser).toBe(false);
  expect(typedResult.loserTrace).toContain('remove:business-1/product-1/fixed-uuid.webp');
  expect(typedResult.unverifiable).toBe(false);
  expect([typedResult.uploadError, typedResult.uploadThrow]).toEqual([false, false]);
  expect(typedResult.emptyAttachRecovered).toBe(true);
  expect(typedResult.unverifiableTrace.some((item: unknown) => String(item).startsWith('remove:'))).toBe(false);
  expect([typedResult.prepareFailure, typedResult.staleBeforeUpload,
    typedResult.staleSession, typedResult.staleBusiness,
    typedResult.staleAfterUpload]).toEqual([false, false, false, false, false]);
  expect(typedResult.staleTrace.some((item: unknown) => String(item).startsWith('upload:'))).toBe(false);
  expect(typedResult.staleAfterUploadTrace.some((item: unknown) => String(item).startsWith('unexpected-rpc:'))).toBe(false);
  await classic.close();
});

async function collectRemove(page: Page) {
  return page.evaluate(async () => {
    const app = window as any;
    const api = app.MatchaLunaApp?.domains?.catalog || app;
    const h = app.__phase4hCatalogHarness;
    h.reset();
    const originals = Object.fromEntries([
      'posCanManageOperations', 'renderPosOpsModal', 'renderPos', 'focusSoon',
      'posRememberCatalogCache',
    ].map((name) => [name, app[name]]));
    const setup = () => {
      app.posCheckout = app.freshPosCheckout();
      app.posCheckout.catalog = [h.product({ image_object_path: 'old.webp' })];
      app.posOpsModal = Object.assign(app.freshPosOpsModal(), {
        open: true, type: 'manageDrinks', submitting: false,
        mediaRemoveProductId: '',
        mediaRows: [{ product_id: 'product-1', product_name: 'Matcha Latte', image_object_path: 'old.webp' }],
      });
      app.posMediaGeneration = 31;
    };
    try {
      app.posCanManageOperations = () => true;
      app.renderPosOpsModal = () => h.trace.push('renderOps');
      app.renderPos = () => h.trace.push('renderPos');
      app.focusSoon = (selector: string) => h.trace.push(`focus:${selector}`);
      app.posRememberCatalogCache = () => { h.trace.push('remember'); return true; };
      const storage = {
        remove: async (paths: string[]) => { h.trace.push(`remove:${paths.join(',')}`); return { error: null }; },
      };
      setup();
      app.cloud.client = { storage: { from: () => storage }, rpc: async () => ({ data: [] }) };
      app.posCanManageOperations = () => false;
      const blockedPermission = api.requestRemovePosDrinkImage('product-1');
      app.posCanManageOperations = () => true;
      const blockedMissing = api.requestRemovePosDrinkImage('missing');
      app.posOpsModal.submitting = true;
      const blockedSubmitting = api.requestRemovePosDrinkImage('product-1');
      app.posOpsModal.mediaRemoveProductId = 'product-1';
      const blockedCancel = api.cancelRemovePosDrinkImage();
      app.posOpsModal.submitting = false;
      app.posOpsModal.mediaRemoveProductId = '';
      app.posCanManageOperations = () => false;
      app.posOpsModal.mediaRemoveProductId = 'product-1';
      const confirmPermission = await api.confirmRemovePosDrinkImage();
      app.posCanManageOperations = () => true;
      app.posOpsModal.submitting = true;
      const confirmSubmitting = await api.confirmRemovePosDrinkImage();
      app.posOpsModal.submitting = false;
      app.posOpsModal.mediaRemoveProductId = '';
      const confirmMissingId = await api.confirmRemovePosDrinkImage();
      app.cloud.client = {
        storage: { from: (bucket: string) => { h.trace.push(`bucket:${bucket}`); return storage; } },
        rpc: async (name: string, args: unknown) => {
          h.trace.push(`rpc:${name}:${JSON.stringify(args)}`);
          return { data: [{ updated_at: 'removed-at' }] };
        },
      };
      const requested = api.requestRemovePosDrinkImage('product-1');
      const cancelled = api.cancelRemovePosDrinkImage();
      api.requestRemovePosDrinkImage('product-1');
      const removed = await api.confirmRemovePosDrinkImage();
      const removedState = {
        row: app.posOpsModal.mediaRows[0].image_object_path,
        catalog: app.posCheckout.catalog[0].image_object_path,
        notice: app.posOpsModal.notice, error: app.posOpsModal.error,
        removeId: app.posOpsModal.mediaRemoveProductId,
      };

      h.trace.push('---recovery---');
      setup();
      app.posOpsModal.mediaRemoveProductId = 'product-1';
      app.cloud.client = {
        storage: { from: (bucket: string) => { h.trace.push(`bucket:${bucket}`); return storage; } },
        rpc: async (name: string, args: unknown) => {
          h.trace.push(`rpc:${name}:${JSON.stringify(args)}`);
          if (name === 'pos_set_product_image') throw { message: 'lost response' };
          return { data: [{ product_id: 'product-1', product_name: 'Matcha Latte', image_object_path: null, updated_at: 'recovered-at' }] };
        },
      };
      const recovered = await api.confirmRemovePosDrinkImage();
      const recoveryState = {
        row: app.posOpsModal.mediaRows[0].image_object_path,
        notice: app.posOpsModal.notice, error: app.posOpsModal.error,
        removeId: app.posOpsModal.mediaRemoveProductId,
      };

      h.trace.push('---missing-path---');
      setup();
      app.posOpsModal.mediaRows[0].image_object_path = null;
      app.posOpsModal.mediaRemoveProductId = 'product-1';
      const missingPath = await api.confirmRemovePosDrinkImage();
      const missingPathState = {
        removeId: app.posOpsModal.mediaRemoveProductId,
        submitting: app.posOpsModal.submitting,
      };

      h.trace.push('---cleanup-warning---');
      setup();
      app.posOpsModal.mediaRemoveProductId = 'product-1';
      app.cloud.client = {
        storage: { from: () => ({
          remove: async (paths: string[]) => {
            h.trace.push(`warning-remove:${paths.join(',')}`);
            return { error: { message: 'cleanup-failed' } };
          },
        }) },
        rpc: async () => ({ data: [{ updated_at: 'warning-at' }] }),
      };
      const cleanupWarning = await api.confirmRemovePosDrinkImage();
      const cleanupWarningNotice = app.posOpsModal.notice;

      h.trace.push('---cleanup-throw-recovery---');
      setup();
      app.posOpsModal.mediaRemoveProductId = 'product-1';
      let cleanupRpcCount = 0;
      app.cloud.client = {
        storage: { from: () => ({
          remove: async () => { h.trace.push('cleanup-throw'); throw new Error('cleanup-threw'); },
        }) },
        rpc: async (name: string) => {
          cleanupRpcCount++;
          h.trace.push(`cleanup-rpc:${name}:${cleanupRpcCount}`);
          if (cleanupRpcCount === 1) return { data: [{ updated_at: 'cleared-at' }] };
          return { data: [{ product_id: 'product-1', image_object_path: null, updated_at: 'verified-at' }] };
        },
      };
      const cleanupThrowRecovered = await api.confirmRemovePosDrinkImage();
      const cleanupThrowState = {
        row: app.posOpsModal.mediaRows[0].image_object_path,
        notice: app.posOpsModal.notice, error: app.posOpsModal.error,
      };

      h.trace.push('---empty-response---');
      setup();
      app.posOpsModal.mediaRemoveProductId = 'product-1';
      app.cloud.client = {
        storage: { from: () => storage },
        rpc: async () => ({ data: [] }),
      };
      const emptyResponse = await api.confirmRemovePosDrinkImage();
      const emptyResponseState = {
        row: app.posOpsModal.mediaRows[0].image_object_path,
        submitting: app.posOpsModal.submitting,
      };

      h.trace.push('---still-present---');
      setup();
      app.posOpsModal.mediaRemoveProductId = 'product-1';
      app.cloud.client = {
        storage: { from: () => storage },
        rpc: async (name: string) => {
          h.trace.push(`still-rpc:${name}`);
          if (name === 'pos_set_product_image') throw { message: 'remove-failed' };
          return { data: [{ product_id: 'product-1', image_object_path: 'old.webp' }] };
        },
      };
      const stillPresent = await api.confirmRemovePosDrinkImage();
      const stillPresentState = {
        row: app.posOpsModal.mediaRows[0].image_object_path,
        error: app.posOpsModal.error, removeId: app.posOpsModal.mediaRemoveProductId,
        submitting: app.posOpsModal.submitting,
      };

      h.trace.push('---refresh-failure---');
      setup();
      app.posOpsModal.mediaRemoveProductId = 'product-1';
      app.cloud.client = {
        storage: { from: () => storage },
        rpc: async (name: string) => {
          h.trace.push(`refresh-fail-rpc:${name}`);
          throw { message: name === 'pos_set_product_image' ? 'remove-failed' : 'refresh-failed' };
        },
      };
      const refreshFailure = await api.confirmRemovePosDrinkImage();
      const refreshFailureState = {
        error: app.posOpsModal.error, removeId: app.posOpsModal.mediaRemoveProductId,
        submitting: app.posOpsModal.submitting,
      };

      h.trace.push('---stale---');
      setup();
      app.posOpsModal.mediaRemoveProductId = 'product-1';
      let resolveRemove!: (value: unknown) => void;
      const staleStart = h.trace.length;
      app.cloud.client = {
        storage: { from: () => storage },
        rpc: () => new Promise((resolve) => { resolveRemove = resolve; }),
      };
      const stalePromise = api.confirmRemovePosDrinkImage();
      await Promise.resolve();
      app.posMediaGeneration++;
      resolveRemove({ data: [{ updated_at: 'stale-at' }] });
      const stale = await stalePromise;
      const staleTrace = h.trace.slice(staleStart);

      const runRemoveIdentityStale = async (
        label: string, drift: () => void, restore: () => void,
      ) => {
        h.trace.push(`---${label}---`);
        setup();
        app.posOpsModal.mediaRemoveProductId = 'product-1';
        let resolveIdentity!: (value: unknown) => void;
        app.cloud.client = {
          storage: { from: () => storage },
          rpc: () => new Promise((resolve) => { resolveIdentity = resolve; }),
        };
        const pending = api.confirmRemovePosDrinkImage();
        await Promise.resolve();
        drift();
        resolveIdentity({ data: [{ updated_at: `${label}-at` }] });
        const result = await pending;
        restore();
        return result;
      };
      const staleSession = await runRemoveIdentityStale(
        'stale-session',
        () => { app.session.user.id = 'other-user'; },
        () => { app.session.user.id = 'catalog-user'; },
      );
      const staleBusiness = await runRemoveIdentityStale(
        'stale-business',
        () => { app.posContext.businessId = 'other-business'; },
        () => { app.posContext.businessId = 'business-1'; },
      );
      return {
        blockedPermission, blockedMissing, blockedSubmitting, blockedCancel,
        confirmPermission, confirmSubmitting, confirmMissingId,
        requested, cancelled, removed, removedState, recovered, recoveryState,
        missingPath, missingPathState, cleanupWarning, cleanupWarningNotice,
        cleanupThrowRecovered, cleanupThrowState,
        emptyResponse, emptyResponseState,
        stillPresent, stillPresentState, refreshFailure, refreshFailureState,
        stale, staleTrace, staleSession, staleBusiness, trace: h.trace,
      };
    } finally {
      Object.entries(originals).forEach(([name, value]) => { app[name] = value; });
    }
  });
}

test('typed media remove request, cancel, success, cleanup, and lost-response recovery match classic', async ({ page, context }) => {
  const [typed, classic] = await openPair(page, context);
  const typedResult = await collectRemove(typed);
  expect(typedResult).toEqual(await collectRemove(classic));
  expect([typedResult.blockedPermission, typedResult.blockedMissing,
    typedResult.blockedSubmitting, typedResult.blockedCancel]).toEqual([false, false, false, false]);
  expect([typedResult.confirmPermission, typedResult.confirmSubmitting,
    typedResult.confirmMissingId]).toEqual([false, false, false]);
  expect(typedResult.missingPath).toBe(false);
  expect(typedResult.cleanupWarning).toBe(true);
  expect(typedResult.cleanupWarningNotice).toContain('cloud cleanup should be retried');
  expect(typedResult.cleanupThrowRecovered).toBe(true);
  expect(typedResult.cleanupThrowState.notice).toContain('recovered');
  expect(typedResult.emptyResponse).toBe(false);
  expect([typedResult.stillPresent, typedResult.refreshFailure, typedResult.stale,
    typedResult.staleSession, typedResult.staleBusiness]).toEqual([false, false, false, false, false]);
  expect(typedResult.staleTrace.some((item: unknown) => String(item).startsWith('remove:'))).toBe(false);
  await classic.close();
});
