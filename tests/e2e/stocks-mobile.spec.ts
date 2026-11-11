import { expect, test, type Page } from '@playwright/test';

async function openTestApp(page: Page) {
  await page.route(
    /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/,
    async (route) => {
      await route.fulfill({
        contentType: 'application/javascript',
        body: 'window.supabase={createClient:function(){throw new Error("Supabase is disabled in browser tests");}};',
      });
    },
  );
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

async function seedPopulatedStocks(page: Page) {
  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const ingredients = [
      {
        id: 'matcha',
        name: 'Organic Ceremonial Matcha Powder From Uji Kyoto Reserve',
        kind: 'purchased',
        purchaseQty: 1,
        amountPerItem: 1,
        unit: 'g',
        price: 1,
        categoryId: 'powders',
      },
      {
        id: 'oat-milk',
        name: 'Oatside Barista Blend Oat Milk One Liter Carton',
        kind: 'purchased',
        purchaseQty: 1,
        amountPerItem: 1,
        unit: 'ml',
        price: 1,
        categoryId: 'milk',
      },
      {
        id: 'sea-salt-cream',
        name: 'Sea Salt Cream Prepared Batch For Weekend Service',
        kind: 'mixture',
        batchYield: 1_000,
        unit: 'ml',
        components: [],
        categoryId: 'mixtures',
      },
      {
        id: 'vanilla',
        name: 'Madagascar Vanilla Syrup Awaiting Its First Physical Count',
        kind: 'purchased',
        purchaseQty: 1,
        amountPerItem: 1,
        unit: 'ml',
        price: 1,
        categoryId: 'syrups',
      },
    ];
    const nextState = app.blank();
    nextState.ingredientCategories = [
      { id: 'powders', name: 'Tea Powders' },
      { id: 'milk', name: 'Milk and Shelf Stable Beverages' },
      { id: 'mixtures', name: 'Prepared Cream and Foam Mixtures' },
      { id: 'syrups', name: 'Syrups' },
    ];
    nextState.ingredients = ingredients;
    app.state = app.normalizeState(nextState);
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
    app.stockModal = app.freshStockModal();
    app.stockModalReturnFocus = null;
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
      items: [
        {
          id: 'inventory-matcha',
          sourceId: 'matcha',
          name: ingredients[0].name,
          kind: 'purchased',
          baseUnit: 'g',
          preferredUnit: 'kg',
          brand: 'Uji Reserve',
          purchasedFrom: 'Tea supplier',
          lastStockedOn: '2026-11-01',
          notes: 'Keep sealed and dry',
          balance: 500,
          threshold: 100,
          revision: 4,
          initialized: true,
          active: true,
          lastMovementAt: '2026-11-02T04:00:00.000Z',
          lastMovementType: 'stock_count',
          categoryName: 'Tea Powders',
        },
        {
          id: 'inventory-oat-milk',
          sourceId: 'oat-milk',
          name: ingredients[1].name,
          kind: 'purchased',
          baseUnit: 'ml',
          balance: 50,
          threshold: 100,
          revision: 3,
          initialized: true,
          active: true,
          lastMovementAt: '2026-11-02T04:10:00.000Z',
          lastMovementType: 'waste',
          categoryName: 'Milk and Shelf Stable Beverages',
        },
        {
          id: 'inventory-sea-salt-cream',
          sourceId: 'sea-salt-cream',
          name: ingredients[2].name,
          kind: 'mixture',
          baseUnit: 'ml',
          balance: 0,
          threshold: 50,
          revision: 2,
          initialized: true,
          active: true,
          lastMovementAt: '2026-11-02T04:20:00.000Z',
          lastMovementType: 'stock_count',
          categoryName: 'Prepared Cream and Foam Mixtures',
        },
        {
          id: 'inventory-vanilla',
          sourceId: 'vanilla',
          name: ingredients[3].name,
          kind: 'purchased',
          baseUnit: 'ml',
          balance: 0,
          threshold: null,
          revision: 1,
          initialized: false,
          active: true,
          lastMovementAt: null,
          lastMovementType: '',
          categoryName: 'Syrups',
        },
      ],
      transactions: [
        {
          transactionId: 'movement-4',
          itemId: 'inventory-oat-milk',
          itemName: ingredients[1].name,
          type: 'waste',
          delta: -250,
          before: 300,
          after: 50,
          unit: 'ml',
          reason: 'Spilled during the busiest part of weekend service',
          note: 'Physical amount checked by the shift owner',
          actor: 'Mobile Owner With A Long Display Name',
          occurredAt: '2026-11-02T04:10:00.000Z',
          itemSequence: 2,
          revisionBefore: 2,
          revisionAfter: 3,
        },
        {
          transactionId: 'movement-3',
          itemId: 'inventory-matcha',
          itemName: ingredients[0].name,
          type: 'stock_count',
          delta: 500,
          before: 0,
          after: 500,
          unit: 'g',
          reason: '',
          note: 'Opening count before service',
          actor: 'Mobile Owner With A Long Display Name',
          occurredAt: '2026-11-02T04:00:00.000Z',
          itemSequence: 1,
          revisionBefore: 3,
          revisionAfter: 4,
        },
        {
          transactionId: 'movement-2',
          itemId: 'inventory-sea-salt-cream',
          itemName: ingredients[2].name,
          type: 'stock_count',
          delta: 0,
          before: 0,
          after: 0,
          unit: 'ml',
          reason: '',
          note: 'Batch container physically empty',
          actor: 'Mobile Owner With A Long Display Name',
          occurredAt: '2026-11-02T03:50:00.000Z',
          itemSequence: 2,
          revisionBefore: 1,
          revisionAfter: 2,
        },
        {
          transactionId: 'movement-1',
          itemId: 'inventory-oat-milk',
          itemName: ingredients[1].name,
          type: 'stock_count',
          delta: 300,
          before: 0,
          after: 300,
          unit: 'ml',
          reason: '',
          note: 'Opening count before service',
          actor: 'Mobile Owner With A Long Display Name',
          occurredAt: '2026-11-02T03:40:00.000Z',
          itemSequence: 1,
          revisionBefore: 1,
          revisionAfter: 2,
        },
      ],
    };
    const stocks = app.MatchaLunaApp.domains.stocks as Record<string, any>;
    app.__stockInlineRpcCalls = [];
    stocks.loadStocks = async () => true;
    app.cloud = {
      connected: true,
      client: {
        rpc: async (name: string, args: any) => {
          app.__stockInlineRpcCalls.push({
            name,
            args: app.snapshot(args),
          });
          if (name === 'pos_inventory_set_threshold') {
            return {
              data: [
                {
                  inventory_item_id: args.p_inventory_item_id,
                  low_stock_threshold_base: args.p_threshold_base,
                  revision: Number(args.p_expected_revision) + 1,
                  active: true,
                },
              ],
              error: null,
            };
          }
          if (name === 'pos_inventory_update_item_details_v2') {
            return {
              data: [
                {
                  inventory_item_id: args.p_inventory_item_id,
                  purchased_from: args.p_purchased_from,
                  last_stocked_on: args.p_last_stocked_on,
                  notes: args.p_notes,
                  preferred_unit: args.p_preferred_unit,
                  active: true,
                  revision: Number(args.p_expected_revision) + 1,
                },
              ],
              error: null,
            };
          }
          const line = args.p_lines[0];
          const current = app.stockState.items.find(
            (item: any) => item.id === line.inventoryItemId,
          );
          const factor =
            line.unit === 'kg' || line.unit === 'l' ? 1000 : 1;
          const balanceAfter = Number(line.quantity) * factor;
          return {
            data: [
              {
                transaction_id: 'inline-mobile-count',
                inventory_item_id: line.inventoryItemId,
                item_name: current.name,
                transaction_type: 'stock_count',
                quantity_delta_base: balanceAfter - Number(current.balance),
                balance_before_base: Number(current.balance),
                balance_after_base: balanceAfter,
                base_unit: current.baseUnit,
                item_revision: Number(line.expectedRevision) + 1,
                occurred_at: '2026-11-05T08:00:00.000Z',
              },
            ],
            error: null,
          };
        },
      },
    };
    app.activateAppTab('stocks', false);
    app.renderStocks();
  });
}

