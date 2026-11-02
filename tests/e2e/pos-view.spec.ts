import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const posViewNames = [
  'posPaymentLabel',
  'posSummaryHtml',
  'posReceiptHtml',
  'posProductCardHtml',
  'posCatalogHtml',
  'posCashSuggestions',
  'updatePosPaymentPreview',
  'posCartHtml',
  'posSalesRowsHtml',
  'posRecentHtml',
  'posShiftBarHtml',
  'posNoShiftGateHtml',
  'managePosMenu',
  'posWorkspaceHtml',
  'posMobileOrderBarHtml',
  'focusPosCart',
  'posSyncStatusHtml',
  'posCriticalRefreshNoticeHtml',
  'renderPosPreservingInteraction',
] as const;

const activeRuntimeFiles = [
  'state.js',
  'pos-catalog.js',
  'workspace-sync.js',
  'pos-operations.js',
  'render-modals.js',
  'boot.js',
  'start.js',
] as const;

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
] as const;

async function stubSupabase(page: Page) {
  await page.route(
    /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/,
    async (route) => {
      await route.fulfill({
        contentType: 'application/javascript',
        body: 'window.supabase={createClient:function(){throw new Error("Supabase is disabled in browser tests");}};',
      });
    },
  );
}

async function openPrimary(page: Page) {
  await stubSupabase(page);
  await page.goto('index.html?test=1', { waitUntil: 'load' });
  await page.evaluate(() =>
    (
      window as typeof window & { MatchaLunaApp: { ready: Promise<void> } }
    ).MatchaLunaApp.ready,
  );
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
}

