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
          const line = args.p_lines[0];
          const current = app.stockState.items.find(
            (item: any) => item.id === line.inventoryItemId,
          );
          return {
            data: [
              {
                transaction_id: 'inline-mobile-count',
                inventory_item_id: line.inventoryItemId,
                item_name: current.name,
                transaction_type: 'stock_count',
                quantity_delta_base: Number(line.quantity) - Number(current.balance),
                balance_before_base: Number(current.balance),
                balance_after_base: Number(line.quantity),
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
    'Item',
    'Status',
    'On hand',
    'Low-stock alert',
    'Last updated',
  ]);
  await expect(stockTable.getByRole('row')).toHaveCount(5);
  await expect(stockTable.getByRole('rowheader')).toHaveCount(4);
  await expect(stockTable.getByRole('cell')).toHaveCount(16);
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
      'status',
      'on-hand',
      'threshold',
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
  await expect(matchaCount).toHaveValue('500');
  await expect(matchaCount).toHaveAttribute('inputmode', 'decimal');
  await matchaCount.fill('475');
  await matchaCount.press('Escape');
  await expect(matchaCount).toHaveValue('500');
  await expect.poll(() =>
    page.evaluate(() => (window as any).__stockInlineRpcCalls.length),
  ).toBe(0);

  await matchaCount.fill('-1');
  await matchaCount.press('Enter');
  await expect(matchaCount).toHaveAttribute('aria-invalid', 'true');
  await expect.poll(() =>
    page.evaluate(() => (window as any).__stockInlineRpcCalls.length),
  ).toBe(0);

  await matchaCount.fill('475');
  await matchaCount.press('Enter');
  await expect(
    page.locator(
      '[data-stock-item="inventory-matcha"] [data-stock-inline-field="count"]',
    ),
  ).toHaveValue('475');
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
    quantity: 475,
    unit: 'g',
    expectedRevision: 4,
  });

  const matchaThreshold = page.locator(
    '[data-stock-item="inventory-matcha"] [data-stock-inline-field="threshold"]',
  );
  await matchaThreshold.fill('70');
  await page
    .locator(
      '[data-stock-item="inventory-matcha"] [data-stock-field="updated"]',
    )
    .click();
  await expect.poll(() =>
    page.evaluate(() => (window as any).__stockInlineRpcCalls.length),
  ).toBe(2);
  await expect(matchaThreshold).toHaveValue('70');
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

  const stocksLayout = await page.evaluate(() => {
    const root = document.documentElement;
    const section = document.getElementById('stocks') as HTMLElement;
    const inventory = document.querySelector('.stock-inventory') as HTMLElement;
    const sectionRect = section.getBoundingClientRect();
    const renderedRows = Array.from(
      document.querySelectorAll('.stock-row, .stock-history-row'),
    );
    const inlineInputs = Array.from(
      document.querySelectorAll('.stock-inline-input'),
    ) as HTMLElement[];
    return {
      viewportWidth: root.clientWidth,
      pageWidth: root.scrollWidth,
      inventoryClientWidth: inventory.clientWidth,
      inventoryScrollWidth: inventory.scrollWidth,
      rowsContained: renderedRows.every((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left >= sectionRect.left - 1 &&
          rect.right <= sectionRect.right + 1
        );
      }),
      inlineInputsHaveTouchSize: inlineInputs.every((input) => {
        const rect = input.getBoundingClientRect();
        return rect.width >= 44 && rect.height >= 44;
      }),
    };
  });
  expect(stocksLayout.pageWidth).toBeLessThanOrEqual(
    stocksLayout.viewportWidth + 1,
  );
  expect(stocksLayout.rowsContained).toBe(true);
  expect(stocksLayout.inlineInputsHaveTouchSize).toBe(true);
  if (mobileLayout) {
    expect(stocksLayout.inventoryScrollWidth).toBeLessThanOrEqual(
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
    const responsiveLabels = await page
      .locator('.stock-row')
      .first()
      .locator('[data-stock-field]:not([data-stock-field="item"])')
      .evaluateAll((cells) =>
        cells.map((cell) => ({
          label: (cell as HTMLElement).dataset.label,
          before: getComputedStyle(cell, '::before').content.replace(
            /^["']|["']$/g,
            '',
          ),
        })),
      );
    expect(responsiveLabels).toEqual([
      { label: 'Status', before: 'Status' },
      { label: 'On hand', before: 'On hand' },
      { label: 'Low-stock alert', before: 'Low-stock alert' },
      { label: 'Last updated', before: 'Last updated' },
    ]);
  } else {
    await expect(stockTable.locator('thead')).toBeVisible();
  }
});
