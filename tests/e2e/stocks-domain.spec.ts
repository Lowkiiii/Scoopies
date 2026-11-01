import { expect, test, type Page } from '@playwright/test';
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

const stocksNames = [
  'stockRequestIsCurrent',
  'stockBaseUnitForIngredient',
  'stockSourcePayload',
  'costingBulkInventoryIssue',
  'reconcileCostingInventoryLifecycle',
  'replaceCostingStateSafely',
  'stockNormalizeItem',
  'stockNormalizeTransaction',
  'stockPendingScope',
  'stockPendingStorageKey',
  'stockPendingRecords',
  'stockBuildPending',
  'stockSavePending',
  'stockClearPending',
  'stockStoredPendings',
  'stockStoredPending',
  'stockPendingStillCurrent',
  'stockSourceDeleteStorageKey',
  'stockSourceDeleteRecords',
  'stockSaveSourceDelete',
  'stockClearSourceDelete',
  'stockBuildSourceDelete',
  'stockAdoptRemoteCosting',
  'stockScopedSourceDeletes',
  'stockRecoverSourceDeletes',
  'stockApplyMutationRows',
  'stockRestorePendingModal',
  'stockRecoverStoredPending',
  'stockErrorText',
  'stockMutationDeterministic',
  'stockSourceGuardMessage',
  'stockEnsureSourceWorkspace',
  'deleteIngredientSafely',
  'changeIngredientUnitSafely',
  'loadStocks',
  'openStocks',
];

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
    (window as typeof window & { MatchaLunaApp: { ready: Promise<void> } }).MatchaLunaApp.ready,
  );
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
}

