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

async function openClassicStocksPage(page: Page) {
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
    '**/index.html?test=1&stocks-release-transition=1',
    async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: transitionHtml,
      });
    },
  );
  await page.goto('index.html?test=1&stocks-release-transition=1', {
    waitUntil: 'load',
  });
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
}

async function collectRemoteMissingDeletionFingerprint() {
  const app = window as typeof window & Record<string, any>;
  const stocks = app.MatchaLunaApp?.domains?.stocks as
    | Record<string, any>
    | undefined;
  const api = stocks || app;
  const savedRuntimeNames = [
    'state',
    'session',
    'posContext',
    'cloud',
    'syncedState',
    'stockState',
    'stockSourceMutations',
    'costingSourceCommitInFlight',
    'consumePendingRemoteForCommit',
    'stockCanManage',
    'cloudLoad',
    'confirm',
    'alert',
    'renderAll',
    'save',
    'logChanges',
    'setStatus',
  ];
  const savedRuntime = new Map(
    savedRuntimeNames.map((name) => [name, app[name]]),
  );
  const originalAdoptRemoteCosting = api.stockAdoptRemoteCosting;
  const rpcCalls: Array<{ name: string; args: unknown }> = [];
  const statuses: Array<[string, string]> = [];
  const confirmations: string[] = [];
  const alerts: string[] = [];
  const consumedPending: unknown[] = [];
  let cloudLoads = 0;
  let renders = 0;
  let saves = 0;
  let logs = 0;

  const milk = {
    id: 'milk',
    name: 'Oat Milk',
    kind: 'purchased',
    purchaseQty: 1,
    amountPerItem: 1,
    unit: 'l',
    price: 120,
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
  const local = app.blank();
  local.ingredients = [milk, matcha];
  const remote = app.blank();
  remote.ingredients = [matcha];

  try {
    app.state = app.normalizeState(local);
    app.syncedState = app.snapshot(app.state);
    app.session = { user: { id: 'user-1' } };
    app.posContext = {
      loaded: true,
      loading: false,
      businessId: 'business-1',
      businessName: 'Matcha Luna',
      role: 'owner',
      publications: {},
      error: '',
    };
    app.stockState = {
      loaded: true,
      loading: false,
      refreshing: false,
      error: '',
      notice: '',
      sourceConflict: '',
      search: '',
      status: 'all',
      kind: 'all',
      lastUpdatedAt: 0,
      items: [
        {
          id: 'inventory-milk',
          sourceId: 'milk',
          name: 'Oat Milk',
          kind: 'purchased',
          baseUnit: 'ml',
          balance: 1_000,
          threshold: 250,
          revision: 4,
          initialized: true,
          active: true,
          lastMovementAt: null,
          lastMovementType: '',
          categoryName: 'Milk',
        },
        {
          id: 'inventory-matcha',
          sourceId: 'matcha',
          name: 'Matcha',
          kind: 'purchased',
          baseUnit: 'g',
          balance: 100,
          threshold: 20,
          revision: 2,
          initialized: true,
          active: true,
          lastMovementAt: null,
          lastMovementType: '',
          categoryName: 'Powder',
        },
      ],
      transactions: [],
    };
    app.stockSourceMutations = {};
    app.costingSourceCommitInFlight = false;
    app.consumePendingRemoteForCommit = (value: unknown) => {
      consumedPending.push(value);
    };
    app.stockCanManage = () => true;
    app.cloudLoad = async () => {
      cloudLoads += 1;
      return app.snapshot(remote);
    };
    app.cloud = {
      connected: true,
      client: {
        rpc: async (name: string, args: unknown) => {
          rpcCalls.push({ name, args: app.snapshot(args) });
          return { data: [], error: null };
        },
      },
    };
    app.confirm = (message: unknown) => {
      confirmations.push(String(message));
      return true;
    };
    app.alert = (message: unknown) => {
      alerts.push(String(message));
    };
    app.renderAll = () => {
      renders += 1;
    };
    app.save = () => {
      saves += 1;
    };
    app.logChanges = () => {
      logs += 1;
    };
    app.setStatus = (message: unknown, tone: unknown) => {
      statuses.push([String(message), String(tone)]);
    };
    api.stockAdoptRemoteCosting = (remoteState: unknown) => {
      app.state = app.snapshot(remoteState);
      return true;
    };

    const result = await api.deleteIngredientSafely('milk');

    return {
      result,
      rpcCalls,
      cloudLoads,
      statuses,
      confirmations,
      alerts,
      consumedPending,
      renders,
      saves,
      logs,
      remainingIngredientIds: app.state.ingredients.map(
        (ingredient: { id: string }) => ingredient.id,
      ),
      remainingStockSourceIds: app.stockState.items.map(
        (item: { sourceId: string }) => item.sourceId,
      ),
      sourceMutationIds: Object.keys(app.stockSourceMutations),
      costingSourceCommitInFlight: app.costingSourceCommitInFlight,
      stateMatchesRemote: app.sameDataValue(app.state, remote),
    };
  } finally {
    api.stockAdoptRemoteCosting = originalAdoptRemoteCosting;
    savedRuntime.forEach((value, name) => {
      app[name] = value;
    });
  }
}

test.beforeEach(async ({ page }) => {
  await openPrimary(page);
});

test('remote-missing source deletion matches classic and keeps the exact cloud status', async ({
  page,
  context,
}) => {
  const typed = await page.evaluate(collectRemoteMissingDeletionFingerprint);

  const classicPage = await context.newPage();
  try {
    await openClassicStocksPage(classicPage);
    const provenance = await classicPage.evaluate(() => {
      const app = window as typeof window & Record<string, any>;
      return {
        moduleScripts: document.querySelectorAll('script[type="module"]')
          .length,
        hasTypedStocksDomain: Boolean(
          app.MatchaLunaApp?.domains?.stocks,
        ),
      };
    });
    expect(provenance).toEqual({
      moduleScripts: 0,
      hasTypedStocksDomain: false,
    });

    const classic = await classicPage.evaluate(
      collectRemoteMissingDeletionFingerprint,
    );
    expect(typed).toEqual(classic);
  } finally {
    await classicPage.close();
  }

  expect(typed).toEqual({
    result: true,
    rpcCalls: [
      {
        name: 'pos_inventory_get_items',
        args: {
          p_business_id: 'business-1',
          p_include_inactive: true,
        },
      },
    ],
    cloudLoads: 1,
    statuses: [['Updated from cloud ✓', 'good']],
    confirmations: ['Delete "Oat Milk"?'],
    alerts: [],
    consumedPending: [false, false],
    renders: 1,
    saves: 0,
    logs: 0,
    remainingIngredientIds: ['matcha'],
    remainingStockSourceIds: ['matcha'],
    sourceMutationIds: [],
    costingSourceCommitInFlight: false,
    stateMatchesRemote: true,
  });
});

test('authenticated data-heavy Stocks view stays usable at a mobile width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const itemFixtures = [
      {
        id: 'matcha',
        name: 'Organic Ceremonial Grade Matcha Powder From Uji Kyoto Reserve',
        kind: 'purchased',
        baseUnit: 'g',
        balance: 8_125,
        threshold: 500,
        categoryName: 'Premium Matcha Powders and Tea Ingredients',
      },
      {
        id: 'oat-milk',
        name: 'Oatside Barista Blend Oat Milk One Liter Carton',
        kind: 'purchased',
        baseUnit: 'ml',
        balance: 12_500,
        threshold: 3_000,
        categoryName: 'Milk and Shelf Stable Beverages',
      },
      {
        id: 'sea-salt-cream',
        name: 'Sea Salt Cream Prepared Batch for Weekend Pop-up Service',
        kind: 'mixture',
        baseUnit: 'ml',
        balance: 950,
        threshold: 1_000,
        categoryName: 'Prepared Cream and Foam Mixtures',
      },
      {
        id: 'cup',
        name: 'Compostable Twelve Ounce Cold Cup With Supplier Description',
        kind: 'purchased',
        baseUnit: 'piece',
        balance: 240,
        threshold: 50,
        categoryName: 'Service Supplies',
      },
      {
        id: 'strawberry',
        name: 'Small Batch Strawberry Preserve',
        kind: 'purchased',
        baseUnit: 'g',
        balance: 0,
        threshold: 100,
        categoryName: 'Fruit and Sweeteners',
      },
      {
        id: 'hojicha',
        name: 'Roasted Hojicha Powder',
        kind: 'purchased',
        baseUnit: 'g',
        balance: 480,
        threshold: null,
        categoryName: 'Tea Powders',
      },
      {
        id: 'vanilla',
        name: 'Madagascar Vanilla Syrup',
        kind: 'purchased',
        baseUnit: 'ml',
        balance: 2_250,
        threshold: 400,
        categoryName: 'Syrups',
      },
      {
        id: 'salt',
        name: 'Fine Sea Salt',
        kind: 'purchased',
        baseUnit: 'g',
        balance: 320,
        threshold: 75,
        categoryName: 'Pantry',
      },
    ];

    const nextState = app.blank();
    nextState.ingredients = itemFixtures.map((fixture) =>
      fixture.kind === 'mixture'
        ? {
            id: fixture.id,
            name: fixture.name,
            kind: 'mixture',
            batchYield: 1_000,
            unit: 'ml',
            components: [],
          }
        : {
            id: fixture.id,
            name: fixture.name,
            kind: 'purchased',
            purchaseQty: 1,
            amountPerItem: 1,
            unit: fixture.baseUnit,
            price: 1,
          },
    );
    app.state = nextState;
    app.session = {
      user: { id: 'mobile-owner', email: 'owner@example.test' },
    };
    app.posContext = {
      loaded: true,
      loading: false,
      businessId: 'business-mobile',
      businessName: 'Matcha Luna',
      role: 'owner',
      publications: {},
      error: '',
    };
    app.stockState = {
      loaded: true,
      loading: false,
      refreshing: false,
      error: '',
      notice: '',
      sourceConflict: '',
      search: '',
      status: 'all',
      kind: 'all',
      lastUpdatedAt: Date.now(),
      items: itemFixtures.map((fixture, index) => ({
        id: `inventory-${fixture.id}`,
        sourceId: fixture.id,
        name: fixture.name,
        kind: fixture.kind,
        baseUnit: fixture.baseUnit,
        balance: fixture.balance,
        threshold: fixture.threshold,
        revision: index + 1,
        initialized: true,
        active: true,
        lastMovementAt: `2026-11-${String(index + 1).padStart(2, '0')}T04:00:00.000Z`,
        lastMovementType: index % 2 ? 'stock_in' : 'stock_count',
        categoryName: fixture.categoryName,
      })),
      transactions: Array.from({ length: 12 }, (_, index) => {
        const fixture = itemFixtures[index % itemFixtures.length];
        const delta = index % 3 === 0 ? -25 : 125;
        return {
          transactionId: `transaction-${index + 1}`,
          itemId: `inventory-${fixture.id}`,
          itemName: fixture.name,
          type: delta < 0 ? 'waste' : 'stock_in',
          delta,
          before: 1_000,
          after: 1_000 + delta,
          unit: fixture.baseUnit,
          reason:
            delta < 0
              ? 'Damaged during the busiest part of the weekend pop-up service'
              : '',
          note: 'Supplier delivery and physical count verified by the owner',
          actor: 'Mobile Owner With a Long Display Name',
          occurredAt: `2026-11-${String(index + 1).padStart(2, '0')}T05:30:00.000Z`,
          itemSequence: index + 1,
          revisionBefore: index,
          revisionAfter: index + 1,
        };
      }),
    };
    app.activateAppTab('stocks', false);
    app.renderStocks();
  });

  await expect(page.locator('section#stocks')).toHaveClass(/active/);
  await expect(page.locator('#stockVisibleCount')).toHaveText('8 of 8 items');
  const stockTable = page.getByRole('table', {
    name: 'Physical ingredient and prepared mixture inventory',
  });
  await expect(stockTable).toBeVisible();
  await expect(stockTable.getByRole('columnheader')).toHaveText([
    'Category',
    'Item name',
    'Purchased from',
    'Date purchased',
    'On hand',
    'Unit',
    'Low-stock alert',
    'Status',
    'Notes',
    'Last movement',
  ]);
  await expect(stockTable.getByRole('row')).toHaveCount(9);
  await expect(stockTable.getByRole('rowheader')).toHaveCount(8);
  await expect(stockTable.getByRole('cell')).toHaveCount(72);
  await expect(page.locator('.stock-row[data-stock-item]')).toHaveCount(8);
  await expect(page.locator('.stock-history-row')).toHaveCount(12);
  await expect(
    page
      .locator('.stock-item-name')
      .filter({
        hasText:
          'Organic Ceremonial Grade Matcha Powder From Uji Kyoto Reserve',
      }),
  ).toBeVisible();
  await expect(page.locator('.stock-row .stock-inline-input')).toHaveCount(16);
  await expect(
    page.locator('.stock-row [data-act="openStockModal"]:not([data-mode])'),
  ).toHaveCount(0);
  await expect(
    page.locator('.stock-row [data-act="openStockModal"][data-mode="details"]'),
  ).toHaveCount(0);

  const layout = await page.evaluate(() => {
    const section = document.getElementById('stocks') as HTMLElement;
    const inventory = document.querySelector('.stock-inventory') as HTMLElement;
    const table = document.querySelector('.stock-table') as HTMLElement;
    const firstRow = document.querySelector('.stock-row') as HTMLElement;
    const sectionRect = section.getBoundingClientRect();
    const contained = (() => {
      const rect = inventory.getBoundingClientRect();
      return (
        rect.left >= sectionRect.left - 1 &&
        rect.right <= sectionRect.right + 1
      );
    })();
    return {
      viewportWidth: document.documentElement.clientWidth,
      pageWidth: document.documentElement.scrollWidth,
      inventoryClientWidth: inventory.clientWidth,
      inventoryScrollWidth: inventory.scrollWidth,
      tableWidth: table.getBoundingClientRect().width,
      rowDisplay: getComputedStyle(firstRow).display,
      contained,
    };
  });

  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.inventoryScrollWidth).toBeGreaterThan(
    layout.inventoryClientWidth + 1,
  );
  expect(layout.tableWidth).toBeGreaterThan(
    layout.inventoryClientWidth + 1,
  );
  expect(layout.rowDisplay).toBe('table-row');
  expect(layout.contained).toBe(true);

  const firstRowLabels = await page
    .locator('.stock-row')
    .first()
    .locator('[data-stock-field]')
    .evaluateAll((cells) =>
      cells.map((cell) => (cell as HTMLElement).dataset.stockField),
    );
  expect(firstRowLabels).toEqual([
    'category',
    'item',
    'purchased-from',
    'stocked-on',
    'on-hand',
    'unit',
    'threshold',
    'status',
    'notes',
    'updated',
  ]);
});
