import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

const stocksViewNames = [
  'stockNumber',
  'stockFormatNumber',
  'stockFormatQuantity',
  'stockSourceForItem',
  'stockStatus',
  'stockFilteredItems',
  'stockSummaryHtml',
  'stockFilterBarHtml',
  'stockItemCardsHtml',
  'stockTransactionLabel',
  'stockHistoryHtml',
  'renderStockResults',
  'renderStocks',
  'stockItemById',
  'stockAllowedActions',
  'stockUnitChoices',
  'stockInputToBase',
  'stockValidateModal',
  'openStockModal',
  'closeStockModal',
  'setStockModalAction',
  'stockPreviewHtml',
  'renderStockModal',
  'updateStockModalPreview',
  'submitStockModal',
  'renderPos',
  'renderAll',
];

function classicStocksViewHashes() {
  const normalizedSource = readFileSync(
    resolve(process.cwd(), 'assets/js/render-stocks.js'),
    'utf8',
  ).replace(/\r\n/g, '\n');
  const bytes = Buffer.from(normalizedSource, 'utf8');
  return {
    blob: createHash('sha1')
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest('hex'),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function withoutAriaPressed(html: string) {
  return html.replace(/ aria-pressed="(?:true|false)"/g, '');
}

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
      window as typeof window & {
        MatchaLunaApp: { ready: Promise<void> };
      }
    ).MatchaLunaApp.ready,
  );
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
}

async function openClassicPage(page: Page) {
  const builtHtml = readFileSync(
    resolve(process.cwd(), 'dist/index.html'),
    'utf8',
  );
  const classicScripts = transitionRuntimeFiles
    .map(
      (fileName) =>
        `<script src="/Scoopies/assets/js/${fileName}"></script>`,
    )
    .join('\n');
  const transitionHtml = builtHtml
    .replace(/\s*<script type="module"[^>]*><\/script>/, '')
    .replace('</body>', `${classicScripts}\n</body>`);

  await stubSupabase(page);
  await page.route(
    '**/index.html?test=1&stocks-view-transition=1',
    async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: transitionHtml,
      });
    },
  );
  await page.goto('index.html?test=1&stocks-view-transition=1', {
    waitUntil: 'load',
  });
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
}