async function collectStocksFingerprint() {
  const app = window as typeof window & Record<string, any>;
  const savedGlobalNames = [
    'state',
    'session',
    'posContext',
    'stockState',
    'stockModal',
    'stockModalReturnFocus',
    'stockLoadGeneration',
    'cloud',
    'syncedState',
    'costingCloudReady',
    'pendingSave',
    'localDirty',
    'pendingRemote',
    'saveTimer',
    'stockSourceMutations',
    'TEST_MODE',
    'lastState',
    'costingSourceCommitInFlight',
    'ingredientUi',
    'renderAll',
    'renderStocks',
    'renderStockModal',
    'refreshModalBodyClass',
    'save',
    'logCoarse',
    'logChanges',
    'actorName',
    'stockCanManage',
    'mergeStates',
    'rememberSynced',
    'markLocalDirty',
    'consumePendingRemoteForCommit',
    'setStatus',
    'alert',
    'confirm',
  ];
  const savedGlobals = new Map(
    savedGlobalNames.map((name) => [name, app[name]]),
  );
  const originalDateNow = Date.now;
  const modal = document.getElementById('stockModal') as HTMLElement | null;
  const originalModalHidden = modal?.hidden;
  const costingStorage = localStorage.getItem(app.KEY);
  const preservedInventoryStorage: Array<[string, string]> = [];
  const pendingPrefix = app.STOCK_PENDING_KEY + '|';
  const sourceDeletePrefix = app.STOCK_SOURCE_DELETE_KEY + '|';
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (
      key &&
      (key.indexOf(pendingPrefix) === 0 ||
        key.indexOf(sourceDeletePrefix) === 0)
    ) {
      preservedInventoryStorage.push([key, localStorage.getItem(key) as string]);
    }
  }
  const clearInventoryStorage = () => {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (
        key &&
        (key.indexOf(pendingPrefix) === 0 ||
          key.indexOf(sourceDeletePrefix) === 0)
      ) {
        keys.push(key);
      }
    }
    keys.forEach((key) => localStorage.removeItem(key));
  };
  clearInventoryStorage();

  const invoked: string[] = [];
  const invoke = async (name: string, ...args: any[]) => {
    invoked.push(name);
    return app[name](...args);
  };
  const counters = {
    alerts: [] as string[],
    coarse: [] as string[],
    renders: 0,
    stockRenders: 0,
    modalRenders: 0,
    saves: 0,
    logs: 0,
    remembered: 0,
    dirtied: 0,
  };

  const makeState = (ingredients: any[]) => {
    const next = app.blank();
    next.ingredientCategories = [{ id: 'dairy', name: 'Dairy' }];
    next.ingredients = ingredients;
    next.packaging = [];
    next.recipes = [];
    next.products = [];
    next.mixtureDrafts = [];
    return app.normalizeState(next);
  };
  const milk = {
    id: 'milk',
    name: ' Oat Milk ',
    kind: 'purchased',
    purchaseQty: 1,
    amountPerItem: 1,
    unit: 'l',
    price: 120,
    categoryId: 'dairy',
  };
  const matcha = {
    id: 'matcha',
    name: 'Matcha',
    kind: 'purchased',
    purchaseQty: 1,
    amountPerItem: 100,
    unit: 'g',
    price: 500,
  };
  const cream = {
    id: 'cream',
    name: ' Cream ',
    kind: 'mixture',
    batchYield: 100,
    unit: 'ml',
    components: [{ ingredientId: 'milk', qty: 50, unit: 'ml' }],
  };
  const blankSource = {
    id: 'blank',
    name: '   ',
    kind: 'purchased',
    purchaseQty: 1,
    amountPerItem: 1,
    unit: 'l',
    price: 1,
  };
  const invalidSource = {
    id: 'invalid',
    name: 'Invalid',
    kind: 'purchased',
    purchaseQty: 1,
    amountPerItem: 1,
    unit: 'unknown',
    price: 1,
  };

  try {
    Date.now = () => 1_700_000_000_000;
    app.state = makeState([milk, matcha, cream, blankSource, invalidSource]);
    app.session = { user: { id: 'user-1' } };
    app.posContext = { businessId: 'business-1', role: 'owner', error: '' };
    app.stockLoadGeneration = 7;
    app.stockState = {
      items: [],
      transactions: [],
      loaded: true,
      loading: false,
      refreshing: false,
      error: '',
      notice: '',
      sourceConflict: '',
      lastUpdatedAt: null,
    };
    app.stockModal = app.freshStockModal();
    app.cloud = { connected: true, client: null };
    app.syncedState = app.snapshot(app.state);
    app.costingCloudReady = true;
    app.pendingSave = false;
    app.localDirty = false;
    app.pendingRemote = null;
    app.saveTimer = null;
    app.stockSourceMutations = {};
    app.TEST_MODE = true;
    app.renderAll = () => {
      counters.renders += 1;
    };
    app.renderStocks = () => {
      counters.stockRenders += 1;
    };
    app.renderStockModal = () => {
      counters.modalRenders += 1;
    };
    app.refreshModalBodyClass = () => {};
    app.save = () => {
      counters.saves += 1;
    };
    app.logCoarse = (activity: string) => {
      counters.coarse.push(activity);
    };
    app.logChanges = () => {
      counters.logs += 1;
    };
    app.actorName = () => 'Tester';
    app.stockCanManage = () => true;
    app.mergeStates = (_baseline: unknown, local: unknown) => app.snapshot(local);
    app.rememberSynced = () => {
      counters.remembered += 1;
    };
    app.markLocalDirty = () => {
      counters.dirtied += 1;
    };
    app.consumePendingRemoteForCommit = () => {};
    app.setStatus = () => {};
    app.alert = (message: unknown) => {
      counters.alerts.push(String(message));
    };
    app.confirm = () => true;

    const currentness = [
      await invoke('stockRequestIsCurrent', 7, 'user-1', 'business-1'),
      app.stockRequestIsCurrent(6, 'user-1', 'business-1'),
    ];
    const baseUnits = [
      await invoke('stockBaseUnitForIngredient', milk),
      app.stockBaseUnitForIngredient(matcha),
      app.stockBaseUnitForIngredient(cream),
      app.stockBaseUnitForIngredient(invalidSource),
    ];
    const sourcePayload = await invoke('stockSourcePayload');
    const sameState = app.snapshot(app.state);
    const bulkIssues = [
      await invoke('costingBulkInventoryIssue', sameState),
      app.costingBulkInventoryIssue({
        ...sameState,
        ingredients: sameState.ingredients.slice(1),
      }),
    ];

    const reconcileBaseline = makeState([milk, matcha]);
    const reconcileAuthoritative = makeState([milk]);
    const reconcileCandidate = makeState([
      milk,
      matcha,
      {
        id: 'local',
        name: 'Local only',
        kind: 'purchased',
        purchaseQty: 1,
        amountPerItem: 1,
        unit: 'g',
        price: 1,
      },
    ]);
    const reconciled = await invoke(
      'reconcileCostingInventoryLifecycle',
      reconcileAuthoritative,
      reconcileCandidate,
      reconcileBaseline,
    );
    const replacement = await invoke(
      'replaceCostingStateSafely',
      app.snapshot(app.state),
      'replace fixture',
    );

    const normalizedItem = await invoke('stockNormalizeItem', {
      inventory_item_id: 'inventory-1',
      source_costing_ingredient_id: 'milk',
      name: 'Oat Milk',
      item_kind: 'purchased',
      base_unit: 'ml',
      current_balance_base: '1250',
      low_stock_threshold_base: '500',
      revision: '3',
      has_stock_history: true,
      active: true,
      last_movement_at: '2026-10-01T00:00:00.000Z',
      last_movement_type: 'stock_in',
    });
    const normalizedTransaction = await invoke('stockNormalizeTransaction', {
      transaction_id: 'transaction-1',
      inventory_item_id: 'inventory-1',
      item_name_snapshot: 'Oat Milk',
      transaction_type: 'stock_in',
      quantity_delta_base: '250',
      balance_before_base: '1000',
      balance_after_base: '1250',
      base_unit_snapshot: 'ml',
      recorded_by_name: 'Tester',
      occurred_at: '2026-10-01T00:00:00.000Z',
      item_sequence: 1,
      item_revision_before: 2,
      item_revision_after: 3,
    });

    const request = (id: string) => ({
      name: 'pos_inventory_record_transaction',
      args: {
        p_business_id: 'business-1',
        p_client_transaction_id: id,
        p_transaction_type: 'stock_in',
        p_lines: [
          {
            inventoryItemId: 'inventory-1',
            quantity: 25,
            unit: 'ml',
            expectedRevision: 3,
          },
        ],
        p_reason: null,
        p_note: 'Delivery',
      },
    });
    const firstPending = await invoke(
      'stockBuildPending',
      request('client-1'),
      'inventory-1',
    );
    const secondPending = app.stockBuildPending(
      request('client-2'),
      'inventory-1',
    );
    firstPending.savedAt = 2;
    secondPending.savedAt = 1;
    const pendingScope = await invoke(
      'stockPendingScope',
      'user-1',
      'business-1',
    );
    const pendingKey = await invoke('stockPendingStorageKey', firstPending);
    const savedPendings = [
      await invoke('stockSavePending', firstPending),
      app.stockSavePending(secondPending),
    ];
    const pendingRecords = await invoke('stockPendingRecords');
    const storedPendings = await invoke('stockStoredPendings');
    const storedPending = await invoke('stockStoredPending');
    const pendingCurrent = await invoke(
      'stockPendingStillCurrent',
      firstPending,
    );
    const clearedPending = await invoke('stockClearPending', firstPending);

    const sourceDelete = await invoke('stockBuildSourceDelete', milk);
    const sourceDeleteKey = await invoke(
      'stockSourceDeleteStorageKey',
      sourceDelete,
    );
    const savedSourceDelete = await invoke(
      'stockSaveSourceDelete',
      sourceDelete,
    );
    const sourceDeleteRecords = await invoke('stockSourceDeleteRecords');
    const scopedSourceDeletes = await invoke('stockScopedSourceDeletes');
    const clearedSourceDelete = await invoke(
      'stockClearSourceDelete',
      sourceDelete,
    );
    const recoveredSourceDeletes = await invoke('stockRecoverSourceDeletes');

    const adopted = await invoke(
      'stockAdoptRemoteCosting',
      app.snapshot(app.state),
    );

    app.stockState.items = [
      {
        id: 'inventory-1',
        sourceId: 'milk',
        name: 'Oat Milk',
        kind: 'purchased',
        baseUnit: 'ml',
        balance: 10,
        threshold: null,
        revision: 2,
        initialized: false,
        active: true,
        lastMovementAt: null,
        lastMovementType: '',
      },
    ];
    app.stockState.transactions = [];
    const thresholdApplied = await invoke(
      'stockApplyMutationRows',
      { name: 'pos_inventory_set_threshold', args: {} },
      [
        {
          inventory_item_id: 'inventory-1',
          low_stock_threshold_base: 5,
          revision: 3,
          active: true,
        },
      ],
    );
    const mutationRequest = {
      name: 'pos_inventory_record_transaction',
      args: {
        p_transaction_type: 'stock_in',
        p_reason: null,
        p_note: 'Delivery',
      },
    };
    const mutationRow = {
      transaction_id: 'movement-1',
      inventory_item_id: 'inventory-1',
      item_name: 'Oat Milk',
      transaction_type: 'stock_in',
      quantity_delta_base: 5,
      balance_before_base: 10,
      balance_after_base: 15,
      base_unit: 'ml',
      item_revision: 4,
      occurred_at: '2026-10-01T01:00:00.000Z',
    };
    const movementApplied = app.stockApplyMutationRows(
      mutationRequest,
      [mutationRow],
    );
    const duplicateApplied = app.stockApplyMutationRows(
      mutationRequest,
      [mutationRow],
    );
    const restoredModal = await invoke(
      'stockRestorePendingModal',
      secondPending,
    );
    app.stockCanManage = () => false;
    const recoveredPending = await invoke('stockRecoverStoredPending');
    app.stockCanManage = () => true;

    const errorTexts = await invoke('stockErrorText', {
      code: 'PGRST202',
      message: 'missing',
    });
    const otherErrorTexts = [
      app.stockErrorText({ code: '42501' }),
      app.stockErrorText({ code: '40001' }),
      app.stockErrorText({ code: '55000', message: 'Blocked exactly' }),
      app.stockErrorText({ code: '23505' }),
      app.stockErrorText({ code: '22003' }),
      app.stockErrorText({ code: '23514', message: 'Invalid exactly' }),
      app.stockErrorText({ code: 'P0002' }),
      app.stockErrorText(new Error('offline')),
    ];
    const deterministic = await invoke('stockMutationDeterministic', {
      code: '55000',
    });
    const nondeterministic = app.stockMutationDeterministic({});
    const guardMessage = await invoke(
      'stockSourceGuardMessage',
      new Error('Raw test error'),
      'delete',
    );

    const activeSession = app.session;
    app.session = null;
    const workspaceReady = await invoke(
      'stockEnsureSourceWorkspace',
      'delete',
    );
    const deleteResult = await invoke('deleteIngredientSafely', '');
    const unitResult = await invoke('changeIngredientUnitSafely', '', 'ml');
    const loadResult = await invoke('loadStocks');
    const openResult = await invoke('openStocks', false);
    app.session = activeSession;

    return {
      invoked,
      currentness,
      baseUnits,
      sourcePayload,
      bulkIssues,
      reconciled: {
        ids: reconciled.state.ingredients.map((item: any) => item.id),
        blocked: reconciled.blocked,
      },
      replacement,
      normalizedItem,
      normalizedTransaction,
      pending: {
        scope: pendingScope,
        key: pendingKey,
        saved: savedPendings,
        recordIds: pendingRecords.map(
          (record: any) => record.rpcArgs.p_client_transaction_id,
        ),
        storedIds: storedPendings.map(
          (record: any) => record.rpcArgs.p_client_transaction_id,
        ),
        firstId: storedPending.rpcArgs.p_client_transaction_id,
        current: pendingCurrent,
        cleared: clearedPending,
      },
      sourceDelete: {
        key: sourceDeleteKey,
        saved: savedSourceDelete,
        records: sourceDeleteRecords.map((record: any) => record.sourceId),
        scoped: scopedSourceDeletes.map((record: any) => record.sourceId),
        cleared: clearedSourceDelete,
        recovered: recoveredSourceDeletes,
      },
      adopted,
      mutation: {
        thresholdApplied,
        movementApplied,
        duplicateApplied,
        balance: app.stockState.items[0].balance,
        threshold: app.stockState.items[0].threshold,
        revision: app.stockState.items[0].revision,
        transactionCount: app.stockState.transactions.length,
        firstTransaction: app.stockState.transactions[0],
      },
      restoredModal: {
        result: restoredModal,
        itemId: app.stockModal.itemId,
        action: app.stockModal.action,
        quantity: app.stockModal.quantity,
        unit: app.stockModal.unit,
        uncertain: app.stockModal.uncertain,
      },
      recoveredPending,
      errors: [errorTexts, ...otherErrorTexts],
      deterministic: [deterministic, nondeterministic],
      guardMessage,
      earlyAsync: {
        workspaceReady,
        deleteResult,
        unitResult,
        loadResult,
        openResult,
      },
      counters,
    };
  } finally {
    Date.now = originalDateNow;
    savedGlobals.forEach((value, name) => {
      app[name] = value;
    });
    clearInventoryStorage();
    preservedInventoryStorage.forEach(([key, value]) =>
      localStorage.setItem(key, value),
    );
    if (costingStorage == null) localStorage.removeItem(app.KEY);
    else localStorage.setItem(app.KEY, costingStorage);
    if (modal && originalModalHidden != null) modal.hidden = originalModalHidden;
  }
}