test.beforeEach(async ({ page }) => {
  await openTestApp(page);
  await seedPopulatedStocks(page);
});

test('populated Stocks spreadsheet remains event-driven and mobile safe', async ({
  page,
}) => {
  if ((page.viewportSize()?.width || 0) > 700) {
    await page.setViewportSize({ width: 1366, height: 900 });
  }
  const mobileLayout = (page.viewportSize()?.width || 0) <= 700;
  await expect(page.locator('section#stocks')).toHaveClass(/active/);
  await expect(page.locator('#stockVisibleCount')).toHaveText('4 of 4 items');
  await expect(page.locator('#stockVisibleCount')).toHaveAttribute(
    'aria-live',
    'polite',
  );
  const stockTable = page.getByRole('table', {
    name: 'Physical ingredient and prepared mixture inventory',
  });
  await expect(stockTable).toBeVisible();
  await expect(stockTable.getByRole('columnheader')).toHaveText([
    'Item name',
    'Category',
    'Purchased from',
    'Date purchased',
    'On hand',
    'Unit',
    'Low-stock alert',
    'Status',
    'Notes',
    'Last movement',
  ]);
  await expect(stockTable.getByRole('row')).toHaveCount(5);
  await expect(stockTable.getByRole('rowheader')).toHaveCount(4);
  await expect(stockTable.getByRole('cell')).toHaveCount(36);
  await expect(page.locator('.stock-row[data-stock-item]')).toHaveCount(4);
  expect(
    await page.locator('.stock-row').evaluateAll((rows) =>
      rows.map((row) =>
        Array.from(row.querySelectorAll<HTMLElement>('[data-stock-field]')).map(
          (cell) => cell.dataset.stockField,
        ),
      ),
    ),
  ).toEqual(
    Array.from({ length: 4 }, () => [
      'item',
      'category',
      'purchased-from',
      'stocked-on',
      'on-hand',
      'unit',
      'threshold',
      'status',
      'notes',
      'updated',
    ]),
  );
  await expect(page.locator('.stock-history-row')).toHaveCount(4);

  const summaryLow = page.locator(
    '.stock-summary [data-act="setStockStatus"][data-status="low"]',
  );
  const summaryAll = page.locator(
    '.stock-summary [data-act="setStockStatus"][data-status="all"]',
  );
  await expect(summaryLow).toHaveAttribute('aria-pressed', 'false');
  await expect(summaryAll).toHaveAttribute('aria-pressed', 'true');
  await summaryLow.click();
  await expect(page.locator('#stockVisibleCount')).toHaveText('1 of 4 items');
  await expect(page.locator('[data-stock-item="inventory-oat-milk"]')).toBeVisible();
  await expect(summaryLow).toHaveAttribute('aria-pressed', 'true');
  await expect(summaryAll).toHaveAttribute('aria-pressed', 'false');

  const filterAll = page.locator(
    '.stock-filter-bar [data-act="setStockStatus"][data-status="all"]',
  );
  await filterAll.click();
  await expect(filterAll).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#stockSearch').fill('vanilla');
  await expect(page.locator('#stockVisibleCount')).toHaveText('1 of 4 items');
  await expect(page.locator('[data-stock-item="inventory-vanilla"]')).toBeVisible();

  await page.locator('#stockSearch').fill('');
  await page.locator('#stockKindFilter').selectOption('mixture');
  await expect(page.locator('#stockVisibleCount')).toHaveText('1 of 4 items');
  await expect(
    page.locator('[data-stock-item="inventory-sea-salt-cream"]'),
  ).toBeVisible();
  await page.locator('#stockKindFilter').selectOption('all');
  await expect(page.locator('#stockVisibleCount')).toHaveText('4 of 4 items');

  const matchaCount = page.locator(
    '[data-stock-item="inventory-matcha"] [data-stock-inline-field="count"]',
  );
  await expect(matchaCount).toHaveValue('0.5');
  await expect(matchaCount).toHaveAttribute('inputmode', 'decimal');
  await matchaCount.fill('0.475');
  await matchaCount.press('Escape');
  await expect(matchaCount).toHaveValue('0.5');
  await expect.poll(() =>
    page.evaluate(() => (window as any).__stockInlineRpcCalls.length),
  ).toBe(0);

  await matchaCount.fill('-1');
  await matchaCount.press('Enter');
  await expect(matchaCount).toHaveAttribute('aria-invalid', 'true');
  await expect.poll(() =>
    page.evaluate(() => (window as any).__stockInlineRpcCalls.length),
  ).toBe(0);

  await matchaCount.fill('0.475');
  await matchaCount.press('Enter');
  await expect(
    page.locator(
      '[data-stock-item="inventory-matcha"] [data-stock-inline-field="count"]',
    ),
  ).toHaveValue('0.475');
  await expect(page.locator('#stockModal')).toBeHidden();
  await expect.poll(() =>
    page.evaluate(() => (window as any).__stockInlineRpcCalls.length),
  ).toBe(1);
  const inlineRequest = await page.evaluate(() =>
    (window as any).__stockInlineRpcCalls[0],
  );
  expect(inlineRequest.name).toBe('pos_inventory_record_transaction');
  expect(inlineRequest.args.p_transaction_type).toBe('stock_count');
  expect(inlineRequest.args.p_lines[0]).toMatchObject({
    inventoryItemId: 'inventory-matcha',
    quantity: 0.475,
    unit: 'kg',
    expectedRevision: 4,
  });

  const matchaThreshold = page.locator(
    '[data-stock-item="inventory-matcha"] [data-stock-inline-field="threshold"]',
  );
  await matchaThreshold.fill('0.07');
  await page
    .locator(
      '[data-stock-item="inventory-matcha"] [data-stock-field="updated"]',
    )
    .click();
  await expect.poll(() =>
    page.evaluate(() => (window as any).__stockInlineRpcCalls.length),
  ).toBe(2);
  await expect(matchaThreshold).toHaveValue('0.07');
  const thresholdRequest = await page.evaluate(() =>
    (window as any).__stockInlineRpcCalls[1],
  );
  expect(thresholdRequest).toEqual({
    name: 'pos_inventory_set_threshold',
    args: {
      p_business_id: 'business-mobile',
      p_inventory_item_id: 'inventory-matcha',
      p_threshold_base: 70,
      p_expected_revision: 5,
    },
  });

  const matchaCategory = page.locator(
    '[data-stock-item="inventory-matcha"] [data-field="categoryId"]',
  );
  const matchaUnit = page.locator(
    '[data-stock-item="inventory-matcha"] [data-stock-cell-field="preferredUnit"]',
  );
  await expect(matchaCategory).toHaveValue('powders');
  await matchaCategory.selectOption('milk');
  await expect(matchaCategory).toHaveValue('milk');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).state.ingredients.find(
          (ingredient: any) => ingredient.id === 'matcha',
        ).categoryId,
      ),
    )
    .toBe('milk');
  await page.locator('#stockSearch').fill('Milk and Shelf Stable Beverages');
  await expect(
    page.locator('[data-stock-item="inventory-matcha"]'),
  ).toBeVisible();
  await page.locator('#stockSearch').fill('');

  await matchaUnit.selectOption('g');
  await expect.poll(() =>
    page.evaluate(() => (window as any).__stockInlineRpcCalls.length),
  ).toBe(3);
  const unitRequest = await page.evaluate(() =>
    (window as any).__stockInlineRpcCalls[2],
  );
  expect(unitRequest).toEqual({
    name: 'pos_inventory_update_item_details_v2',
    args: {
      p_business_id: 'business-mobile',
      p_inventory_item_id: 'inventory-matcha',
      p_purchased_from: 'Tea supplier',
      p_last_stocked_on: '2026-11-01',
      p_notes: 'Keep sealed and dry',
      p_preferred_unit: 'g',
      p_expected_revision: 6,
    },
  });
  await expect(page.locator('#stockModal')).toBeHidden();
  await expect(matchaUnit).toHaveValue('g');
  await expect(
    page.locator(
      '[data-stock-item="inventory-matcha"] [data-stock-inline-field="count"]',
    ),
  ).toHaveValue('475');
  await expect(
    page.locator(
      '[data-stock-item="inventory-matcha"] [data-stock-inline-field="threshold"]',
    ),
  ).toHaveValue('70');

  const purchasedFrom = page.locator(
    '[data-stock-item="inventory-matcha"] [data-stock-cell-field="purchasedFrom"]',
  );
  await purchasedFrom.fill('New tea supplier');
  await purchasedFrom.press('Tab');
  await expect.poll(() =>
    page.evaluate(() => (window as any).__stockInlineRpcCalls.length),
  ).toBe(4);
  await expect(purchasedFrom).toHaveValue('New tea supplier');
  await expect(
    page.locator(
      '[data-stock-item="inventory-matcha"] [data-stock-cell-field="lastStockedOn"]',
    ),
  ).toBeFocused();
  const supplierRequest = await page.evaluate(() =>
    (window as any).__stockInlineRpcCalls[3],
  );
  expect(supplierRequest).toEqual({
    name: 'pos_inventory_update_item_details_v2',
    args: {
      p_business_id: 'business-mobile',
      p_inventory_item_id: 'inventory-matcha',
      p_purchased_from: 'New tea supplier',
      p_last_stocked_on: '2026-11-01',
      p_notes: 'Keep sealed and dry',
      p_preferred_unit: 'g',
      p_expected_revision: 7,
    },
  });

  const stocksLayout = await page.evaluate(() => {
    const root = document.documentElement;
    const workspace = document.querySelector('.wrap') as HTMLElement;
    const section = document.getElementById('stocks') as HTMLElement;
    const inventory = document.querySelector('.stock-inventory') as HTMLElement;
    const sectionRect = section.getBoundingClientRect();
    const editableControls = Array.from(
      document.querySelectorAll(
        '.stock-inline-input, .stock-cell-control',
      ),
    ) as HTMLElement[];
    return {
      viewportWidth: root.clientWidth,
      pageWidth: root.scrollWidth,
      workspaceWidth: workspace.getBoundingClientRect().width,
      inventoryClientWidth: inventory.clientWidth,
      inventoryScrollWidth: inventory.scrollWidth,
      inventoryContained: (() => {
        const rect = inventory.getBoundingClientRect();
        return (
          rect.left >= sectionRect.left - 1 &&
          rect.right <= sectionRect.right + 1
        );
      })(),
      headerVisible:
        getComputedStyle(document.querySelector('.stock-table thead') as Element)
          .display !== 'none',
      editableControlsHaveTouchSize: editableControls.every((control) => {
        const rect = control.getBoundingClientRect();
        return rect.width >= 44 && rect.height >= 44;
      }),
      dragHandles: Array.from(
        document.querySelectorAll('.stock-drag-handle'),
      ).map((control) => {
        const rect = control.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          touchAction: getComputedStyle(control).touchAction,
        };
      }),
    };
  });
  expect(stocksLayout.pageWidth).toBeLessThanOrEqual(
    stocksLayout.viewportWidth + 1,
  );
  expect(stocksLayout.inventoryContained).toBe(true);
  expect(stocksLayout.headerVisible).toBe(true);
  if (mobileLayout) {
    expect(stocksLayout.editableControlsHaveTouchSize).toBe(true);
    expect(
      stocksLayout.dragHandles.every(
        ({ width, height, touchAction }) =>
          width >= 44 && height >= 44 && touchAction === 'none',
      ),
    ).toBe(true);
    expect(stocksLayout.inventoryScrollWidth).toBeGreaterThan(
      stocksLayout.inventoryClientWidth + 1,
    );
    const mobileControlSizes = await page
      .locator(
        '#stocks [data-act="refreshStocks"], #stockSearch, #stockKindFilter, .stock-filter-bar [data-act="setStockStatus"]',
      )
      .evaluateAll((controls) =>
        controls.map((control) => {
          const rect = control.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }),
      );
    expect(mobileControlSizes.length).toBeGreaterThan(0);
    expect(
      mobileControlSizes.every(
        ({ width, height }) => width >= 44 && height >= 44,
      ),
    ).toBe(true);
    await expect(stockTable.locator('thead')).toBeVisible();
    await expect(stockTable).toHaveCSS('min-width', '1160px');
  } else {
    await expect(stockTable.locator('thead')).toBeVisible();
    expect(
      stocksLayout.viewportWidth - stocksLayout.workspaceWidth,
    ).toBeLessThanOrEqual(26);
    expect(stocksLayout.inventoryScrollWidth).toBeLessThanOrEqual(
      stocksLayout.inventoryClientWidth + 1,
    );
  }
});