async function collectStocksViewFingerprint() {
  const app = window as typeof window & Record<string, any>;
  const api: any = app.MatchaLunaApp?.domains?.stocks || app;
  const invoked: string[] = [];
  const invoke = async (name: string, ...args: any[]) => {
    invoked.push(name);
    return api[name](...args);
  };
  const focuses: string[] = [];
  const modalClasses: boolean[] = [];
  const renderAllOrder: string[] = [];
  const originalRenderPos = api.renderPos;
  const originalRenderStocks = api.renderStocks;

  const clearPendingStorage = () => {
    const prefixes = [
      app.STOCK_PENDING_KEY + '|',
      app.STOCK_SOURCE_DELETE_KEY + '|',
    ];
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
        keys.push(key);
      }
    }
    keys.forEach((key) => localStorage.removeItem(key));
  };
  clearPendingStorage();

  const ingredients = [
    {
      id: 'milk-source',
      name: 'Oat <Milk>',
      kind: 'purchased',
      unit: 'l',
    },
    {
      id: 'powder-source',
      name: 'Matcha',
      kind: 'purchased',
      unit: 'g',
    },
  ];
  const items = [
    {
      id: 'out',
      sourceId: 'missing-source',
      name: 'A removed <source>',
      kind: 'mixture',
      baseUnit: 'ml',
      balance: 0,
      threshold: 100,
      revision: 2,
      initialized: true,
      active: true,
      lastMovementAt: '2026-10-02T03:00:00.000Z',
      lastMovementType: 'waste',
      categoryName: 'Cream & foam',
    },
    {
      id: 'low',
      sourceId: 'milk-source',
      name: 'Oat <Milk>',
      kind: 'purchased',
      baseUnit: 'ml',
      balance: 400,
      threshold: 500,
      revision: 3,
      initialized: true,
      active: true,
      lastMovementAt: '2026-10-02T04:00:00.000Z',
      lastMovementType: 'stock_in',
      categoryName: 'Milk and cream',
    },
    {
      id: 'uncounted',
      sourceId: 'powder-source',
      name: 'Matcha',
      kind: 'purchased',
      baseUnit: 'g',
      balance: 0,
      threshold: null,
      revision: 0,
      initialized: false,
      active: true,
      lastMovementAt: null,
      lastMovementType: '',
      categoryName: 'Tea powder',
    },
    {
      id: 'good',
      sourceId: 'milk-source',
      name: 'Zeta milk',
      kind: 'purchased',
      baseUnit: 'ml',
      balance: 1500,
      threshold: 500,
      revision: 7,
      initialized: true,
      active: true,
      lastMovementAt: '2026-10-02T05:00:00.000Z',
      lastMovementType: 'stock_count',
      categoryName: 'Milk and cream',
    },
    {
      id: 'inactive',
      sourceId: 'milk-source',
      name: 'Hidden stock',
      kind: 'purchased',
      baseUnit: 'ml',
      balance: 500,
      threshold: 100,
      revision: 1,
      initialized: true,
      active: false,
      lastMovementAt: null,
      lastMovementType: '',
      categoryName: 'Archived',
    },
  ];
  const transactions = [
    {
      transactionId: 't1',
      itemId: 'low',
      itemName: 'Oat <Milk>',
      type: 'stock_in',
      delta: 250,
      before: 150,
      after: 400,
      unit: 'ml',
      reason: '',
      note: 'Delivery <verified>',
      actor: 'Owner & Partner',
      occurredAt: '2026-10-02T04:00:00.000Z',
      itemSequence: 2,
      revisionBefore: 2,
      revisionAfter: 3,
    },
    {
      transactionId: 't2',
      itemId: 'out',
      itemName: 'A removed <source>',
      type: 'stock_count',
      delta: 0,
      before: 0,
      after: 0,
      unit: 'ml',
      reason: 'Count',
      note: '',
      actor: 'Owner',
      occurredAt: '2026-10-02T03:00:00.000Z',
      itemSequence: 1,
      revisionBefore: 1,
      revisionAfter: 2,
    },
  ];

  app.state = { ingredients };
  app.session = { user: { id: 'view-user' } };
  app.posContext = {
    loaded: true,
    loading: false,
    businessId: 'view-business',
    businessName: 'Matcha Luna',
    role: 'owner',
    error: '',
  };
  app.stockState = {
    items,
    transactions,
    loaded: true,
    loading: false,
    refreshing: false,
    error: '',
    notice: 'Inventory notice <safe>',
    sourceConflict: '',
    search: '',
    status: 'all',
    kind: 'all',
    lastUpdatedAt: Date.parse('2026-10-02T05:30:00.000Z'),
  };
  app.stockModal = app.freshStockModal();
  app.stockModalReturnFocus = null;
  app.stockMutationGeneration = 10;
  app.stockCanManage = () => true;
  app.refreshModalBodyClass = () => {
    modalClasses.push(!document.getElementById('stockModal')!.hidden);
  };
  app.focusSoon = (selector: string) => focuses.push(selector);
  app.posRoleLabel = () => 'Owner';
  app.cloud = { client: null, connected: true };
  app.TEST_MODE = true;

  const number = await invoke('stockNumber', 'not-a-number');
  const numberEdges = [api.stockNumber('12.5'), api.stockNumber(Infinity)];
  const formattedNumber = await invoke('stockFormatNumber', 1234.5678);
  const formattedQuantity = await invoke(
    'stockFormatQuantity',
    1500,
    'ml',
    true,
  );
  const quantityEdges = [
    api.stockFormatQuantity(-1000, 'g', true),
    api.stockFormatQuantity(1, 'piece', false),
    api.stockFormatQuantity(2, 'piece', false),
  ];
  const source = await invoke('stockSourceForItem', items[1]);
  const status = await invoke('stockStatus', items[1]);
  const statuses = items.slice(0, 4).map((item) => api.stockStatus(item));
  const filtered = await invoke('stockFilteredItems');
  app.stockState.status = 'low';
  const lowIds = api.stockFilteredItems().map((item: any) => item.id);
  app.stockState.status = 'all';
  app.stockState.kind = 'mixture';
  const mixtureIds = api.stockFilteredItems().map((item: any) => item.id);
  app.stockState.kind = 'all';
  app.stockState.search = 'milk and cream';
  const searchIds = api.stockFilteredItems().map((item: any) => item.id);
  app.stockState.search = '';
  const summaryHtml = await invoke('stockSummaryHtml');
  const filterBarHtml = await invoke('stockFilterBarHtml');
  const cardsHtml = await invoke('stockItemCardsHtml');
  const transactionLabel = await invoke('stockTransactionLabel', 'stock_count', {
    itemSequence: 1,
  });
  const transactionLabels = [
    api.stockTransactionLabel('stock_in', {}),
    api.stockTransactionLabel('waste', {}),
    api.stockTransactionLabel('correction', {}),
    api.stockTransactionLabel('stock_count', { itemSequence: 2 }),
    api.stockTransactionLabel('other', {}),
  ];
  const historyHtml = await invoke('stockHistoryHtml');

  api.renderStocks();
  app.stockState.search = 'zeta';
  await invoke('renderStockResults');
  const resultsSnapshot = {
    count: document.getElementById('stockVisibleCount')?.textContent || '',
    text: document.getElementById('stockResults')?.textContent || '',
    itemIds: Array.from(
      document.querySelectorAll<HTMLElement>(
        '#stockResults [data-stock-item]',
      ),
      (item) => item.dataset.stockItem || '',
    ),
    activeStatuses: Array.from(
      document.querySelectorAll('#stocks [data-act="setStockStatus"].active'),
    ).map((button: any) => button.dataset.status),
  };
  app.stockState.search = '';

  const renderBranches: string[] = [];
  const originalSession = app.session;
  const originalContext = app.posContext;
  const originalItems = app.stockState.items;
  app.session = null;
  api.renderStocks();
  renderBranches.push(document.getElementById('stockRoot')!.innerHTML);
  app.session = originalSession;
  app.posContext = { loaded: false, loading: true, businessId: '', error: '' };
  api.renderStocks();
  renderBranches.push(document.getElementById('stockRoot')!.innerHTML);
  app.posContext = {
    loaded: true,
    loading: false,
    businessId: '',
    error: 'Workspace <offline>',
  };
  api.renderStocks();
  renderBranches.push(document.getElementById('stockRoot')!.innerHTML);
  app.posContext = originalContext;
  app.stockState.loading = true;
  app.stockState.items = [];
  api.renderStocks();
  renderBranches.push(document.getElementById('stockRoot')!.innerHTML);
  app.stockState.loading = false;
  app.stockState.error = 'Inventory <offline>';
  api.renderStocks();
  renderBranches.push(document.getElementById('stockRoot')!.innerHTML);
  app.stockState.error = '';
  app.stockState.items = originalItems;
  await invoke('renderStocks');
  const renderedStocksHtml = document.getElementById('stockRoot')!.innerHTML;

  const itemById = await invoke('stockItemById', 'low');
  const actions = await invoke('stockAllowedActions', itemById);
  const actionEdges = [
    api.stockAllowedActions(items[2]),
    api.stockAllowedActions(items[0]),
    api.stockAllowedActions(null),
  ];
  const units = await invoke('stockUnitChoices', itemById);
  const unitEdges = [
    api.stockUnitChoices(items[2]),
    api.stockUnitChoices({ baseUnit: 'piece' }),
    api.stockUnitChoices(null),
  ];
  const inputBase = await invoke('stockInputToBase', 1.5, 'l', itemById);
  const inputEdges = [
    api.stockInputToBase(2, 'kg', items[2]),
    Number.isNaN(api.stockInputToBase(2, 'g', itemById)),
  ];
  app.stockModal = app.freshStockModal();
  app.stockModal.open = true;
  app.stockModal.itemId = 'low';
  app.stockModal.action = 'waste';
  app.stockModal.quantity = '25';
  app.stockModal.unit = 'ml';
  app.stockModal.reason = 'spill';
  app.stockModal.note = 'test';
  const validation = await invoke('stockValidateModal');
  const validationSnapshot = {
    valid: validation.valid,
    delta: validation.delta,
    before: validation.before,
    after: validation.after,
    reason: validation.reason,
    note: validation.note,
  };
  app.stockModal.action = 'threshold';
  app.stockModal.quantity = '';
  const thresholdDisabled = api.stockValidateModal();

  let returnFocus = document.getElementById('stockViewReturnFocus');
  if (!returnFocus) {
    returnFocus = document.createElement('button');
    returnFocus.id = 'stockViewReturnFocus';
    document.body.appendChild(returnFocus);
  }
  returnFocus.focus();
  const opened = await invoke('openStockModal', 'low');
  const openedSnapshot = {
    open: app.stockModal.open,
    itemId: app.stockModal.itemId,
    action: app.stockModal.action,
    unit: app.stockModal.unit,
    hidden: document.getElementById('stockModal')!.hidden,
  };
  const actionChanged = await invoke('setStockModalAction', 'waste');
  app.stockModal.quantity = '10';
  app.stockModal.reason = 'spill';
  const currentValidation = api.stockValidateModal();
  const previewHtml = await invoke(
    'stockPreviewHtml',
    currentValidation,
    itemById,
  );
  await invoke('renderStockModal');
  const modalHtml = document.getElementById('stockModalContent')!.innerHTML;
  app.stockModal.quantity = '15';
  app.stockModal.error = 'old error';
  await invoke('updateStockModalPreview');
  const previewUpdate = {
    after: document.getElementById('stockPreviewAfter')?.textContent || '',
    error: document.getElementById('stockModalError')?.textContent || '',
    modalError: app.stockModal.error,
  };
  const closed = await invoke('closeStockModal', false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const focusAfterClose = document.activeElement?.id || '';
  const submitClosed = await invoke('submitStockModal');

  app.session = null;
  await invoke('renderPos');
  const signedOutPosHtml = document.getElementById('posRoot')!.innerHTML;
  app.session = originalSession;
  app.posContext = originalContext;
  app.posCheckout = {
    refreshing: false,
    shiftLoading: false,
    loaded: true,
    catalogFromCache: false,
    shiftError: '',
    reportMode: 'live',
    reportsError: '',
    reportsLoading: false,
    shift: { shift_id: 'shift-1' },
    pending: null,
  };
  app.brandDisplayName = (name: string) => name;
  app.posSyncStatusHtml = () => '<span class="sync-fixture">Synced</span>';
  app.posSummaryHtml = () => '<div class="summary-fixture">Summary</div>';
  app.posModeName = () => 'Live';
  app.posRecentHtml = () => '<div class="recent-fixture">Recent</div>';
  app.posShiftBarHtml = () => '<div class="shift-fixture">Shift</div>';
  app.posCriticalRefreshNoticeHtml = () => '';
  app.posReceiptHtml = () => '<div class="receipt-fixture">Receipt</div>';
  app.posWorkspaceHtml = () => '<div class="workspace-fixture">Workspace</div>';
  app.posMobileOrderBarHtml = () => '<div class="mobile-fixture">Mobile</div>';
  api.renderPos();
  const fullPosHtml = document.getElementById('posRoot')!.innerHTML;

  api.renderPos = () => renderAllOrder.push('renderPos');
  api.renderStocks = () => renderAllOrder.push('renderStocks');
  app.renderIngredients = () => renderAllOrder.push('renderIngredients');
  app.renderDraftButton = () => renderAllOrder.push('renderDraftButton');
  app.renderPackaging = () => renderAllOrder.push('renderPackaging');
  app.renderRecipes = () => renderAllOrder.push('renderRecipes');
  app.renderProducts = () => renderAllOrder.push('renderProducts');
  await invoke('renderAll');
  api.renderPos = originalRenderPos;
  api.renderStocks = originalRenderStocks;

  clearPendingStorage();
  return {
    invoked,
    number,
    numberEdges,
    formattedNumber,
    formattedQuantity,
    quantityEdges,
    sourceId: source && source.id,
    status,
    statuses,
    filteredIds: filtered.map((item: any) => item.id),
    lowIds,
    mixtureIds,
    searchIds,
    summaryHtml,
    filterBarHtml,
    cardsHtml,
    transactionLabel,
    transactionLabels,
    historyHtml,
    resultsSnapshot,
    renderBranches,
    renderedStocksHtml,
    itemById: itemById && itemById.id,
    actions,
    actionEdges,
    units,
    unitEdges,
    inputBase,
    inputEdges,
    validationSnapshot,
    thresholdDisabled: {
      valid: thresholdDisabled.valid,
      thresholdBase: thresholdDisabled.thresholdBase,
      before: thresholdDisabled.before,
      after: thresholdDisabled.after,
    },
    opened,
    openedSnapshot,
    actionChanged,
    previewHtml,
    modalHtml,
    previewUpdate,
    closed,
    focusAfterClose,
    submitClosed,
    signedOutPosHtml,
    fullPosHtml,
    renderAllOrder,
    focuses,
    modalClasses,
  };
}