async function openClassic(context: BrowserContext) {
  const builtHtml = readFileSync(resolve(process.cwd(), 'dist/index.html'), 'utf8');
  const scripts = transitionRuntimeFiles
    .map((file) => `<script src="/Scoopies/assets/js/${file}"></script>`)
    .join('\n');
  const html = builtHtml
    .replace(/\s*<script type="module"[^>]*><\/script>/, '')
    .replace('</body>', `${scripts}\n</body>`);
  const page = await context.newPage();
  await stubSupabase(page);
  await page.route('**/index.html?test=1&pos-view-transition=1', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.goto('index.html?test=1&pos-view-transition=1', { waitUntil: 'load' });
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
  return page;
}

function collectPosRendererFingerprint() {
  const app = window as typeof window & Record<string, any>;
  const api: Record<string, any> = app.MatchaLunaApp?.domains?.pos || app;
  const names = [
    'posPaymentLabel', 'posSummaryHtml', 'posReceiptHtml', 'posProductCardHtml',
    'posCatalogHtml', 'posCashSuggestions', 'posCartHtml', 'posSalesRowsHtml',
    'posRecentHtml', 'posShiftBarHtml', 'posNoShiftGateHtml', 'posWorkspaceHtml',
    'posMobileOrderBarHtml', 'posSyncStatusHtml', 'posCriticalRefreshNoticeHtml',
  ];
  const fn = Object.fromEntries(names.map((name) => [name, api[name]]));
  const dependencies = [
    'escapeHtml', 'peso', 'posModeName', 'posProductCartLines',
    'posProductCartQuantity', 'posDrinkImageHtml', 'normalizePosCategory',
    'posDrinkGroupKey', 'posCanManageOperations', 'posCartLines',
    'posCartTotalCentavos', 'posCartUnits', 'strictPesoCentavos',
    'posCheckoutValidation', 'posVariantKey', 'posModeFromPending',
    'posCanManageMedia',
  ];
  const originals = Object.fromEntries(dependencies.map((name) => [name, app[name]]));
  const originalCheckout = app.posCheckout;
  const native = { Number: app.Number, String: app.String, Date: app.Date, Math: app.Math };
  const trace: string[] = [];
  const nativeTrace: string[] = [];
  const mutations: string[] = [];
  const calls: string[] = [];
  let canManageOperationsOverride: boolean | null = null;
  let canManageMediaOverride: boolean | null = null;
  const stored = (storage: Storage) =>
    Array.from({ length: storage.length }, (_, index) => {
      const key = storage.key(index) || '';
      return [key, storage.getItem(key)] as const;
    }).sort((a, b) => a[0].localeCompare(b[0]));
  const state = app.freshPosCheckout();
  const matcha = {
    product_id: 'matcha&1', active_version_id: 'v1',
    product_name: 'Cloud <Matcha>', category_name: 'Matcha',
    size_snapshot: '12oz', selling_price_centavos: 18_000,
    image_object_path: '',
  };
  const hojicha = {
    product_id: 'hojicha-1', active_version_id: 'v2',
    product_name: 'Sea Salt Hojicha', category_name: 'Hojicha',
    size_snapshot: '', selling_price_centavos: 19_000,
    image_object_path: '',
  };
  const line: any = {
    key: 'matcha&1|v1|standard|standard', productId: 'matcha&1',
    productVersionId: 'v1', name: 'Cloud <Matcha>', size: '12oz',
    quantity: 2, priceCentavos: 18_000, matchaOptionId: '',
    matchaOptionRevision: null, matchaOptionName: '',
    matchaSurchargeCentavos: 0, stale: false, latest: null,
  };
  const shiftStatus = {
    shift_id: 'shift-1', can_open_live: true, can_open_training: true,
    can_close_shift: true, can_view_costs: true,
    register_name: 'Main <register>',
  };
  const shift = {
    ...shiftStatus, opened_at: '2026-10-02T03:04:00.000Z',
    opened_by_display_name: 'Ynah & partner', is_training: false,
  };
  const summary = {
    business_date: '2026-10-02', gross_sales_centavos: 50_000,
    voided_sales_centavos: 12_000, net_sales_centavos: 38_000,
    net_items_sold: 3,
  };
  const sale = {
    sale_id: 'sale<&', completed_at: '2026-10-02T10:11:00.000Z',
    business_date: '2026-10-02', sale_state: 'completed', units_sold: 2,
    cashier_display_name: 'Ynah <owner>', can_view_costs: true,
    estimated_gross_profit_centavos: 12_345, payment_method: 'gotyme',
    net_total_centavos: 37_000, gross_total_centavos: 37_000,
    receipt_number: 'SCP-1', item_summary: '2 x Matcha <Cloud>', can_void: true,
  };
  Object.assign(state, {
    catalog: [matcha, hojicha], cart: { [line.key]: line }, loaded: true,
    category: 'all', paymentMethod: 'cash', cashReceived: '500',
    referenceNumber: 'ref<&', reportMode: 'live', shiftStatus, shift,
    summary, recent: [],
  });
  const proxy = new Proxy(state, {
    get(target, property, receiver) {
      if (typeof property === 'string') trace.push(`get:posCheckout.${property}`);
      return Reflect.get(target, property, receiver);
    },
    set(target, property, value, receiver) {
      if (typeof property === 'string') trace.push(`set:posCheckout.${property}`);
      return Reflect.set(target, property, value, receiver);
    },
  });
  const invoke = (label: string, action: () => unknown, categoryMayNormalize = false) => {
    calls.push(label);
    const before = structuredClone(state);
    const value = action();
    const expected = structuredClone(before);
    if (categoryMayNormalize) expected.category = state.category;
    if (JSON.stringify(expected) !== JSON.stringify(state)) mutations.push(label);
    return value;
  };

  try {
    app.posCheckout = proxy;
    dependencies.forEach((name) => {
      app[name] = function traced(...args: any[]) {
        trace.push(`call:${name}`);
        if (name === 'posCanManageOperations' && canManageOperationsOverride != null) {
          return canManageOperationsOverride;
        }
        if (name === 'posCanManageMedia' && canManageMediaOverride != null) {
          return canManageMediaOverride;
        }
        return originals[name].apply(this, args);
      };
    });
    app.Number = new Proxy(native.Number, {
      apply(target, thisArg, args) { nativeTrace.push('Number'); return Reflect.apply(target, thisArg, args); },
    });
    app.String = new Proxy(native.String, {
      apply(target, thisArg, args) { nativeTrace.push('String'); return Reflect.apply(target, thisArg, args); },
    });
    app.Date = new Proxy(native.Date, {
      apply(target, thisArg, args) { nativeTrace.push('Date:apply'); return Reflect.apply(target, thisArg, args); },
      construct(target, args, newTarget) { nativeTrace.push('Date:construct'); return Reflect.construct(target, args, newTarget); },
    });
    app.Math = new Proxy(native.Math, {
      get(target, property, receiver) {
        if (property === 'ceil' || property === 'max') nativeTrace.push(`Math.${String(property)}`);
        return Reflect.get(target, property, receiver);
      },
    });
    const localBefore = stored(localStorage);
    const sessionBefore = stored(sessionStorage);

    const paymentLabels = invoke('payment-labels', () =>
      ['cash', 'gcash', 'gotyme', 'other'].map(fn.posPaymentLabel));
    state.reportsLoading = true; state.summary = null;
    const summaryLoading = invoke('summary-loading', fn.posSummaryHtml);
    state.reportsLoading = false; state.reportMode = 'training';
    const summaryEmpty = invoke('summary-empty', fn.posSummaryHtml);
    state.summary = summary;
    const summaryRich = invoke('summary-rich', fn.posSummaryHtml);

    state.lastReceipt = null;
    const receiptEmpty = invoke('receipt-empty', fn.posReceiptHtml);
    state.lastReceipt = {
      receipt_number: 'SCP-<&', is_retry: true, is_training: true,
      units_sold: 2, payment_method: 'gcash', total_centavos: 37_000,
      change_given_centavos: 500,
    };
    const receiptRich = invoke('receipt-rich', fn.posReceiptHtml);
    state.lastReceipt = { ...state.lastReceipt, units_sold: 1, change_given_centavos: null };
    const receiptNoChange = invoke('receipt-no-change', fn.posReceiptHtml);
    const productCurrent = invoke('product-current', () => fn.posProductCardHtml(matcha, false));
    line.stale = true;
    const productReview = invoke('product-review', () => fn.posProductCardHtml(matcha, true));
    line.stale = false;
    state.cart = {};
    const productPlain = invoke('product-plain', () => fn.posProductCardHtml(matcha, false));
    state.cart = { [line.key]: line };

    state.catalogLoading = true; state.catalog = []; state.category = 'missing';
    const catalogLoading = invoke('catalog-loading', fn.posCatalogHtml);
    const loadingCategory = state.category;
    state.catalogLoading = false; state.catalogError = 'Menu <offline>';
    const catalogError = invoke('catalog-error', fn.posCatalogHtml);
    const errorCategory = state.category;
    state.catalogError = ''; state.catalog = [matcha, hojicha];
    const catalogRich = invoke('catalog-rich', fn.posCatalogHtml, true);
    const normalizedCategory = state.category;
    state.category = 'hojicha';
    const catalogFiltered = invoke('catalog-filtered', fn.posCatalogHtml);
    state.category = 'all'; state.catalog = [];
    const catalogEmpty = invoke('catalog-empty', fn.posCatalogHtml);
    canManageOperationsOverride = false;
    const catalogEmptyNoManage = invoke('catalog-empty-no-manage', fn.posCatalogHtml);
    canManageOperationsOverride = null;
    state.catalog = [matcha, hojicha];
    const cashSuggestions = invoke('cash-suggestions', () => [
      fn.posCashSuggestions(0), fn.posCashSuggestions(12_345),
      fn.posCashSuggestions(100_000),
    ]);

    const savedCart = state.cart;
    state.cart = {}; state.shift = null;
    state.shiftStatus = { can_open_live: false, can_open_training: false };
    const cartEmpty = invoke('cart-empty', fn.posCartHtml);
    state.cart = savedCart; state.shiftStatus = shiftStatus;
    const cartNoShift = invoke('cart-no-shift', fn.posCartHtml);
    state.shift = shift;
    line.key = '';
    const cartCash = invoke('cart-cash', fn.posCartHtml);
    line.key = 'matcha&1|v1|standard|standard';
    state.paymentMethod = 'gcash';
    const cartGcash = invoke('cart-gcash', fn.posCartHtml);
    state.paymentMethod = 'cash';
    state.confirming = true;
    const cartConfirming = invoke('cart-confirming', fn.posCartHtml);
    state.confirming = false;
    line.stale = true;
    line.latest = { selling_price_centavos: 20_000 };
    state.catalogChanged = true; state.notice = 'Notice <safe>'; state.error = 'Error <safe>';
    const cartChanged = invoke('cart-changed', fn.posCartHtml);
    line.stale = false; line.latest = null;
    state.catalogChanged = false; state.notice = ''; state.error = '';
    state.pending = { rpcArgs: { p_is_training: true, p_cash_tendered_centavos: null } };
    const cartPending = invoke('cart-pending', fn.posCartHtml);
    state.pending = null; state.paymentMethod = 'cash';

    state.summary = { business_date: '2026-10-02' };
    const salesRows = invoke('sales-rows', () => fn.posSalesRowsHtml([
      sale,
      { ...sale, sale_id: 'voided', sale_state: 'voided',
        business_date: '2026-10-01', void_reason: 'Wrong <drink>',
        voided_by_display_name: 'Manager & owner' },
    ], true));
    const salesRowsNoVoid = invoke('sales-rows-no-void', () => fn.posSalesRowsHtml([sale], false));
    state.recent = []; state.reportsLoading = true;
    const recentLoading = invoke('recent-loading', fn.posRecentHtml);
    state.reportsLoading = false;
    const recentEmpty = invoke('recent-empty', fn.posRecentHtml);
    state.recent = [sale];
    const recentRich = invoke('recent-rich', fn.posRecentHtml);

    state.shift = null;
    state.pending = { rpcArgs: { p_is_training: true } };
    const shiftPending = invoke('shift-pending', fn.posShiftBarHtml);
    state.pending = null;
    const shiftEmpty = invoke('shift-empty', fn.posShiftBarHtml);
    state.shift = { ...shift, is_training: true }; state.shiftStatus = { can_close_shift: true };
    const shiftRich = invoke('shift-rich', fn.posShiftBarHtml);
    state.cart = {};
    const shiftClosable = invoke('shift-closable', fn.posShiftBarHtml);
    state.cart = savedCart;
    state.shift = null; state.refreshing = true;
    const noShiftRefreshing = invoke('no-shift-refreshing', fn.posNoShiftGateHtml);
    state.refreshing = false; state.checkoutRefreshRequired = true;
    const noShiftRequired = invoke('no-shift-required', fn.posNoShiftGateHtml);
    state.checkoutRefreshRequired = false; state.shiftStatus = { can_open_live: true };
    const noShiftCanOpen = invoke('no-shift-can-open', fn.posNoShiftGateHtml);
    state.shiftStatus = {};
    const noShiftCannotOpen = invoke('no-shift-cannot-open', fn.posNoShiftGateHtml);

    state.catalog = [matcha, hojicha]; state.cart = savedCart;
    canManageMediaOverride = false;
    const workspace = invoke('workspace', fn.posWorkspaceHtml);
    canManageMediaOverride = true;
    const workspaceManage = invoke('workspace-manage', fn.posWorkspaceHtml);
    canManageMediaOverride = null;
    const mobile = invoke('mobile', fn.posMobileOrderBarHtml);
    state.cart = {};
    const mobileEmpty = invoke('mobile-empty', fn.posMobileOrderBarHtml);
    state.cart = savedCart; state.refreshing = false; state.shiftLoading = false;
    state.checkoutRefreshRequired = false; state.refreshError = ''; state.loaded = false;
    const syncChecking = invoke('sync-checking', fn.posSyncStatusHtml);
    state.refreshing = true;
    const syncRefreshing = invoke('sync-refreshing', fn.posSyncStatusHtml);
    state.refreshing = false; state.checkoutRefreshRequired = true;
    state.refreshError = 'Critical <offline>';
    const syncRequired = invoke('sync-required', fn.posSyncStatusHtml);
    state.checkoutRefreshRequired = false;
    const syncDelayed = invoke('sync-delayed', fn.posSyncStatusHtml);
    state.refreshError = ''; state.loaded = true;
    state.lastUpdatedAt = 0;
    const syncLoadedNoTime = invoke('sync-loaded-no-time', fn.posSyncStatusHtml);
    state.lastUpdatedAt = Date.parse('2026-10-02T12:00:00.000Z');
    const syncLoaded = invoke('sync-loaded', fn.posSyncStatusHtml);
    state.shift = null; state.pending = null; state.checkoutRefreshRequired = true;
    const criticalHidden = invoke('critical-hidden', fn.posCriticalRefreshNoticeHtml);
    state.shift = { shift_id: 'shift-1' };
    const criticalVisible = invoke('critical-visible', fn.posCriticalRefreshNoticeHtml);

    return {
      calls, paymentLabels, summaryLoading, summaryEmpty, summaryRich,
      receiptEmpty, receiptRich, receiptNoChange, productCurrent, productReview,
      productPlain,
      catalogLoading, catalogError, catalogRich, catalogFiltered, catalogEmpty,
      catalogEmptyNoManage,
      loadingCategory, errorCategory, normalizedCategory, cashSuggestions,
      cartEmpty, cartNoShift, cartCash, cartGcash, cartConfirming, cartChanged,
      cartPending,
      salesRows, salesRowsNoVoid, recentLoading, recentEmpty, recentRich,
      shiftPending, shiftEmpty, shiftRich, shiftClosable, noShiftRefreshing,
      noShiftRequired, noShiftCanOpen, noShiftCannotOpen, workspace,
      workspaceManage, mobile, mobileEmpty, syncChecking, syncRefreshing,
      syncRequired, syncDelayed, syncLoadedNoTime, syncLoaded,
      criticalHidden, criticalVisible, mutations, trace, nativeTrace,
      localStorageUnchanged: JSON.stringify(localBefore) === JSON.stringify(stored(localStorage)),
      sessionStorageUnchanged: JSON.stringify(sessionBefore) === JSON.stringify(stored(sessionStorage)),
    };
  } finally {
    app.posCheckout = originalCheckout;
    dependencies.forEach((name) => { app[name] = originals[name]; });
    app.Number = native.Number; app.String = native.String;
    app.Date = native.Date; app.Math = native.Math;
  }
}

function collectPosControllerFingerprint() {
  const app = window as typeof window & Record<string, any>;
  const api: Record<string, any> = app.MatchaLunaApp?.domains?.pos || app;
  const controllers = {
    update: api.updatePosPaymentPreview,
    manage: api.managePosMenu,
    focus: api.focusPosCart,
    preserve: api.renderPosPreservingInteraction,
  };
  const root = document.getElementById('posRoot')!;
  const originalHtml = root.innerHTML;
  const originals = {
    posCheckout: app.posCheckout, posOpsModal: app.posOpsModal,
    posCartTotalCentavos: app.posCartTotalCentavos,
    strictPesoCentavos: app.strictPesoCentavos, peso: app.peso,
    posCheckoutValidation: app.posCheckoutValidation,
    posCanManageOperations: app.posCanManageOperations,
    posCloseOpsModal: app.posCloseOpsModal, activateAppTab: app.activateAppTab,
    focusSoon: app.focusSoon, renderPos: app.renderPos,
    Array: app.Array, String: app.String,
  };
  const thrown = (action: () => unknown) => {
    try {
      return { returned: action(), error: null };
    } catch (error) {
      return {
        returned: null,
        error: {
          name: error instanceof Error ? error.name : typeof error,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
  try {
    root.innerHTML = '<div id="posCartPanel"><div class="pos-error">Visible error</div><div id="posChangeValue" class="old">Old</div><button data-act="reviewPosSale">Review</button></div>';
    app.posCheckout = {
      cashReceived: '20', error: 'State error stays', pending: null,
      submitting: false,
    };
    const updateTrace: string[] = [];
    app.posCartTotalCentavos = () => { updateTrace.push('total'); return 1_500; };
    app.strictPesoCentavos = (value: string) => { updateTrace.push(`cash:${value}`); return 2_000; };
    app.peso = (value: number) => { updateTrace.push(`peso:${value}`); return `P${value}`; };
    app.posCheckoutValidation = () => { updateTrace.push('validation'); return { valid: false }; };
    const getById = document.getElementById.bind(document);
    const query = document.querySelector.bind(document);
    document.getElementById = ((id: string) => {
      updateTrace.push(`get:${id}`); return getById(id);
    }) as typeof document.getElementById;
    document.querySelector = ((selector: string) => {
      updateTrace.push(`query:${selector}`); return query(selector);
    }) as typeof document.querySelector;
    const updateReturn = controllers.update();
    document.getElementById = getById;
    document.querySelector = query;
    const update = {
      returnType: typeof updateReturn,
      trace: updateTrace.slice(),
      changeClass: getById('posChangeValue')!.className,
      changeHtml: getById('posChangeValue')!.innerHTML,
      domError: query('#posCartPanel .pos-error')!.textContent,
      stateError: app.posCheckout.error,
      disabled: (query('#posCartPanel [data-act="reviewPosSale"]') as HTMLButtonElement).disabled,
    };
    (query('#posCartPanel .pos-error') as HTMLElement).textContent = 'Keep me';
    app.posCheckout.error = '';
    app.posCheckout.pending = { retry: true };
    controllers.update();
    const updateNoClear = {
      domError: query('#posCartPanel .pos-error')!.textContent,
      stateError: app.posCheckout.error,
      disabled: (query('#posCartPanel [data-act="reviewPosSale"]') as HTMLButtonElement).disabled,
    };

    const manageTrace: string[] = [];
    app.posOpsModal = { open: true };
    app.posCanManageOperations = () => { manageTrace.push('permission:false'); return false; };
    const manageDenied = controllers.manage();
    app.posCanManageOperations = () => { manageTrace.push('permission:true'); return true; };
    app.posCloseOpsModal = (restore: boolean) => manageTrace.push(`close:${restore}`);
    app.activateAppTab = (tab: string, focus: boolean) => {
      manageTrace.push(`activate:${tab}:${focus}`); return false;
    };
    const manageActivationFailure = controllers.manage();
    app.posOpsModal.open = false;
    app.activateAppTab = (tab: string, focus: boolean) => {
      manageTrace.push(`activate-success:${tab}:${focus}`); return true;
    };
    app.focusSoon = (selector: string) => manageTrace.push(`focus:${selector}`);
    const manageSuccess = controllers.manage();

    root.innerHTML = '';
    const focusAbsent = controllers.focus();
    root.innerHTML = '<aside id="posCartPanel"></aside>';
    const panel = document.getElementById('posCartPanel') as HTMLElement;
    const focusTrace: string[] = [];
    panel.scrollIntoView = (options?: boolean | ScrollIntoViewOptions) => {
      focusTrace.push(`scroll:${JSON.stringify(options)}`);
    };
    let focusCalls = 0;
    panel.focus = ((options?: FocusOptions) => {
      focusTrace.push(`focus:${JSON.stringify(options || null)}`);
      focusCalls += 1;
      if (focusCalls === 1) throw new Error('options unsupported');
    }) as typeof panel.focus;
    const focusFallback = controllers.focus();
    panel.focus = (() => { throw new RangeError('focus failed twice'); }) as typeof panel.focus;
    const focusFailure = thrown(controllers.focus);

    root.innerHTML = '<input id="preserveById" value="abcdef">';
    const oldById = root.firstElementChild as HTMLInputElement;
    oldById.focus(); oldById.setSelectionRange(2, 5);
    let idRenderCount = 0;
    app.renderPos = () => {
      idRenderCount += 1;
      root.innerHTML = '<input id="preserveById" value="abcdef">';
    };
    const preserveIdReturn = controllers.preserve();
    const nextById = root.firstElementChild as HTMLInputElement;
    const preserveById = {
      returnType: typeof preserveIdReturn, renderCount: idRenderCount,
      activeId: document.activeElement?.id,
      start: nextById.selectionStart, end: nextById.selectionEnd,
    };

    root.innerHTML = '<button data-act="setPosPayment" data-id="same" data-method="gcash" data-centavos="200" data-mode="live">Old</button>';
    (root.firstElementChild as HTMLElement).focus();
    const nativeTrace: string[] = [];
    app.Array = new Proxy(originals.Array, {
      get(target, property, receiver) {
        if (property === 'prototype') nativeTrace.push('Array.prototype');
        return Reflect.get(target, property, receiver);
      },
    });
    app.String = new Proxy(originals.String, {
      apply(target, thisArg, args) {
        nativeTrace.push('String'); return Reflect.apply(target, thisArg, args);
      },
    });
    let selectorRenderCount = 0;
    app.renderPos = () => {
      selectorRenderCount += 1;
      root.innerHTML = '<button data-act="ignore" data-id="same" data-method="gcash" data-centavos="200" data-mode="live">Wrong</button><button data-act="setPosPayment" data-id="same" data-method="gcash" data-centavos="200" data-mode="live">Right</button>';
    };
    controllers.preserve();
    const active = document.activeElement as HTMLElement;
    const preserveBySelector = {
      renderCount: selectorRenderCount, text: active?.textContent,
      act: active?.dataset?.act, id: active?.dataset?.id,
      method: active?.dataset?.method, centavos: active?.dataset?.centavos,
      mode: active?.dataset?.mode, nativeTrace,
    };
    app.Array = originals.Array; app.String = originals.String;

    root.innerHTML = '<input id="focusFallback" value="abcdef">';
    const oldFallback = root.firstElementChild as HTMLInputElement;
    oldFallback.focus(); oldFallback.setSelectionRange(1, 4);
    const preserveTrace: string[] = [];
    app.renderPos = () => {
      root.innerHTML = '<input id="focusFallback" value="abcdef">';
      const next = root.firstElementChild as HTMLInputElement;
      let calls = 0;
      next.focus = ((options?: FocusOptions) => {
        preserveTrace.push(`focus:${JSON.stringify(options || null)}`);
        calls += 1; if (calls === 1) throw new Error('preventScroll unsupported');
      }) as typeof next.focus;
      const setRange = next.setSelectionRange.bind(next);
      next.setSelectionRange = ((start: number, end: number | null) => {
        preserveTrace.push(`selection:${start}:${end}`); setRange(start, end);
      }) as typeof next.setSelectionRange;
    };
    controllers.preserve();

    root.innerHTML = '<button data-act="focusPosCart">Old</button>';
    (root.firstElementChild as HTMLElement).focus();
    app.renderPos = () => {
      root.innerHTML = '<button data-act="focusPosCart" disabled>Disabled</button>';
    };
    controllers.preserve();
    const disabledRestore = {
      activeInsideRoot: root.contains(document.activeElement),
      disabled: (root.firstElementChild as HTMLButtonElement).disabled,
    };
    return {
      update, updateNoClear, manageDenied, manageActivationFailure,
      manageSuccess, manageTrace,
      focusAbsent, focusFallback, focusTrace, focusFailure, preserveById,
      preserveBySelector, preserveTrace, disabledRestore,
    };
  } finally {
    root.innerHTML = originalHtml;
    Object.assign(app, originals);
  }
}

test('typed POS view keeps the exact boundary, registration slot, runtime, and fallback', async ({
  page,
  context,
}) => {
  await stubSupabase(page);
  await page.route(/\/assets\/js\/render-modals\.js(?:\?|$)/, async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const probe = `\nwindow.__posViewBoundary={hasPos:Object.prototype.hasOwnProperty.call(window.MatchaLunaApp.domains,'pos'),root:${JSON.stringify(posViewNames)}.map(function(name){return typeof window[name];}),scripts:Array.from(document.querySelectorAll('script[data-matcha-luna-runtime]')).map(function(script){return script.dataset.matchaLunaRuntime;})};\n`;
    await route.fulfill({ response, body: source + probe });
  });
  await page.goto('index.html?test=1', { waitUntil: 'load' });
  await page.evaluate(() =>
    (window as typeof window & { MatchaLunaApp: { ready: Promise<void> } })
      .MatchaLunaApp.ready,
  );
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');

  const contract = await page.evaluate((names) => {
    const root = window as typeof window & Record<string, any>;
    const facade = root.MatchaLunaApp;
    const pos = facade.domains.pos as Record<string, any>;
    const originals = Object.fromEntries(names.map((name) => [name, pos[name]]));
    const descriptor = (owner: Record<string, any>, name: string) => {
      const value = Object.getOwnPropertyDescriptor(owner, name)!;
      return {
        configurable: value.configurable, enumerable: value.enumerable,
        writable: value.writable, hasGetter: typeof value.get === 'function',
        hasSetter: typeof value.set === 'function',
      };
    };
    const roundTrips = names.map((name, index) => {
      const domainValue = function domainReplacement() { return index; };
      pos[name] = domainValue;
      const domainReachedRoot = root[name] === domainValue;
      const rootValue = function rootReplacement() { return index + 100; };
      root[name] = rootValue;
      const rootReachedDomain = pos[name] === rootValue;
      pos[name] = originals[name];
      return { domainReachedRoot, rootReachedDomain };
    });
    return {
      version: facade.contractVersion,
      contractLength: facade.contractNames.length,
      domainOrder: Object.keys(facade.domains),
      domainSizes: Object.fromEntries(
        Object.entries(facade.domains).map(([name, domain]) => [
          name, Object.keys(domain as Record<string, unknown>).length,
        ]),
      ),
      posOrder: Object.keys(pos),
      protectedNames: names.filter((name) => facade.contractNames.includes(name)),
      rootMatches: names.map((name) => root[name] === pos[name]),
      namespaceDescriptors: names.map((name) => descriptor(pos, name)),
      rootDescriptors: names.map((name) => descriptor(root, name)),
      roundTrips,
      activeRuntime: Array.from(
        document.querySelectorAll<HTMLScriptElement>('script[data-matcha-luna-runtime]'),
        (script) => script.dataset.matchaLunaRuntime,
      ),
      boundary: root.__posViewBoundary,
      stocksTail: Object.keys(facade.domains.stocks).slice(-27),
    };
  }, [...posViewNames]);

  const classicPage = await openClassic(context);
  const classicRuntime = await classicPage.evaluate(() => ({
    modules: document.querySelectorAll('script[type="module"]').length,
    scripts: Array.from(
      document.querySelectorAll<HTMLScriptElement>('script[src*="/assets/js/"]'),
      (script) => new URL(script.src).pathname.split('/').pop(),
    ),
    hasPosDomain: Boolean(
      (window as typeof window & Record<string, any>).MatchaLunaApp?.domains?.pos,
    ),
  }));
  await classicPage.close();

  const fallback = await page.request.get(
    'http://127.0.0.1:4173/Scoopies/assets/js/render-pos.js',
  );
  const fallbackText = await fallback.text();
  const classicSource = readFileSync(resolve(process.cwd(), 'assets/js/render-pos.js'), 'utf8');
  const canonicalFallback = fallbackText.replace(/\r\n?/g, '\n');
  const canonicalClassic = classicSource.replace(/\r\n?/g, '\n');
  const bytes = Buffer.from(canonicalFallback, 'utf8');
  const sha256 = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  const gitBlob = createHash('sha1')
    .update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');
  const mainSource = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8');
  const ready = mainSource.indexOf('const ready');
  const modalSlot = mainSource.indexOf(
    'loadClassicScripts(AFTER_COSTING_VIEW_BEFORE_STOCKS_VIEW)', ready,
  );
  const posSlot = mainSource.indexOf('registerPosViewModule(facade, window)', ready);
  const stocksSlot = mainSource.indexOf('registerStocksViewModule(facade, window)', ready);

  expect(contract).toMatchObject({
    version: 1,
    contractLength: 175,
    domainOrder: ['core', 'runtime', 'costing', 'stocks', 'publication', 'pos', 'support', 'events', 'legacy'],
    domainSizes: { core: 15, runtime: 4, costing: 37, stocks: 63, publication: 10, pos: 19, support: 3, events: 1 },
    posOrder: posViewNames,
    protectedNames: [],
    activeRuntime: activeRuntimeFiles,
  });
  expect(contract.rootMatches).toEqual(posViewNames.map(() => true));
  expect(contract.namespaceDescriptors).toEqual(posViewNames.map(() => ({
    configurable: true, enumerable: true, writable: true,
    hasGetter: false, hasSetter: false,
  })));
  expect(contract.rootDescriptors).toEqual(posViewNames.map(() => ({
    configurable: true, enumerable: true, hasGetter: true, hasSetter: true,
  })));
  expect(contract.roundTrips).toEqual(posViewNames.map(() => ({
    domainReachedRoot: true, rootReachedDomain: true,
  })));
  expect(contract.boundary).toEqual({
    hasPos: false,
    root: posViewNames.map(() => 'undefined'),
    scripts: ['state.js', 'pos-catalog.js', 'workspace-sync.js', 'pos-operations.js', 'render-modals.js'],
  });
  expect(contract.stocksTail).toContain('renderPos');
  expect(contract.stocksTail).toContain('renderAll');
  expect(classicRuntime).toEqual({
    modules: 0, scripts: transitionRuntimeFiles, hasPosDomain: false,
  });
  expect(fallback.status()).toBe(200);
  expect(canonicalFallback).toBe(canonicalClassic);
  expect(gitBlob).toBe('4b40f2e9d57d1f5b11debe8bab95883d30e5df3c');
  expect(sha256).toBe('AF0676AD15E53099F1F9B526FE9340A63C9A88671191E793AA56CE4EA34FDE12');
  expect(modalSlot).toBeGreaterThan(ready);
  expect(posSlot).toBeGreaterThan(modalSlot);
  expect(stocksSlot).toBeGreaterThan(posSlot);
});

test('typed POS render helpers exactly match classic HTML, values, state, storage, and call-time bindings', async ({
  page,
  context,
}) => {
  await openPrimary(page);
  const typed = await page.evaluate(collectPosRendererFingerprint);
  const classicPage = await openClassic(context);
  const classic = await classicPage.evaluate(collectPosRendererFingerprint);
  await classicPage.close();

  expect(typed).toEqual(classic);
  expect(typed.mutations).toEqual([]);
  expect(typed.localStorageUnchanged).toBe(true);
  expect(typed.sessionStorageUnchanged).toBe(true);
  expect(typed.loadingCategory).toBe('missing');
  expect(typed.errorCategory).toBe('missing');
  expect(typed.normalizedCategory).toBe('all');
  expect(typed.paymentLabels).toEqual(['Cash', 'GCash', 'GoTyme', 'Cash']);
  expect(typed.cashSuggestions).toEqual([
    [],
    [12_345, 15_000, 20_000, 50_000],
    [100_000],
  ]);
  expect(typed.receiptEmpty).toBe('');
  expect(typed.receiptRich).toContain('Order recorded');
  expect(typed.productCurrent).toContain('selected');
  expect(typed.productReview).toContain('Review');
  expect(typed.productPlain).not.toContain('selected');
  expect(typed.productPlain).not.toContain('Review');
  expect(typed.catalogLoading).toContain('pos-loading');
  expect(typed.catalogError).toContain('Menu unavailable.');
  expect(typed.catalogRich).toContain('pos-category-bar');
  expect(typed.catalogFiltered).toContain('Sea Salt Hojicha');
  expect(typed.catalogEmpty).toContain('No drinks are on the POS yet.');
  expect(typed.catalogEmpty).toContain('Add drinks to POS');
  expect(typed.catalogEmptyNoManage).toContain('Ask an owner or manager');
  expect(typed.cartEmpty).toContain('Tap a drink card');
  expect(typed.cartNoShift).toContain('Start selling');
  expect(typed.cartGcash).toContain('GCash reference');
  expect(typed.cartConfirming).toContain('Confirm order');
  expect(typed.cartChanged).toContain('Menu changed.');
  expect(typed.cartChanged).toContain('Updated menu price');
  expect(typed.cartPending).toContain('retry');
  expect(typed.salesRows).toContain('pos-void-label');
  expect(typed.salesRowsNoVoid).not.toContain('openPosVoid');
  expect(typed.recentLoading).toContain('pos-loading');
  expect(typed.recentEmpty).toContain('No completed sales yet.');
  expect(typed.shiftPending).toContain('Exact sale retry required');
  expect(typed.shiftEmpty).toBe('');
  expect(typed.shiftRich).toContain('disabled');
  expect(typed.shiftClosable).not.toContain('data-act="openPosClose" disabled');
  expect(typed.noShiftRequired).toContain('Refresh required');
  expect(typed.workspace).toContain('id="posCartPanel"');
  expect(typed.workspaceManage).toContain('Manage drink photos');
  expect(typed.mobile).toContain('focusPosCart');
  expect(typed.mobileEmpty).toBe('');
  expect(typed.syncRequired).toContain('Could not refresh');
  expect(typed.criticalHidden).toBe('');
  expect(typed.criticalVisible).toContain('Current order preserved.');
  for (const dependency of [
    'escapeHtml', 'peso', 'posModeName', 'posProductCartLines',
    'posProductCartQuantity', 'posDrinkImageHtml', 'normalizePosCategory',
    'posDrinkGroupKey', 'posCanManageOperations', 'posCartLines',
    'posCartTotalCentavos', 'posCartUnits', 'strictPesoCentavos',
    'posCheckoutValidation', 'posVariantKey', 'posModeFromPending',
    'posCanManageMedia',
  ]) {
    expect(typed.trace).toContain(`call:${dependency}`);
  }
  expect(typed.trace).toContain('set:posCheckout.category');
  expect(typed.nativeTrace).toEqual(expect.arrayContaining([
    'Number', 'String', 'Date:construct', 'Math.ceil', 'Math.max',
  ]));
});

test('typed POS controllers match classic DOM and focus behavior while downstream consumers stay live', async ({
  page,
  context,
}) => {
  await openPrimary(page);
  const typed = await page.evaluate(collectPosControllerFingerprint);
  const classicPage = await openClassic(context);
  const classic = await classicPage.evaluate(collectPosControllerFingerprint);
  await classicPage.close();

  expect(typed).toEqual(classic);
  expect(typed.update).toEqual({
    returnType: 'undefined',
    trace: [
      'total', 'cash:20', 'get:posChangeValue', 'peso:5',
      'query:#posCartPanel .pos-error',
      'query:#posCartPanel [data-act="reviewPosSale"]', 'validation',
    ],
    changeClass: 'pos-change',
    changeHtml: '<strong>Change: P5</strong>',
    domError: '', stateError: 'State error stays', disabled: true,
  });
  expect(typed.updateNoClear).toEqual({
    domError: 'Keep me', stateError: '', disabled: false,
  });
  expect(typed.manageDenied).toBe(false);
  expect(typed.manageActivationFailure).toBe(false);
  expect(typed.manageSuccess).toBe(true);
  expect(typed.manageTrace).toEqual([
    'permission:false', 'permission:true', 'close:true',
    'activate:products:false', 'permission:true',
    'activate-success:products:false',
    'focus:#products [data-act="openPublishModal"]',
  ]);
  expect(typed.focusAbsent).toBe(false);
  expect(typed.focusFallback).toBe(true);
  expect(typed.focusTrace.slice(0, 3)).toEqual([
    'scroll:{"behavior":"smooth","block":"start"}',
    'focus:{"preventScroll":true}', 'focus:null',
  ]);
  expect(typed.focusFailure.error).toEqual({
    name: 'RangeError', message: 'focus failed twice',
  });
  expect(typed.preserveById).toEqual({
    returnType: 'undefined', renderCount: 1, activeId: 'preserveById',
    start: 2, end: 5,
  });
  expect(typed.preserveBySelector).toMatchObject({
    renderCount: 1, text: 'Right', act: 'setPosPayment', id: 'same',
    method: 'gcash', centavos: '200', mode: 'live',
  });
  expect(typed.preserveBySelector.nativeTrace).toEqual(
    expect.arrayContaining(['Array.prototype', 'String']),
  );
  expect(typed.preserveTrace).toEqual([
    'focus:{"preventScroll":true}', 'focus:null', 'selection:1:4',
  ]);
  expect(typed.disabledRestore).toEqual({ activeInsideRoot: false, disabled: true });

  const integration = await page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const pos = app.MatchaLunaApp.domains.pos as Record<string, any>;
    const stocks = app.MatchaLunaApp.domains.stocks as Record<string, any>;
    const root = document.getElementById('posRoot')!;
    const posRendererNames = [
      'posSyncStatusHtml', 'posCriticalRefreshNoticeHtml',
      'posNoShiftGateHtml', 'posSummaryHtml', 'posReceiptHtml',
      'posWorkspaceHtml', 'posMobileOrderBarHtml', 'posRecentHtml',
    ];
    const saved = {
      session: app.session, posContext: app.posContext,
      posCheckout: app.posCheckout, posOpsModal: app.posOpsModal,
      posSalesHistory: app.posSalesHistory, cloud: app.cloud,
      renderPos: stocks.renderPos,
      updatePosPaymentPreview: pos.updatePosPaymentPreview,
      managePosMenu: pos.managePosMenu, focusPosCart: pos.focusPosCart,
      renderPosPreservingInteraction: pos.renderPosPreservingInteraction,
      posPaymentLabel: pos.posPaymentLabel,
      posSalesRowsHtml: pos.posSalesRowsHtml,
      ...Object.fromEntries(posRendererNames.map((name) => [name, pos[name]])),
    };
    const renderTrace: string[] = [];
    const eventTrace: string[] = [];
    const syncTrace: string[] = [];
    try {
      app.session = { user: { id: 'integration-user' } };
      app.posContext = {
        loaded: true, loading: false, businessId: 'integration-business',
        businessName: 'Matcha Luna', role: 'owner',
      };
      app.posCheckout = app.freshPosCheckout();
      app.posCheckout.loaded = true;
      app.posCheckout.shiftStatus = { can_open_live: true };
      posRendererNames.forEach((name) => {
        pos[name] = () => {
          renderTrace.push(name);
          return `<i data-marker="${name}"></i>`;
        };
      });
      saved.renderPos();
      const stocksConsumer = {
        trace: renderTrace.slice(),
        markers: Array.from(root.querySelectorAll('[data-marker]'), (node) =>
          node.getAttribute('data-marker')),
      };

      pos.updatePosPaymentPreview = () => eventTrace.push('payment-preview');
      pos.managePosMenu = () => eventTrace.push('manage-menu');
      pos.focusPosCart = () => eventTrace.push('focus-cart');
      app.posOpsModal = app.freshPosOpsModal();
      root.innerHTML = '<input id="posCashReceived"><button data-act="managePosMenu">Manage</button><button data-act="focusPosCart">Focus</button>';
      const cash = document.getElementById('posCashReceived') as HTMLInputElement;
      cash.value = '123.45';
      cash.dispatchEvent(new Event('input', { bubbles: true }));
      (root.querySelector('[data-act="managePosMenu"]') as HTMLButtonElement).click();
      (root.querySelector('[data-act="focusPosCart"]') as HTMLButtonElement).click();
      const eventsConsumer = {
        trace: eventTrace.slice(), cashReceived: app.posCheckout.cashReceived,
        error: app.posCheckout.error,
      };

      pos.renderPosPreservingInteraction = () => syncTrace.push('render-preserving');
      app.cloud = {
        ...(app.cloud || {}),
        client: {
          rpc(name: string) {
            if (name === 'pos_get_shift_status') {
              return Promise.resolve({ data: [{
                has_open_shift: false, shift_id: null, can_open_live: true,
                can_open_training: true,
              }], error: null });
            }
            return Promise.resolve({ data: [], error: null });
          },
        },
      };
      app.posCheckout.loaded = true;
      app.posCheckout.catalog = [];
      await app.loadPosCheckoutData({ background: true });
      const workspaceSyncConsumer = syncTrace.slice();

      pos.posPaymentLabel = (method: string) => `LIVE-${method}`;
      app.posOpsModal = app.freshPosOpsModal();
      app.posOpsModal.open = true; app.posOpsModal.type = 'voidSale';
      app.posOpsModal.sale = {
        receipt_number: 'SCP-LIVE', item_summary: 'Drink',
        gross_total_centavos: 18_000, payment_method: 'gcash',
      };
      app.renderPosOpsModal();
      const paymentConsumer = document.getElementById('posOpsModalContent')!
        .innerHTML.includes('LIVE-gcash');

      pos.posSalesRowsHtml = () => '<b data-live-sales-rows>LIVE ROWS</b>';
      app.posOpsModal = app.freshPosOpsModal();
      app.posOpsModal.open = true; app.posOpsModal.type = 'salesHistory';
      app.posSalesHistory = app.freshPosSalesHistory();
      app.posSalesHistory.loaded = true;
      app.posSalesHistory.rows = [{ sale_id: 'live-row' }];
      app.renderPosOpsModal();
      const salesRowsConsumer = Boolean(
        document.querySelector('#posOpsModalContent [data-live-sales-rows]'),
      );
      return {
        stocksConsumer, eventsConsumer, workspaceSyncConsumer,
        paymentConsumer, salesRowsConsumer,
        rootDomainMatches: [
          app.updatePosPaymentPreview === pos.updatePosPaymentPreview,
          app.managePosMenu === pos.managePosMenu,
          app.focusPosCart === pos.focusPosCart,
          app.renderPosPreservingInteraction === pos.renderPosPreservingInteraction,
          app.posPaymentLabel === pos.posPaymentLabel,
          app.posSalesRowsHtml === pos.posSalesRowsHtml,
        ],
      };
    } finally {
      app.session = saved.session; app.posContext = saved.posContext;
      app.posCheckout = saved.posCheckout; app.posOpsModal = saved.posOpsModal;
      app.posSalesHistory = saved.posSalesHistory; app.cloud = saved.cloud;
      stocks.renderPos = saved.renderPos;
      pos.updatePosPaymentPreview = saved.updatePosPaymentPreview;
      pos.managePosMenu = saved.managePosMenu; pos.focusPosCart = saved.focusPosCart;
      pos.renderPosPreservingInteraction = saved.renderPosPreservingInteraction;
      pos.posPaymentLabel = saved.posPaymentLabel;
      pos.posSalesRowsHtml = saved.posSalesRowsHtml;
      posRendererNames.forEach((name) => { pos[name] = (saved as Record<string, any>)[name]; });
    }
  });

  expect(integration.stocksConsumer.trace).toEqual([
    'posSyncStatusHtml', 'posSummaryHtml', 'posRecentHtml',
    'posNoShiftGateHtml', 'posCriticalRefreshNoticeHtml', 'posReceiptHtml',
    'posWorkspaceHtml', 'posMobileOrderBarHtml',
  ]);
  expect(integration.stocksConsumer.markers).toEqual([
    'posSyncStatusHtml', 'posCriticalRefreshNoticeHtml',
    'posNoShiftGateHtml', 'posReceiptHtml', 'posSummaryHtml',
    'posWorkspaceHtml', 'posMobileOrderBarHtml', 'posRecentHtml',
  ]);
  expect(integration.eventsConsumer).toEqual({
    trace: ['payment-preview', 'manage-menu', 'focus-cart'],
    cashReceived: '123.45', error: '',
  });
  expect(integration.workspaceSyncConsumer).toEqual([
    'render-preserving', 'render-preserving',
  ]);
  expect(integration.paymentConsumer).toBe(true);
  expect(integration.salesRowsConsumer).toBe(true);
  expect(integration.rootDomainMatches).toEqual([true, true, true, true, true, true]);
});