test('owner can drag stock rows without changing quantities or movement history', async ({
  page,
}) => {
  const before = await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    app.__stockOrderSaveCalls = 0;
    app.save = () => { app.__stockOrderSaveCalls += 1; };
    return {
      items: app.snapshot(app.stockState.items),
      transactions: app.snapshot(app.stockState.transactions),
    };
  });

  const source = page.locator(
    '[data-stock-item="inventory-matcha"] .stock-drag-handle',
  );
  const target = page.locator('[data-stock-item="inventory-vanilla"]');
  await expect(source).toHaveAttribute(
    'aria-label',
    /Move Organic Ceremonial Matcha Powder/,
  );
  await source.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(
    sourceBox!.x + sourceBox!.width / 2,
    sourceBox!.y + sourceBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox!.x + Math.min(24, targetBox!.width / 2),
    targetBox!.y + 4,
    { steps: 8 },
  );
  expect(
    await page.evaluate(() => {
      const app = window as typeof window & Record<string, any>;
      return app.appIsEditing();
    }),
  ).toBe(true);
  await page.mouse.up();

  await expect(page.locator('.stock-row[data-stock-item]').nth(2)).toHaveAttribute(
    'data-stock-item',
    'inventory-matcha',
  );
  const after = await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    return {
      order: app.state.stockOrder,
      saveCalls: app.__stockOrderSaveCalls,
      rpcCalls: app.__stockInlineRpcCalls,
      items: app.stockState.items,
      transactions: app.stockState.transactions,
      dragging: document.body.classList.contains('stock-row-reordering'),
      indicators: document.querySelectorAll(
        '.stock-row-dragging,.stock-row-drop-before,.stock-row-drop-after',
      ).length,
    };
  });
  expect(after.order).toEqual([
    'sea-salt-cream',
    'oat-milk',
    'matcha',
    'vanilla',
  ]);
  expect(after.saveCalls).toBe(1);
  expect(after.rpcCalls).toEqual([]);
  expect(after.items).toEqual(before.items);
  expect(after.transactions).toEqual(before.transactions);
  expect(after.dragging).toBe(false);
  expect(after.indicators).toBe(0);
});