async function collectSubmitFingerprint() {
  const app = window as typeof window & Record<string, any>;
  const api: any = app.MatchaLunaApp?.domains?.stocks || app;
  const rpcCalls: Array<{ name: string; args: any }> = [];
  const focuses: string[] = [];
  let loadCount = 0;
  let renderCount = 0;

  const clearPendings = () => {
    api.stockStoredPendings().forEach((record: any) =>
      api.stockClearPending(record),
    );
  };
  const item = {
    id: 'inventory-1',
    sourceId: 'milk-source',
    name: 'Oat milk',
    kind: 'purchased',
    baseUnit: 'ml',
    balance: 100,
    threshold: 25,
    revision: 3,
    initialized: true,
    active: true,
    lastMovementAt: null,
    lastMovementType: '',
    categoryName: 'Milk',
  };
  const reset = (action: string, quantity: string) => {
    clearPendings();
    app.stockState = {
      items: [{ ...item }],
      transactions: [],
      loaded: true,
      loading: false,
      refreshing: false,
      error: '',
      notice: '',
      sourceConflict: '',
      search: '',
      status: 'all',
      kind: 'all',
      lastUpdatedAt: null,
    };
    app.stockModal = app.freshStockModal();
    app.stockModal.open = true;
    app.stockModal.itemId = item.id;
    app.stockModal.action = action;
    app.stockModal.quantity = quantity;
    app.stockModal.unit = 'ml';
    app.stockModal.reason = '';
    app.stockModal.note = 'Fixture';
    const modal = document.getElementById('stockModal');
    if (modal) modal.hidden = false;
  };

  app.session = { user: { id: 'submit-user' } };
  app.posContext = {
    businessId: 'submit-business',
    role: 'owner',
    error: '',
  };
  app.stockCanManage = () => true;
  app.stockMutationGeneration = 0;
  app.refreshModalBodyClass = () => {};
  app.focusSoon = (selector: string) => focuses.push(selector);
  app.posUuid = () => '11111111-1111-4111-8111-111111111111';
  app.TEST_MODE = true;
  api.loadStocks = async () => {
    loadCount += 1;
    return true;
  };
  api.renderStocks = () => {
    renderCount += 1;
  };

  reset('threshold', '250');
  app.cloud = {
    client: {
      rpc: async (name: string, args: any) => {
        rpcCalls.push({ name, args: app.snapshot(args) });
        return {
          data: [
            {
              inventory_item_id: item.id,
              low_stock_threshold_base: 250,
              revision: 4,
              active: true,
            },
          ],
          error: null,
        };
      },
    },
  };
  const thresholdResult = await api.submitStockModal();
  const threshold = {
    result: thresholdResult,
    request: rpcCalls[rpcCalls.length - 1],
    threshold: app.stockState.items[0].threshold,
    revision: app.stockState.items[0].revision,
    modalOpen: app.stockModal.open,
    notice: app.stockState.notice,
  };

  reset('stock_in', '10');
  app.cloud.client.rpc = async (name: string, args: any) => {
    rpcCalls.push({ name, args: app.snapshot(args) });
    throw { code: '23514', message: 'Deterministic fixture' };
  };
  const deterministicResult = await api.submitStockModal();
  const deterministic = {
    result: deterministicResult,
    request: rpcCalls[rpcCalls.length - 1],
    pendingCount: api.stockStoredPendings().length,
    pendingRpc: app.stockModal.pendingRpc,
    uncertain: app.stockModal.uncertain,
    submitting: app.stockModal.submitting,
    error: app.stockModal.error,
  };

  reset('stock_in', '10');
  app.cloud.client.rpc = async (name: string, args: any) => {
    rpcCalls.push({ name, args: app.snapshot(args) });
    throw new Error('offline fixture');
  };
  const uncertainResult = await api.submitStockModal();
  const uncertain = {
    result: uncertainResult,
    request: rpcCalls[rpcCalls.length - 1],
    pendingCount: api.stockStoredPendings().length,
    pendingRpc: app.snapshot(app.stockModal.pendingRpc),
    uncertain: app.stockModal.uncertain,
    submitting: app.stockModal.submitting,
    error: app.stockModal.error,
  };
  clearPendings();

  return {
    threshold,
    deterministic,
    uncertain,
    loadCount,
    renderCount,
    focuses,
    generation: app.stockMutationGeneration,
  };
}

