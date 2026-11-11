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

async function seedScrollableStocks(page: Page) {
  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const ingredients = Array.from({ length: 30 }, (_, index) => ({
      id: `sticky-ingredient-${index + 1}`,
      name: `Sticky inventory ingredient ${String(index + 1).padStart(2, '0')}`,
      kind: 'purchased',
      purchaseQty: 1,
      amountPerItem: 1_000,
      unit: 'ml',
      price: 100,
      categoryId: 'sticky-category',
    }));
    const nextState = app.blank();
    nextState.ingredientCategories = [
      { id: 'sticky-category', name: 'Sticky test category' },
    ];
    nextState.ingredients = ingredients;
    app.state = app.normalizeState(nextState);
    app.session = {
      user: { id: 'sticky-owner', email: 'owner@example.test' },
    };
    app.posContext = {
      loaded: true,
      loading: false,
      businessId: 'sticky-business',
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
      items: ingredients.map((ingredient, index) => ({
        id: `sticky-inventory-${index + 1}`,
        sourceId: ingredient.id,
        name: ingredient.name,
        kind: 'purchased',
        baseUnit: 'ml',
        preferredUnit: 'ml',
        brand: `Brand ${index + 1}`,
        categoryName: 'Sticky test category',
        purchasedFrom: 'Sticky test supplier',
        lastStockedOn: '2026-11-10',
        notes: `Stock note ${index + 1}`,
        balance: 1_000 - index * 10,
        threshold: 100,
        revision: 1,
        initialized: true,
        active: true,
        lastMovementAt: '2026-11-10T08:00:00.000Z',
        lastMovementType: 'stock_count',
      })),
      transactions: [],
    };
    const stocks = app.MatchaLunaApp.domains.stocks as Record<string, any>;
    stocks.loadStocks = async () => true;
    app.activateAppTab('stocks', false);
    app.renderStocks();
  });
  await expect(page.locator('.stock-row')).toHaveCount(30);
}

async function expectStickyGrid(page: Page) {
  const inventory = page.locator('.stock-inventory');
  await expect(inventory).toBeVisible();

  const initial = await inventory.evaluate((element) => {
    const scroller = element as HTMLElement;
    const header = scroller.querySelector(
      '.stock-table thead th[data-stock-field="item"]',
    ) as HTMLElement;
    const movingHeader = scroller.querySelector(
      '.stock-table thead th:nth-child(4)',
    ) as HTMLElement;
    const firstColumn = scroller.querySelector(
      '.stock-table tbody th[data-stock-field="item"]',
    ) as HTMLElement;
    const style = getComputedStyle(scroller);
    return {
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      scrollWidth: scroller.scrollWidth,
      clientWidth: scroller.clientWidth,
      inventoryTop: scroller.getBoundingClientRect().top,
      inventoryLeft: scroller.getBoundingClientRect().left,
      headerTop: header.getBoundingClientRect().top,
      firstColumnLeft: firstColumn.getBoundingClientRect().left,
      movingHeaderLeft: movingHeader.getBoundingClientRect().left,
    };
  });

  expect(initial.overflowX).toBe('auto');
  expect(initial.overflowY).toBe('auto');
  expect(initial.scrollHeight).toBeGreaterThan(initial.clientHeight + 1);
  expect(initial.scrollWidth).toBeGreaterThan(initial.clientWidth + 1);

  await inventory.evaluate((element) => {
    const scroller = element as HTMLElement;
    scroller.scrollTop = 260;
    scroller.scrollLeft = 280;
  });

  await expect
    .poll(() =>
      inventory.evaluate((element) => ({
        top: (element as HTMLElement).scrollTop,
        left: (element as HTMLElement).scrollLeft,
      })),
    )
    .toEqual({ top: 260, left: 280 });

  const scrolled = await inventory.evaluate((element) => {
    const scroller = element as HTMLElement;
    const header = scroller.querySelector(
      '.stock-table thead th[data-stock-field="item"]',
    ) as HTMLElement;
    const movingHeader = scroller.querySelector(
      '.stock-table thead th:nth-child(4)',
    ) as HTMLElement;
    const visibleFirstColumn = scroller.querySelectorAll(
      '.stock-table tbody th[data-stock-field="item"]',
    )[8] as HTMLElement;
    return {
      inventoryTop: scroller.getBoundingClientRect().top,
      inventoryLeft: scroller.getBoundingClientRect().left,
      headerTop: header.getBoundingClientRect().top,
      visibleFirstColumnLeft: visibleFirstColumn.getBoundingClientRect().left,
      movingHeaderLeft: movingHeader.getBoundingClientRect().left,
    };
  });

  expect(Math.abs(scrolled.headerTop - scrolled.inventoryTop)).toBeLessThanOrEqual(
    2,
  );
  expect(
    Math.abs(scrolled.visibleFirstColumnLeft - scrolled.inventoryLeft),
  ).toBeLessThanOrEqual(2);
  expect(scrolled.movingHeaderLeft).toBeLessThan(
    initial.movingHeaderLeft - 200,
  );

  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    app.renderStockResults();
  });
  await expect
    .poll(() =>
      page.locator('.stock-inventory').evaluate((element) => ({
        top: (element as HTMLElement).scrollTop,
        left: (element as HTMLElement).scrollLeft,
      })),
    )
    .toEqual({ top: 260, left: 280 });

  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    app.renderStocks();
  });
  await expect
    .poll(() =>
      page.locator('.stock-inventory').evaluate((element) => ({
        top: (element as HTMLElement).scrollTop,
        left: (element as HTMLElement).scrollLeft,
      })),
    )
    .toEqual({ top: 260, left: 280 });
}

for (const viewport of [
  { name: 'desktop', width: 900, height: 720 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`${viewport.name} Stocks grid keeps its header and first column pinned`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openTestApp(page);
    await seedScrollableStocks(page);
    await expectStickyGrid(page);
  });
}