test.beforeEach(async ({ page }) => {
  await openPrimary(page);
});

test('typed Stocks preserves the complete 36-function fingerprint', async ({ page }) => {
  const result = await page.evaluate(collectStocksFingerprint);

  expect(result.invoked).toHaveLength(stocksNames.length);
  expect([...result.invoked].sort()).toEqual([...stocksNames].sort());
  expect(result.currentness).toEqual([true, false]);
  expect(result.baseUnits).toEqual(['ml', 'g', 'ml', '']);
  expect(result.sourcePayload).toEqual([
    {
      sourceCostingIngredientId: 'milk',
      kind: 'purchased',
      name: 'Oat Milk',
      baseUnit: 'ml',
    },
    {
      sourceCostingIngredientId: 'matcha',
      kind: 'purchased',
      name: 'Matcha',
      baseUnit: 'g',
    },
    {
      sourceCostingIngredientId: 'cream',
      kind: 'mixture',
      name: 'Cream',
      baseUnit: 'ml',
    },
  ]);
  expect(result.bulkIssues[0]).toBe('');
  expect(result.bulkIssues[1]).toContain('cannot add or remove');
  expect(result.reconciled).toEqual({ ids: ['milk', 'local'], blocked: ['Matcha'] });
  expect(result.replacement).toBe(true);
  expect(result.normalizedItem).toMatchObject({
    id: 'inventory-1',
    sourceId: 'milk',
    balance: 1250,
    threshold: 500,
    revision: 3,
    categoryName: 'Dairy',
  });
  expect(result.normalizedTransaction).toMatchObject({
    transactionId: 'transaction-1',
    itemId: 'inventory-1',
    delta: 250,
    before: 1000,
    after: 1250,
    revisionAfter: 3,
  });
  expect(result.pending.recordIds).toEqual(['client-2', 'client-1']);
  expect(result.pending.storedIds).toEqual(['client-2', 'client-1']);
  expect(result.pending.firstId).toBe('client-2');
  expect(result.pending.current).toBe(true);
  expect(result.pending.cleared).toBe(true);
  expect(result.sourceDelete).toMatchObject({
    saved: true,
    records: ['milk'],
    scoped: ['milk'],
    cleared: true,
    recovered: 0,
  });
  expect(result.adopted).toBe(true);
  expect(result.mutation).toMatchObject({
    thresholdApplied: true,
    movementApplied: true,
    duplicateApplied: true,
    balance: 15,
    threshold: 5,
    revision: 4,
    transactionCount: 1,
  });
  expect(result.mutation.firstTransaction).toMatchObject({
    transactionId: 'movement-1',
    actor: 'Tester',
    itemSequence: 1,
    revisionBefore: 3,
    revisionAfter: 4,
  });
  expect(result.restoredModal).toEqual({
    result: true,
    itemId: 'inventory-1',
    action: 'stock_in',
    quantity: '25',
    unit: 'ml',
    uncertain: true,
  });
  expect(result.recoveredPending).toBe(false);
  expect(result.errors).toHaveLength(9);
  expect(result.deterministic).toEqual([true, false]);
  expect(result.guardMessage).toBe('Raw test error');
  expect(result.earlyAsync).toEqual({
    workspaceReady: true,
    deleteResult: false,
    unitResult: false,
    loadResult: false,
    openResult: false,
  });
});