test.beforeEach(async ({ page }) => {
  await openPrimary(page);
});

test('typed Stocks view exposes the exact ordered 27-function API', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const names = Object.keys(app.MatchaLunaApp.domains.stocks);
    return {
      viewOrder: names.slice(-27),
      rootMatches: names.slice(-27).every(
        (name) => app[name] === app.MatchaLunaApp.domains.stocks[name],
      ),
    };
  });

  expect(result.viewOrder).toEqual(stocksViewNames);
  expect(result.rootMatches).toBe(true);
  expect(classicStocksViewHashes()).toEqual({
    blob: 'd734b8c5b0ebb4d60916e42561083db80b2f0ec8',
    sha256:
      '1bb2a3c272b8473b63a6ff41c88500ec370a130960cd087882a8de65e32fb754',
  });
});

test('typed Stocks view matches the retained classic view fingerprint', async ({
  page,
  context,
}) => {
  const typed = await page.evaluate(collectStocksViewFingerprint);
  const classicPage = await context.newPage();
  try {
    await openClassicPage(classicPage);
    const provenance = await classicPage.evaluate(() => {
      const app = window as typeof window & Record<string, any>;
      return {
        modules: document.querySelectorAll('script[type="module"]').length,
        hasTypedStocks: Boolean(app.MatchaLunaApp?.domains?.stocks),
      };
    });
    expect(provenance).toEqual({ modules: 0, hasTypedStocks: false });
    const classic = await classicPage.evaluate(collectStocksViewFingerprint);
    const {
      summaryHtml: typedSummaryHtml,
      filterBarHtml: typedFilterBarHtml,
      cardsHtml: _typedCardsHtml,
      resultsSnapshot: typedResultsSnapshot,
      renderedStocksHtml: _typedRenderedStocksHtml,
      ...typedUnchanged
    } = typed;
    const {
      summaryHtml: classicSummaryHtml,
      filterBarHtml: classicFilterBarHtml,
      cardsHtml: _classicCardsHtml,
      resultsSnapshot: classicResultsSnapshot,
      renderedStocksHtml: _classicRenderedStocksHtml,
      ...classicUnchanged
    } = classic;
    expect(typedUnchanged).toEqual(classicUnchanged);
    expect(withoutAriaPressed(typedSummaryHtml)).toBe(classicSummaryHtml);
    expect(withoutAriaPressed(typedFilterBarHtml)).toBe(classicFilterBarHtml);
    expect({
      count: typedResultsSnapshot.count,
      itemIds: typedResultsSnapshot.itemIds,
      activeStatuses: typedResultsSnapshot.activeStatuses,
    }).toEqual({
      count: classicResultsSnapshot.count,
      itemIds: classicResultsSnapshot.itemIds,
      activeStatuses: classicResultsSnapshot.activeStatuses,
    });
    expect(typedResultsSnapshot.text).toContain(
      'Physical ingredient and prepared mixture inventory',
    );
    expect(typedResultsSnapshot.text).toContain('Zeta milk');
    expect(typedResultsSnapshot.text).not.toContain('A removed <source>');
    expect(typedResultsSnapshot.text).not.toContain('Oat <Milk>');
    expect(typedResultsSnapshot.text).not.toContain('Matcha');
  } finally {
    await classicPage.close();
  }

  expect(typed.invoked).toHaveLength(stocksViewNames.length);
  expect([...typed.invoked].sort()).toEqual([...stocksViewNames].sort());
  expect(typed.filteredIds).toEqual(['out', 'low', 'uncounted', 'good']);
  expect(typed.lowIds).toEqual(['low']);
  expect(typed.mixtureIds).toEqual(['out']);
  expect(typed.searchIds).toEqual(['low', 'good']);
  expect(typed.validationSnapshot).toMatchObject({
    valid: true,
    delta: -25,
    before: 400,
    after: 375,
    reason: 'spill',
  });
  expect(typed.openedSnapshot).toEqual({
    open: true,
    itemId: 'low',
    action: 'stock_in',
    unit: 'ml',
    hidden: false,
  });
  expect(typed.previewUpdate).toEqual({
    after: '385 ml',
    error: '',
    modalError: '',
  });
  expect(typed.renderAllOrder).toEqual([
    'renderPos',
    'renderStocks',
    'renderIngredients',
    'renderDraftButton',
    'renderPackaging',
    'renderRecipes',
    'renderProducts',
  ]);

  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    app.activateAppTab('stocks', false);
  });

  const stockTable = page.getByRole('table', {
    name: 'Physical ingredient and prepared mixture inventory',
  });
  await expect(stockTable).toBeVisible();
  await expect(stockTable.getByRole('columnheader')).toHaveText([
    'Item',
    'Status',
    'On hand',
    'Low-stock alert',
    'Last updated',
  ]);
  expect(
    await page.locator('.stock-row[data-stock-item]').evaluateAll((rows) =>
      rows.map((row) => (row as HTMLElement).dataset.stockItem),
    ),
  ).toEqual(['out', 'low', 'uncounted', 'good']);
  await expect(page.locator('.stock-row [data-stock-field]')).toHaveCount(20);
  await expect(page.locator('#stockVisibleCount')).toHaveAttribute(
    'aria-live',
    'polite',
  );
  await expect(
    page.locator(
      '.stock-summary [data-act="setStockStatus"][data-status="all"]',
    ),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.locator(
      '.stock-filter-bar [data-act="setStockStatus"][data-status="low"]',
    ),
  ).toHaveAttribute('aria-pressed', 'false');

  const removedRow = page.locator('.stock-row[data-stock-item="out"]');
  await expect(removedRow.getByRole('rowheader')).toContainText(
    'A removed <source>',
  );
  await expect(removedRow).toContainText('Prepared mixture');
  await expect(removedRow).toContainText('Removed from costing');
  await expect(
    removedRow.locator('[data-stock-field="status"]'),
  ).toHaveText('Out of stock');
  await expect(
    removedRow.locator('[data-stock-inline-field="count"]'),
  ).toHaveValue('0');
  await expect(
    removedRow.locator('[data-stock-inline-field="threshold"]'),
  ).toHaveValue('100');
  await expect(
    removedRow.locator('[data-stock-field="updated"]'),
  ).toContainText('Oct 2');

  const uncountedRow = page.locator(
    '.stock-row[data-stock-item="uncounted"]',
  );
  await expect(
    uncountedRow.locator('[data-stock-field="status"]'),
  ).toHaveText('Not counted');
  await expect(
    uncountedRow.locator('[data-stock-inline-field="count"]'),
  ).toHaveValue('');
  await expect(
    uncountedRow.locator('[data-stock-inline-field="threshold"]'),
  ).toHaveValue('');
  await expect(
    uncountedRow.locator('[data-stock-field="updated"]'),
  ).toHaveText('No count yet');
  await expect(page.locator('.stock-row .stock-inline-input')).toHaveCount(8);
  await expect(
    page.locator('.stock-row [data-act="openStockModal"]'),
  ).toHaveCount(0);
  await expect(page.locator('#stockRoot')).toContainText(
    'Inventory notice <safe>',
  );

  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const stocks = app.MatchaLunaApp.domains.stocks as Record<string, any>;
    app.stockState.sourceConflict = 'Fixture identity conflict';
    stocks.renderStocks();
  });
  await expect(page.locator('#stockRoot')).toContainText(
    'Stock updates locked.',
  );
  await expect(page.locator('#stockRoot')).toContainText(
    'Fixture identity conflict',
  );
  expect(
    await page
      .locator('.stock-row .stock-inline-input')
      .evaluateAll((inputs) =>
        inputs.every((input) => (input as HTMLInputElement).disabled),
      ),
  ).toBe(true);
  await expect(
    page.locator('.stock-row .stock-inline-input').first(),
  ).toHaveAttribute(
    'title',
    'Resolve the costing and stock identity conflict first',
  );

  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const stocks = app.MatchaLunaApp.domains.stocks as Record<string, any>;
    app.stockState.sourceConflict = '';
    app.__phase5bStockStoredPending = stocks.stockStoredPending;
    stocks.stockStoredPending = () => ({ id: 'fixture-pending' });
    stocks.renderStocks();
  });
  await expect(page.locator('#stockRoot')).toContainText(
    'Exact retry protected.',
  );
  expect(
    await page
      .locator('.stock-row .stock-inline-input')
      .evaluateAll((inputs) =>
        inputs.every((input) => (input as HTMLInputElement).disabled),
      ),
  ).toBe(true);
  await expect(
    page.locator('.stock-row .stock-inline-input').first(),
  ).toHaveAttribute('title', 'Recover the pending stock update first');
  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const stocks = app.MatchaLunaApp.domains.stocks as Record<string, any>;
    stocks.stockStoredPending = app.__phase5bStockStoredPending;
    delete app.__phase5bStockStoredPending;
    stocks.renderStocks();
  });

  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const stocks = app.MatchaLunaApp.domains.stocks as Record<string, any>;
    app.stockCanManage = () => false;
    stocks.renderStocks();
  });
  await expect(page.locator('.stock-row .stock-inline-input')).toHaveCount(0);
  await expect(
    page.locator('.stock-row [data-act="openStockModal"]'),
  ).toHaveCount(0);
  await expect(
    removedRow.locator('[data-stock-field="on-hand"]'),
  ).toHaveText('0 ml');

  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const stocks = app.MatchaLunaApp.domains.stocks as Record<string, any>;
    app.stockCanManage = () => true;
    app.stockState.search = 'no matching inventory item';
    stocks.renderStockResults();
  });
  await expect(page.locator('#stockResults')).toHaveText(
    'No stock items match these filters.',
  );
  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const stocks = app.MatchaLunaApp.domains.stocks as Record<string, any>;
    app.stockState.search = '';
    app.stockState.items = [];
    stocks.renderStockResults();
  });
  await expect(page.locator('#stockResults')).toContainText(
    'No ingredients are tracked yet.',
  );
});

