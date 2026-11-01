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
    app.activateAppTab('stocks', false);
    app.renderStocks();
  });
}

test.beforeEach(async ({ page }) => {
  await openTestApp(page);
  await seedPopulatedStocks(page);
});

test('populated Stocks filters and modal remain event-driven and mobile safe', async ({
  page,
}) => {
  await expect(page.locator('section#stocks')).toHaveClass(/active/);
  await expect(page.locator('#stockVisibleCount')).toHaveText('4 of 4 items');
  await expect(page.locator('.stock-grid .stock-card')).toHaveCount(4);
  await expect(page.locator('.stock-history-row')).toHaveCount(4);

  await page
    .locator('.stock-summary [data-act="setStockStatus"][data-status="low"]')
    .click();
  await expect(page.locator('#stockVisibleCount')).toHaveText('1 of 4 items');
  await expect(page.locator('[data-stock-item="inventory-oat-milk"]')).toBeVisible();

  await page
    .locator('.stock-filter-bar [data-act="setStockStatus"][data-status="all"]')
    .click();
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

  const updateMatcha = page.locator(
    '[data-stock-item="inventory-matcha"] [data-act="openStockModal"]',
  );
  await updateMatcha.focus();
  await updateMatcha.press('Enter');
  await expect(page.locator('#stockModal')).toBeVisible();
  await expect(page.locator('#stockModalTitle')).toContainText(
    'Organic Ceremonial Matcha',
  );
  await expect(page.locator('#stockQuantity')).toBeFocused();

  await page.locator('#stockAction').selectOption('waste');
  await page.locator('#stockUnit').selectOption('kg');
  await page.locator('#stockQuantity').fill('0.1');
  await page.locator('#stockReason').fill('Spilled during preparation');
  await expect(page.locator('#stockPreviewBefore')).toHaveText('500 g');
  await expect(page.locator('#stockPreviewAfter')).toHaveText('400 g');
  await expect(page.locator('[data-act="submitStockModal"]')).toBeEnabled();

  const modalLayout = await page.evaluate(() => {
    const root = document.documentElement;
    const modal = document.querySelector('#stockModal .modal') as HTMLElement;
    const rect = modal.getBoundingClientRect();
    const controls = Array.from(
      modal.querySelectorAll('button, input, select, textarea'),
    ) as HTMLElement[];
    return {
      viewportWidth: root.clientWidth,
      pageWidth: root.scrollWidth,
      modalClientWidth: modal.clientWidth,
      modalScrollWidth: modal.scrollWidth,
      modalContained: rect.left >= -1 && rect.right <= root.clientWidth + 1,
      controlsHaveSize: controls.every(
        (control) =>
          control.getBoundingClientRect().width > 0 &&
          control.getBoundingClientRect().height > 0,
      ),
    };
  });
  expect(modalLayout.pageWidth).toBeLessThanOrEqual(
    modalLayout.viewportWidth + 1,
  );
  expect(modalLayout.modalScrollWidth).toBeLessThanOrEqual(
    modalLayout.modalClientWidth + 1,
  );
  expect(modalLayout.modalContained).toBe(true);
  expect(modalLayout.controlsHaveSize).toBe(true);

  const modalClose = page.locator(
    '#stockModal [data-act="closeStockModal"]',
  ).first();
  const modalSubmit = page.locator('#stockModal [data-act="submitStockModal"]');
  await modalSubmit.focus();
  await page.keyboard.press('Tab');
  await expect(modalClose).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.locator('#stockModal')).toBeHidden();
  await expect(updateMatcha).toBeFocused();

  await updateMatcha.press('Enter');
  await expect(page.locator('#stockModal')).toBeVisible();
  await page.locator('#stockModal').click({ position: { x: 2, y: 2 } });
  await expect(page.locator('#stockModal')).toBeHidden();
  await expect(updateMatcha).toBeFocused();

  const stocksLayout = await page.evaluate(() => {
    const root = document.documentElement;
    const section = document.getElementById('stocks') as HTMLElement;
    const sectionRect = section.getBoundingClientRect();
    const renderedRows = Array.from(
      document.querySelectorAll('.stock-card, .stock-history-row'),
    );
    return {
      viewportWidth: root.clientWidth,
      pageWidth: root.scrollWidth,
      rowsContained: renderedRows.every((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left >= sectionRect.left - 1 &&
          rect.right <= sectionRect.right + 1
        );
      }),
      updateButtonWidth: (
        document.querySelector(
          '[data-stock-item="inventory-matcha"] [data-act="openStockModal"]',
        ) as HTMLElement
      ).getBoundingClientRect().width,
    };
  });
  expect(stocksLayout.pageWidth).toBeLessThanOrEqual(
    stocksLayout.viewportWidth + 1,
  );
  expect(stocksLayout.rowsContained).toBe(true);
  expect(stocksLayout.updateButtonWidth).toBeGreaterThan(0);
});