test('keyboard row arranging persists source order and respects filters and roles', async ({
  page,
}) => {
  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    app.__stockOrderSaveCalls = 0;
    app.save = () => { app.__stockOrderSaveCalls += 1; };
  });
  const matchaHandle = page.locator(
    '[data-stock-item="inventory-matcha"] .stock-drag-handle',
  );
  await matchaHandle.focus();
  await matchaHandle.press('Home');
  await expect(page.locator('.stock-row[data-stock-item]').first()).toHaveAttribute(
    'data-stock-item',
    'inventory-matcha',
  );
  await expect(page.locator('#stockOrderStatus')).toContainText(
    'moved',
    { ignoreCase: true },
  );
  await expect(
    page.locator(
      '[data-stock-item="inventory-matcha"] .stock-drag-handle',
    ),
  ).toBeFocused();
  const persisted = await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    return {
      order: app.state.stockOrder,
      normalized: app.normalizeState(app.snapshot(app.state)).stockOrder,
      saveCalls: app.__stockOrderSaveCalls,
    };
  });
  expect(persisted.order).toEqual([
    'matcha',
    'sea-salt-cream',
    'oat-milk',
    'vanilla',
  ]);
  expect(persisted.normalized).toEqual(persisted.order);
  expect(persisted.saveCalls).toBe(1);

  const rebuiltOrder = await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    app.stockState.items = app.stockState.items.map((item: any) => ({
      ...item,
      id: 'rebuilt-' + item.id,
    }));
    app.renderStocks();
    return Array.from(
      document.querySelectorAll<HTMLElement>('[data-stock-order-id]'),
      (element) => element.dataset.stockOrderId,
    ).filter((id, index, ids) => id && ids.indexOf(id) === index);
  });
  expect(rebuiltOrder).toEqual([
    'matcha',
    'sea-salt-cream',
    'oat-milk',
    'vanilla',
  ]);

  await page
    .locator(
      '.stock-summary [data-act="setStockStatus"][data-status="low"]',
    )
    .click();
  const filteredHandle = page.locator('.stock-drag-handle');
  await expect(filteredHandle).toHaveCount(1);
  await expect(filteredHandle).toBeDisabled();
  await expect(filteredHandle).toHaveAttribute(
    'title',
    'Clear the search and filters before arranging rows',
  );

  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    app.posContext.role = 'cashier';
    app.stockState.status = 'all';
    app.renderStocks();
  });
  await expect(page.locator('.stock-drag-handle')).toHaveCount(0);
});