test('typed Stocks submission matches classic success and error behavior', async ({
  page,
  context,
}) => {
  const typed = await page.evaluate(collectSubmitFingerprint);
  const classicPage = await context.newPage();
  try {
    await openClassicPage(classicPage);
    const classic = await classicPage.evaluate(collectSubmitFingerprint);
    expect(typed).toEqual(classic);
  } finally {
    await classicPage.close();
  }

  expect(typed.threshold).toMatchObject({
    result: true,
    threshold: 250,
    revision: 4,
    modalOpen: false,
    notice: 'Stock update saved to the shared ledger.',
  });
  expect(typed.threshold.request).toEqual({
    name: 'pos_inventory_set_threshold',
    args: {
      p_business_id: 'submit-business',
      p_inventory_item_id: 'inventory-1',
      p_threshold_base: 250,
      p_expected_revision: 3,
    },
  });
  expect(typed.deterministic).toMatchObject({
    result: false,
    pendingCount: 0,
    pendingRpc: null,
    uncertain: false,
    submitting: false,
  });
  expect(typed.uncertain).toMatchObject({
    result: false,
    pendingCount: 1,
    uncertain: true,
    submitting: false,
    error:
      'Could not reach the Stocks database. Check your connection and try again.',
  });
  expect(typed.uncertain.request.args).toEqual(
    typed.uncertain.pendingRpc.args,
  );
  expect(typed.loadCount).toBe(1);
  expect(typed.renderCount).toBe(1);
  expect(typed.generation).toBe(3);
});