test('typed Stocks matches the retained classic Stocks asset', async ({ page, context }) => {
  const typedFingerprint = await page.evaluate(collectStocksFingerprint);
  const builtHtml = readFileSync(resolve(process.cwd(), 'dist/index.html'), 'utf8');
  const classicScripts = transitionRuntimeFiles
    .map((fileName) => `<script src="/Scoopies/assets/js/${fileName}"></script>`)
    .join('\n');
  const transitionHtml = builtHtml
    .replace(/\s*<script type="module"[^>]*><\/script>/, '')
    .replace('</body>', `${classicScripts}\n</body>`);
  const legacyPage = await context.newPage();
  await stubSupabase(legacyPage);
  await legacyPage.route('**/index.html?test=1&stocks-transition=1', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: transitionHtml });
  });
  await legacyPage.goto('index.html?test=1&stocks-transition=1', { waitUntil: 'load' });
  await expect(legacyPage.locator('#syncStatus')).toHaveText('Test mode');
  const provenance = await legacyPage.evaluate(() => {
    const appWindow = window as typeof window & Record<string, any>;
    return {
      moduleScripts: document.querySelectorAll('script[type="module"]').length,
      hasTypedStocksDomain: Boolean(appWindow.MatchaLunaApp.domains.stocks),
    };
  });
  const classicFingerprint = await legacyPage.evaluate(collectStocksFingerprint);
  await legacyPage.close();

  expect(provenance).toEqual({ moduleScripts: 0, hasTypedStocksDomain: false });
  expect(typedFingerprint).toEqual(classicFingerprint);
});