test('manual order ignores blank duplicate and stale saved identifiers', async ({
  page,
}) => {
  const order = await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    app.state.stockOrder = [
      'vanilla',
      '',
      'vanilla',
      'removed-source',
      'oat-milk',
    ];
    app.renderStocks();
    return Array.from(
      document.querySelectorAll<HTMLElement>('.stock-row[data-stock-order-id]'),
      (row) => row.dataset.stockOrderId,
    );
  });
  expect(order).toEqual([
    'vanilla',
    'oat-milk',
    'sea-salt-cream',
    'matcha',
  ]);
});

test('rapid spreadsheet edits serialize and movement waits for the active save', async ({
  page,
}) => {
  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    app.__stockRaceCalls = [];
    app.__releaseFirstStockCellRpc = null;
    app.cloud.client.rpc = async (name: string, args: any) => {
      app.__stockRaceCalls.push({ name, args: app.snapshot(args) });
      if (name !== 'pos_inventory_update_item_details_v2') {
        throw new Error(`Unexpected RPC during rapid edit: ${name}`);
      }
      if (app.__stockRaceCalls.length === 1) {
        await new Promise<void>((resolve) => {
          app.__releaseFirstStockCellRpc = resolve;
        });
      }
      return {
        data: [
          {
            inventory_item_id: args.p_inventory_item_id,
            purchased_from: args.p_purchased_from,
            last_stocked_on: args.p_last_stocked_on,
            notes: args.p_notes,
            preferred_unit: args.p_preferred_unit,
            active: true,
            revision: Number(args.p_expected_revision) + 1,
          },
        ],
        error: null,
      };
    };
  });

  const row = page.locator('[data-stock-item="inventory-matcha"]');
  const supplier = row.locator('[data-stock-cell-field="purchasedFrom"]');
  const movementMenu = row.locator('.stock-row-menu');

  await supplier.fill('First pending supplier');
  await supplier.press('Enter');
  await expect.poll(() =>
    page.evaluate(() => (window as any).__stockRaceCalls.length),
  ).toBe(1);

  await supplier.fill('Final rapid supplier');
  await supplier.press('Enter');
  await movementMenu.click();
  await expect(page.locator('#stockModal')).toBeHidden();

  await page.evaluate(() => (window as any).__releaseFirstStockCellRpc());
  await expect.poll(() =>
    page.evaluate(() => (window as any).__stockRaceCalls.length),
  ).toBe(2);
  await expect(supplier).toHaveValue('Final rapid supplier');
  await expect
    .poll(() =>
      page.evaluate(() => Boolean((window as any).stockState.inlineMutationChain)),
    )
    .toBe(false);

  const result = await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const item = app.stockState.items.find(
      (candidate: any) => candidate.id === 'inventory-matcha',
    );
    const edit = app.stockState.cellEdits['inventory-matcha'].purchasedFrom;
    return {
      calls: app.__stockRaceCalls,
      itemPurchasedFrom: item.purchasedFrom,
      itemRevision: item.revision,
      editValue: edit.value,
      editConfirmed: edit.confirmed,
      editStatus: edit.status,
    };
  });
  expect(result.calls.map((call: any) => call.args.p_expected_revision)).toEqual([
    4,
    5,
  ]);
  expect(result.calls.map((call: any) => call.args.p_purchased_from)).toEqual([
    'First pending supplier',
    'Final rapid supplier',
  ]);
  expect(result).toMatchObject({
    itemPurchasedFrom: 'Final rapid supplier',
    itemRevision: 6,
    editValue: 'Final rapid supplier',
    editConfirmed: 'Final rapid supplier',
    editStatus: 'saved',
  });
});