test('typed Stocks view preserves live sibling root and later bindings', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const stocks = app.MatchaLunaApp.domains.stocks as Record<string, any>;
    const saved = {
      stockFormatNumber: stocks.stockFormatNumber,
      stockFilteredItems: stocks.stockFilteredItems,
      openStockModal: stocks.openStockModal,
      stockItemById: stocks.stockItemById,
      renderAll: stocks.renderAll,
    };
    const originals = {
      stockNumber: stocks.stockNumber,
      stockStatus: stocks.stockStatus,
      stockStoredPending: stocks.stockStoredPending,
      stockItemById: stocks.stockItemById,
      stockAllowedActions: stocks.stockAllowedActions,
      renderStockModal: stocks.renderStockModal,
      renderPos: stocks.renderPos,
      renderStocks: stocks.renderStocks,
      stockState: app.stockState,
      stockModal: app.stockModal,
      stockCanManage: app.stockCanManage,
      focusSoon: app.focusSoon,
      renderIngredients: app.renderIngredients,
      renderDraftButton: app.renderDraftButton,
      renderPackaging: app.renderPackaging,
      renderRecipes: app.renderRecipes,
      renderProducts: app.renderProducts,
    };
    const order: string[] = [];
    let modalRenders = 0;
    try {
      stocks.stockNumber = () => 42.25;
      const dynamicNumber = saved.stockFormatNumber('ignored');

      app.stockState = {
        items: [
          { id: 'a', name: 'A', active: true },
          { id: 'b', name: 'B', active: true },
        ],
        search: '',
        status: 'all',
        kind: 'all',
        loading: false,
        refreshing: false,
        sourceConflict: '',
      };
      stocks.stockStatus = (item: any) => ({
        key: 'good',
        rank: item.id === 'b' ? 0 : 1,
      });
      const dynamicStatus = saved.stockFilteredItems().map(
        (item: any) => item.id,
      );

      const dynamicItem = {
        id: 'dynamic-item',
        baseUnit: 'piece',
      };
      app.stockCanManage = () => true;
      stocks.stockStoredPending = () => null;
      stocks.stockItemById = () => dynamicItem;
      stocks.stockAllowedActions = () => [
        { key: 'dynamic-action', label: 'Dynamic action' },
      ];
      stocks.renderStockModal = () => {
        modalRenders += 1;
      };
      app.stockModal = app.freshStockModal();
      app.focusSoon = (selector: string) => order.push(selector);
      const dynamicOpen = saved.openStockModal('ignored');

      app.stockState = { items: [{ id: 7 }] };
      const dynamicRoot = saved.stockItemById('7')?.id;

      stocks.renderPos = () => order.push('renderPos');
      stocks.renderStocks = () => order.push('renderStocks');
      app.renderIngredients = () => order.push('renderIngredients');
      app.renderDraftButton = () => order.push('renderDraftButton');
      app.renderPackaging = () => order.push('renderPackaging');
      app.renderRecipes = () => order.push('renderRecipes');
      app.renderProducts = () => order.push('renderProducts');
      saved.renderAll();

      return {
        dynamicNumber,
        dynamicStatus,
        dynamicOpen,
        modalAction: app.stockModal.action,
        modalUnit: app.stockModal.unit,
        modalRenders,
        dynamicRoot,
        order,
      };
    } finally {
      stocks.stockNumber = originals.stockNumber;
      stocks.stockStatus = originals.stockStatus;
      stocks.stockStoredPending = originals.stockStoredPending;
      stocks.stockItemById = originals.stockItemById;
      stocks.stockAllowedActions = originals.stockAllowedActions;
      stocks.renderStockModal = originals.renderStockModal;
      stocks.renderPos = originals.renderPos;
      stocks.renderStocks = originals.renderStocks;
      app.stockState = originals.stockState;
      app.stockModal = originals.stockModal;
      app.stockCanManage = originals.stockCanManage;
      app.focusSoon = originals.focusSoon;
      app.renderIngredients = originals.renderIngredients;
      app.renderDraftButton = originals.renderDraftButton;
      app.renderPackaging = originals.renderPackaging;
      app.renderRecipes = originals.renderRecipes;
      app.renderProducts = originals.renderProducts;
    }
  });

  expect(result).toEqual({
    dynamicNumber: '42.25',
    dynamicStatus: ['b', 'a'],
    dynamicOpen: true,
    modalAction: 'dynamic-action',
    modalUnit: 'piece',
    modalRenders: 1,
    dynamicRoot: 7,
    order: [
      '#stockQuantity',
      'renderPos',
      'renderStocks',
      'renderIngredients',
      'renderDraftButton',
      'renderPackaging',
      'renderRecipes',
      'renderProducts',
    ],
  });
});