test('typed Stocks preserves live sibling and later-defined runtime bindings', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const stocks = app.MatchaLunaApp.domains.stocks as Record<string, any>;
    const saved = {
      stockSourcePayload: stocks.stockSourcePayload,
      stockSourceGuardMessage: stocks.stockSourceGuardMessage,
      stockEnsureSourceWorkspace: stocks.stockEnsureSourceWorkspace,
      openStocks: stocks.openStocks,
    };
    const originals = {
      state: app.state,
      session: app.session,
      posContext: app.posContext,
      cloud: app.cloud,
      stockState: app.stockState,
      stockBaseUnitForIngredient: stocks.stockBaseUnitForIngredient,
      stockErrorText: stocks.stockErrorText,
      stockCanManage: app.stockCanManage,
      renderStocks: app.renderStocks,
      alert: app.alert,
      TEST_MODE: app.TEST_MODE,
    };
    const alerts: string[] = [];
    let renderCount = 0;
    try {
      app.state = {
        ingredients: [{ id: 'live', name: 'Live source', unit: 'g' }],
      };
      stocks.stockBaseUnitForIngredient = () => 'piece';
      const dynamicSibling = saved.stockSourcePayload();

      stocks.stockErrorText = () => 'dynamic error';
      app.TEST_MODE = false;
      const dynamicError = saved.stockSourceGuardMessage({}, 'delete');

      app.session = { user: { id: 'user' } };
      app.posContext = { businessId: 'business', error: '' };
      app.cloud = { connected: true, client: {} };
      app.stockCanManage = () => false;
      app.alert = (message: unknown) => alerts.push(String(message));
      const dynamicLaterPermission = await saved.stockEnsureSourceWorkspace('delete');

      app.session = null;
      app.renderStocks = () => {
        renderCount += 1;
      };
      const dynamicLaterRender = await saved.openStocks(false);

      return {
        dynamicSibling,
        dynamicError,
        dynamicLaterPermission,
        dynamicLaterRender,
        permissionAlert: alerts[0],
        renderCount,
      };
    } finally {
      app.state = originals.state;
      app.session = originals.session;
      app.posContext = originals.posContext;
      app.cloud = originals.cloud;
      app.stockState = originals.stockState;
      stocks.stockBaseUnitForIngredient = originals.stockBaseUnitForIngredient;
      stocks.stockErrorText = originals.stockErrorText;
      app.stockCanManage = originals.stockCanManage;
      app.renderStocks = originals.renderStocks;
      app.alert = originals.alert;
      app.TEST_MODE = originals.TEST_MODE;
    }
  });

  expect(result).toEqual({
    dynamicSibling: [
      {
        sourceCostingIngredientId: 'live',
        kind: 'purchased',
        name: 'Live source',
        baseUnit: 'piece',
      },
    ],
    dynamicError: 'dynamic error',
    dynamicLaterPermission: false,
    dynamicLaterRender: false,
    permissionAlert:
      'Only an owner or manager can delete an ingredient that may have stock history.',
    renderCount: 1,
  });
});
