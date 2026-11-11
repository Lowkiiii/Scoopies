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
      activePeriod: {
        id: 'period-mobile',
        name: 'Mobile popup',
        status: 'open',
        openedAt: '2026-11-01T00:00:00.000Z',
      },
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
          periodId: 'period-mobile',
          openingStock: 500,
          stockAdded: 0,
          stockUsed: 0,
          wasted: 0,
          remainingStock: 500,
          purchaseQuantity: 1000,
          purchasePriceCentavos: 125000,
          costPerUnitCentavos: 125,
          remainingValueCentavos: 62500,
          stockStatus: 'OK',
          periodItemRevision: 4,
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
          periodId: 'period-mobile',
          openingStock: 300,
          stockAdded: 0,
          stockUsed: 0,
          wasted: 250,
          remainingStock: 50,
          purchaseQuantity: 1000,
          purchasePriceCentavos: 18000,
          costPerUnitCentavos: 18,
          remainingValueCentavos: 900,
          stockStatus: 'RESTOCK',
          periodItemRevision: 3,
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
          periodId: 'period-mobile',
          openingStock: 0,
          stockAdded: 0,
          stockUsed: 0,
          wasted: 0,
          remainingStock: 0,
          purchaseQuantity: 1000,
          purchasePriceCentavos: 25000,
          costPerUnitCentavos: 25,
          remainingValueCentavos: 0,
          stockStatus: 'RESTOCK',
          periodItemRevision: 2,
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
          periodId: 'period-mobile',
          openingStock: null,
          stockAdded: 0,
          stockUsed: 0,
          wasted: 0,
          remainingStock: null,
          purchaseQuantity: null,
          purchasePriceCentavos: null,
          costPerUnitCentavos: null,
          remainingValueCentavos: null,
          stockStatus: 'NOT COUNTED',
          periodItemRevision: 0,
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
    stocks.loadStocks = async () => {
      app.renderStocks();
      return true;
    };
    app.cloud = {
      connected: true,
      client: {
        rpc: async (name: string, args: any) => {
          if (name === 'pos_inventory_set_spreadsheet_cell') {
            app.__stockInlineRpcCalls.push({
              name,
              args: app.snapshot(args),
            });
            const current = app.stockState.items.find(
              (item: any) => item.id === args.p_inventory_item_id,
            );
            const factor =
              current.preferredUnit === 'kg' || current.preferredUnit === 'l'
                ? 1000
                : 1;
            const displayValue =
              args.p_value === '' ? null : Number(args.p_value);
            const baseValue =
              displayValue == null ? null : displayValue * factor;
            const propertyByColumn: Record<string, string> = {
              opening_stock: 'openingStock',
              stock_added: 'stockAdded',
              wasted_damaged: 'wasted',
              reorder_level: 'threshold',
              purchase_quantity: 'purchaseQuantity',
            };
            if (propertyByColumn[args.p_column]) {
              current[propertyByColumn[args.p_column]] = baseValue;
            } else if (args.p_column === 'purchase_price') {
              current.purchasePriceCentavos =
                displayValue == null ? null : Math.round(displayValue * 100);
            } else if (args.p_column === 'row_color') {
              current.rowColor = String(args.p_value || '');
            }
            current.remainingStock =
              current.openingStock == null
                ? null
                : Number(current.openingStock || 0) +
                  Number(current.stockAdded || 0) -
                  Number(current.stockUsed || 0) -
                  Number(current.wasted || 0);
            current.revision += 1;
            current.periodItemRevision += 1;
            return {
              data: [
                {
                  period_id: args.p_period_id,
                  inventory_item_id: args.p_inventory_item_id,
                  column_name: args.p_column,
                  saved_value: args.p_value,
                  item_revision_after: current.revision,
                  period_item_revision_after: current.periodItemRevision,
                  is_retry: false,
                },
              ],
              error: null,
            };
          }
          if (name === 'pos_inventory_update_item_details_v2') {
            app.__stockInlineRpcCalls.push({
              name,
              args: app.snapshot(args),
            });
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
          if (name === 'pos_inventory_sync_spreadsheet_sources') {
            return { data: [], error: null };
          }
          if (name === 'pos_inventory_get_transactions') {
            return { data: [], error: null };
          }
          if (name === 'pos_inventory_get_spreadsheet') {
            return {
              data: app.stockState.items.map((item: any) => ({
                active_period_id: 'period-mobile',
                active_period_name: 'Mobile popup',
                active_period_status: 'open',
                active_period_opened_at: '2026-11-01T00:00:00.000Z',
                inventory_item_id: item.id,
                source_type: item.sourceType || 'ingredient',
                source_costing_id: item.sourceId,
                source_costing_ingredient_id: item.sourceId,
                item_kind: item.kind,
                category_name: item.categoryName,
                name: item.name,
                base_unit: item.baseUnit,
                preferred_unit: item.preferredUnit || item.baseUnit,
                opening_stock_base: item.openingStock,
                stock_added_base: item.stockAdded,
                stock_used_base: item.stockUsed,
                wasted_base: item.wasted,
                remaining_stock_base: item.remainingStock,
                current_balance_base: item.remainingStock,
                low_stock_threshold_base: item.threshold,
                purchase_quantity_base: item.purchaseQuantity,
                purchase_price_centavos: item.purchasePriceCentavos,
                cost_per_unit_centavos: item.costPerUnitCentavos,
                remaining_value_centavos: item.remainingValueCentavos,
                stock_status: item.stockStatus,
                row_color: item.rowColor || null,
                revision: item.revision,
                period_item_revision: item.periodItemRevision,
                initialized: item.openingStock != null,
                active: true,
              })),
              error: null,
            };
          }
          throw new Error(`Unexpected Stocks RPC: ${name}`);
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
    name: 'Inventory period spreadsheet',
  });
  await expect(stockTable).toBeVisible();
  await expect(stockTable.getByRole('columnheader')).toHaveText([
    'Category',
    'Item',
    'Unit',
    'Opening Stock',
    'Stock Added',
    'Stock Used',
    'Wasted/Damaged',
    'Remaining Stock',
    'Reorder Level',
    'Purchase Quantity',
    'Purchase Price (₱)',
    'Cost per Unit',
    'Remaining Value (₱)',
    'Status',
  ]);
  await expect(stockTable.getByRole('row')).toHaveCount(5);
  await expect(stockTable.getByRole('rowheader')).toHaveCount(4);
  await expect(stockTable.getByRole('cell')).toHaveCount(52);
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
      'category',
      'item',
      'unit',
      'opening',
      'added',
      'used',
      'wasted',
      'remaining',
      'reorder',
      'purchase-quantity',
      'purchase-price',
      'unit-cost',
      'remaining-value',
      'status',
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

  const matchaOpening = page.locator(
    '[data-stock-item="inventory-matcha"] [data-stock-sheet-field="openingStock"]',
  );
  await expect(matchaOpening).toHaveValue('0.5');
  await expect(matchaOpening).toHaveAttribute('inputmode', 'decimal');
  await matchaOpening.fill('0.475');
  await matchaOpening.press('Escape');
  await expect(matchaOpening).toHaveValue('0.5');
  await expect.poll(() =>
    page.evaluate(() => (window as any).__stockInlineRpcCalls.length),
  ).toBe(0);

  await matchaOpening.fill('-1');
  await matchaOpening.press('Enter');
  await expect(matchaOpening).toHaveAttribute('aria-invalid', 'true');
  await expect.poll(() =>
    page.evaluate(() => (window as any).__stockInlineRpcCalls.length),
  ).toBe(0);

  await matchaOpening.fill('0.475');
  await matchaOpening.press('Enter');
  await expect(
    page.locator(
      '[data-stock-item="inventory-matcha"] [data-stock-sheet-field="openingStock"]',
    ),
  ).toHaveValue('0.475');
  await expect(page.locator('#stockModal')).toBeHidden();
  await expect.poll(() =>
    page.evaluate(() => (window as any).__stockInlineRpcCalls.length),
  ).toBe(1);
  const inlineRequest = await page.evaluate(() =>
    (window as any).__stockInlineRpcCalls[0],
  );
  expect(inlineRequest.name).toBe('pos_inventory_set_spreadsheet_cell');
  expect(inlineRequest.args).toMatchObject({
    p_business_id: 'business-mobile',
    p_period_id: 'period-mobile',
    p_inventory_item_id: 'inventory-matcha',
    p_column: 'opening_stock',
    p_value: '0.475',
    p_expected_item_revision: 4,
    p_expected_period_item_revision: 4,
  });
  expect(inlineRequest.args.p_client_mutation_id).toBeTruthy();

  const matchaReorder = page.locator(
    '[data-stock-item="inventory-matcha"] [data-stock-sheet-field="reorderLevel"]',
  );
  await matchaReorder.fill('0.07');
  await page
    .locator(
      '[data-stock-item="inventory-matcha"] [data-stock-field="remaining"]',
    )
    .click();
  await expect.poll(() =>
    page.evaluate(() => (window as any).__stockInlineRpcCalls.length),
  ).toBe(2);
  await expect(matchaReorder).toHaveValue('0.07');
  const thresholdRequest = await page.evaluate(() =>
    (window as any).__stockInlineRpcCalls[1],
  );
  expect(thresholdRequest.name).toBe('pos_inventory_set_spreadsheet_cell');
  expect(thresholdRequest.args).toMatchObject({
      p_business_id: 'business-mobile',
      p_period_id: 'period-mobile',
      p_inventory_item_id: 'inventory-matcha',
      p_column: 'reorder_level',
      p_value: '0.07',
      p_expected_item_revision: 5,
      p_expected_period_item_revision: 5,
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
      p_purchased_from: null,
      p_last_stocked_on: null,
      p_notes: null,
      p_preferred_unit: 'g',
      p_expected_revision: 6,
    },
  });
  await expect(page.locator('#stockModal')).toBeHidden();
  await expect(matchaUnit).toHaveValue('g');
  await expect(
    page.locator(
      '[data-stock-item="inventory-matcha"] [data-stock-sheet-field="openingStock"]',
    ),
  ).toHaveValue('475');
  await expect(
    page.locator(
      '[data-stock-item="inventory-matcha"] [data-stock-sheet-field="reorderLevel"]',
    ),
  ).toHaveValue('70');

  const stocksLayout = await page.evaluate(() => {
    const root = document.documentElement;
    const workspace = document.querySelector('.wrap') as HTMLElement;
    const section = document.getElementById('stocks') as HTMLElement;
    const inventory = document.querySelector('.stock-inventory') as HTMLElement;
    const sectionRect = section.getBoundingClientRect();
    const editableControls = Array.from(
      document.querySelectorAll(
        '.stock-sheet-input, .stock-cell-control',
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
    await expect(stockTable).toHaveCSS('min-width', '1780px');
  } else {
    await expect(stockTable.locator('thead')).toBeVisible();
    expect(
      stocksLayout.viewportWidth - stocksLayout.workspaceWidth,
    ).toBeLessThanOrEqual(26);
    expect(stocksLayout.inventoryScrollWidth).toBeGreaterThan(
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

test('packaging rows persist the canonical prefixed order identity', async ({
  page,
}) => {
  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    app.state.packaging = [
      { id: 'cup', name: '12oz Cup', qty: 100, price: 257 },
    ];
    app.state.stockOrder = [];
    app.stockState.items.push({
      id: 'inventory-cup',
      sourceId: 'cup',
      sourceType: 'packaging',
      name: '12oz Cup',
      kind: 'packaging',
      baseUnit: 'piece',
      preferredUnit: 'piece',
      balance: 100,
      threshold: 20,
      revision: 1,
      initialized: true,
      active: true,
      categoryName: 'Packaging',
      periodId: 'period-mobile',
      openingStock: 100,
      stockAdded: 0,
      stockUsed: 0,
      wasted: 0,
      remainingStock: 100,
      purchaseQuantity: 100,
      purchasePriceCentavos: 25700,
      costPerUnitCentavos: 257,
      remainingValueCentavos: 25700,
      stockStatus: 'OK',
      periodItemRevision: 1,
    });
    app.save = () => {};
    app.renderStocks();
  });

  const handle = page.locator(
    '[data-stock-item="inventory-cup"] .stock-drag-handle',
  );
  await expect(handle).toHaveAttribute('data-stock-order-id', 'packaging:cup');
  await expect(handle).toBeEnabled();
  await handle.focus();
  await handle.press('Home');

  const order = await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    return app.state.stockOrder;
  });
  expect(order[0]).toBe('packaging:cup');
  expect(order).toContain('matcha');
  expect(order).not.toContain('cup');
  await expect(page.locator('.stock-row[data-stock-item]').first()).toHaveAttribute(
    'data-stock-item',
    'inventory-cup',
  );
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
    const originalRpc = app.cloud.client.rpc;
    app.cloud.client.rpc = async (name: string, args: any) => {
      if (name !== 'pos_inventory_set_spreadsheet_cell') {
        return originalRpc(name, args);
      }
      app.__stockRaceCalls.push({ name, args: app.snapshot(args) });
      if (app.__stockRaceCalls.length === 1) {
        await new Promise<void>((resolve) => {
          app.__releaseFirstStockCellRpc = resolve;
        });
      }
      return originalRpc(name, args);
    };
  });

  const row = page.locator('[data-stock-item="inventory-matcha"]');
  const stockAdded = row.locator('[data-stock-sheet-field="stockAdded"]');
  await expect(row.locator('.stock-row-menu')).toHaveCount(0);

  await stockAdded.fill('0.1');
  await stockAdded.press('Enter');
  await expect.poll(() =>
    page.evaluate(() => (window as any).__stockRaceCalls.length),
  ).toBe(1);

  await stockAdded.fill('0.2');
  await stockAdded.press('Enter');
  const movementOpened = await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const stocks = app.MatchaLunaApp.domains.stocks as Record<string, any>;
    return stocks.openStockModal('inventory-matcha');
  });
  expect(movementOpened).toBe(false);
  await expect(page.locator('#stockModal')).toBeHidden();

  await page.evaluate(() => (window as any).__releaseFirstStockCellRpc());
  await expect.poll(() =>
    page.evaluate(() => (window as any).__stockRaceCalls.length),
  ).toBe(2);
  await expect(stockAdded).toHaveValue('0.2');
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
    const edit = app.stockState.spreadsheetEdits['inventory-matcha'].stockAdded;
    return {
      calls: app.__stockRaceCalls,
      itemStockAdded: item.stockAdded,
      itemRevision: item.revision,
      periodItemRevision: item.periodItemRevision,
      editValue: edit.value,
      editConfirmed: edit.confirmed,
      editStatus: edit.status,
    };
  });
  expect(result.calls.map((call: any) => call.args.p_expected_item_revision)).toEqual([
    4,
    5,
  ]);
  expect(
    result.calls.map((call: any) => call.args.p_expected_period_item_revision),
  ).toEqual([
    4,
    5,
  ]);
  expect(result.calls.map((call: any) => call.args.p_column)).toEqual([
    'stock_added',
    'stock_added',
  ]);
  expect(result.calls.map((call: any) => call.args.p_value)).toEqual(['0.1', '0.2']);
  expect(result).toMatchObject({
    itemStockAdded: 200,
    itemRevision: 6,
    periodItemRevision: 6,
    editValue: '0.2',
    editConfirmed: '0.2',
    editStatus: 'saved',
  });
});
