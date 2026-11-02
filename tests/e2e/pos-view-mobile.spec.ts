import { expect, test, type Page } from '@playwright/test';

async function openSeededPos(page: Page) {
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

  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const snapshotStorage = (storage: Storage) =>
      Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .filter((key): key is string => key !== null)
        .sort()
        .map((key) => [key, storage.getItem(key)]);
    const directIo = {
      fetchCalls: [] as string[],
      cloudCalls: [] as string[],
      storageCalls: [] as string[],
      guardErrors: [] as string[],
      fetchGuardInstalled: false,
      storageGuardsInstalled: 0,
      storageGuardMethods: [] as string[],
      cloudBoundariesInstalled: 0,
      cloudBoundaryLabels: [] as string[],
    };
    app.__posViewMobileDirectIo = directIo;

    const requestLabel = (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const method =
        init?.method || (input instanceof Request ? input.method : 'GET');
      return `${method.toUpperCase()} ${url}`;
    };
    try {
      window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const label = requestLabel(input, init);
        directIo.fetchCalls.push(label);
        return Promise.reject(
          new Error(`Direct fetch is blocked during POS rendering: ${label}`),
        );
      }) as typeof window.fetch;
      directIo.fetchGuardInstalled = true;
    } catch (error) {
      directIo.guardErrors.push(
        `window.fetch: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const storagePrototype = Storage.prototype as unknown as Record<
      string,
      (...args: string[]) => void
    >;
    (['setItem', 'removeItem', 'clear'] as const).forEach((method) => {
      try {
        Object.defineProperty(storagePrototype, method, {
          configurable: true,
          enumerable: false,
          writable: true,
          value: function guardedStorageMutation(
            this: Storage,
            ...args: string[]
          ) {
            const area =
              this === localStorage
                ? 'localStorage'
                : this === sessionStorage
                  ? 'sessionStorage'
                  : 'Storage';
            const key = args.length ? `(${JSON.stringify(args[0])})` : '()';
            directIo.storageCalls.push(`${area}.${method}${key}`);
          },
        });
        directIo.storageGuardsInstalled += 1;
        directIo.storageGuardMethods.push(method);
      } catch (error) {
        directIo.guardErrors.push(
          `Storage.${method}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    });

    const guardCloudBoundary = (
      target: Record<string, any> | null | undefined,
      method: string,
      label: string,
    ) => {
      if (!target || typeof target[method] !== 'function') return;
      try {
        Object.defineProperty(target, method, {
          configurable: true,
          enumerable: true,
          writable: true,
          value: (...args: unknown[]) => {
            const detail =
              typeof args[0] === 'string' ? `(${args[0]})` : '()';
            directIo.cloudCalls.push(`${label}${detail}`);
            throw new Error(`${label} is blocked during read-only POS rendering`);
          },
        });
        directIo.cloudBoundariesInstalled += 1;
        directIo.cloudBoundaryLabels.push(label);
      } catch (error) {
        directIo.guardErrors.push(
          `${label}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };
    const guardedCloudClient = {
      rpc() {
        throw new Error('The seeded cloud RPC guard was not installed');
      },
      from() {
        throw new Error('The seeded cloud query guard was not installed');
      },
      storage: {
        from() {
          throw new Error('The seeded cloud storage guard was not installed');
        },
      },
    };
    if (!app.cloud || typeof app.cloud !== 'object') app.cloud = {};
    app.cloud.client = guardedCloudClient;
    const cloudClients = [app.cloud.client, app.supabaseClient].filter(
      (client, index, clients) =>
        client && typeof client === 'object' && clients.indexOf(client) === index,
    );
    cloudClients.forEach((client, index) => {
      const label = `cloudClient[${index}]`;
      guardCloudBoundary(client, 'rpc', `${label}.rpc`);
      guardCloudBoundary(client, 'from', `${label}.from`);
      guardCloudBoundary(client.storage, 'from', `${label}.storage.from`);
    });

    const matchaUpgrades = [
      {
        id: 'upgrade-wakatake',
        revision: 2,
        code: 'wakatake',
        display_name: 'Marukyu Koyamaen - Wakatake',
        surcharge_centavos: 7_000,
        sort_order: 10,
      },
      {
        id: 'upgrade-aya-no-mori',
        revision: 3,
        code: 'aya-no-mori',
        display_name: 'Kanbayashi Shunsho - Aya no Mori',
        surcharge_centavos: 8_000,
        sort_order: 20,
      },
    ];
    const catalog = [
      {
        product_id: 'drink-matcha-latte',
        active_version_id: 'version-matcha-latte-12oz',
        category_name: 'Matcha',
        product_name: 'Matcha Latte',
        size_snapshot: '12oz',
        selling_price_centavos: 17_000,
        image_object_path: null,
        matcha_upgrades: matchaUpgrades,
      },
      {
        product_id: 'drink-sea-salt-matcha',
        active_version_id: 'version-sea-salt-matcha-12oz',
        category_name: 'Matcha',
        product_name: 'Sea Salt Cream Matcha',
        size_snapshot: '12oz',
        selling_price_centavos: 19_000,
        image_object_path: null,
        matcha_upgrades: matchaUpgrades,
      },
      {
        product_id: 'drink-coconut-matcha',
        active_version_id: 'version-coconut-matcha-12oz',
        category_name: 'Matcha',
        product_name: 'Coconut Matcha Cloud',
        size_snapshot: '12oz',
        selling_price_centavos: 18_000,
        image_object_path: null,
        matcha_upgrades: matchaUpgrades,
      },
      {
        product_id: 'drink-hojicha-latte',
        active_version_id: 'version-hojicha-latte-12oz',
        category_name: 'Hojicha',
        product_name: 'Hojicha Latte',
        size_snapshot: '12oz',
        selling_price_centavos: 17_000,
        image_object_path: null,
        matcha_upgrades: [],
      },
      {
        product_id: 'drink-sea-salt-hojicha',
        active_version_id: 'version-sea-salt-hojicha-12oz',
        category_name: 'Hojicha',
        product_name: 'Sea Salt Hojicha Latte',
        size_snapshot: '12oz',
        selling_price_centavos: 18_000,
        image_object_path: null,
        matcha_upgrades: [],
      },
    ];
    const cart = {
      'drink-matcha-latte|version-matcha-latte-12oz|standard|standard': {
        key: 'drink-matcha-latte|version-matcha-latte-12oz|standard|standard',
        productId: 'drink-matcha-latte',
        productVersionId: 'version-matcha-latte-12oz',
        name: 'Matcha Latte',
        size: '12oz',
        basePriceCentavos: 17_000,
        priceCentavos: 17_000,
        quantity: 2,
        matchaOptionId: '',
        matchaOptionRevision: null,
        matchaOptionCode: '',
        matchaOptionName: '',
        matchaSurchargeCentavos: 0,
        stale: false,
        latest: catalog[0],
      },
      'drink-sea-salt-matcha|version-sea-salt-matcha-12oz|upgrade-wakatake|2': {
        key: 'drink-sea-salt-matcha|version-sea-salt-matcha-12oz|upgrade-wakatake|2',
        productId: 'drink-sea-salt-matcha',
        productVersionId: 'version-sea-salt-matcha-12oz',
        name: 'Sea Salt Cream Matcha',
        size: '12oz',
        basePriceCentavos: 19_000,
        priceCentavos: 26_000,
        quantity: 1,
        matchaOptionId: 'upgrade-wakatake',
        matchaOptionRevision: 2,
        matchaOptionCode: 'wakatake',
        matchaOptionName: 'Marukyu Koyamaen - Wakatake',
        matchaSurchargeCentavos: 7_000,
        stale: false,
        latest: catalog[1],
      },
      'drink-sea-salt-hojicha|version-sea-salt-hojicha-12oz|standard|standard': {
        key: 'drink-sea-salt-hojicha|version-sea-salt-hojicha-12oz|standard|standard',
        productId: 'drink-sea-salt-hojicha',
        productVersionId: 'version-sea-salt-hojicha-12oz',
        name: 'Sea Salt Hojicha Latte',
        size: '12oz',
        basePriceCentavos: 18_000,
        priceCentavos: 18_000,
        quantity: 1,
        matchaOptionId: '',
        matchaOptionRevision: null,
        matchaOptionCode: '',
        matchaOptionName: '',
        matchaSurchargeCentavos: 0,
        stale: false,
        latest: catalog[4],
      },
    };
    const shiftStatus = {
      business_timezone: 'Asia/Manila',
      current_business_date: '2026-11-03',
      register_id: 'register-main',
      register_name: 'Main register',
      has_open_shift: true,
      shift_id: 'shift-live-2026-11-03',
      is_training: false,
      opening_cash_centavos: 100_000,
      opened_at: '2026-11-03T02:00:00.000Z',
      opened_by_display_name: 'Ynah',
      can_view_costs: true,
      can_open_live: false,
      can_open_training: false,
      can_close_shift: true,
      can_void_sales: true,
    };
    const checkout = app.freshPosCheckout();
    checkout.loaded = true;
    checkout.catalog = catalog;
    checkout.category = 'all';
    checkout.cart = cart;
    checkout.paymentMethod = 'cash';
    checkout.cashReceived = '1000';
    checkout.shiftStatus = shiftStatus;
    checkout.shift = { ...shiftStatus };
    checkout.summary = {
      business_date: '2026-11-03',
      business_timezone: 'Asia/Manila',
      is_training: false,
      gross_sale_count: 12,
      voided_sale_count: 1,
      net_sale_count: 11,
      gross_items_sold: 17,
      voided_items_sold: 1,
      net_items_sold: 16,
      gross_sales_centavos: 304_000,
      voided_sales_centavos: 18_000,
      net_sales_centavos: 286_000,
      cash_net_centavos: 116_000,
      gcash_net_centavos: 100_000,
      gotyme_net_centavos: 70_000,
      estimated_cost_centavos: 112_000,
      estimated_gross_profit_centavos: 174_000,
      can_view_costs: true,
    };
    checkout.lastReceipt = {
      sale_id: 'sale-previous-gcash',
      shift_id: 'shift-live-2026-11-03',
      receipt_number: 'ML-20261103-0042',
      is_training: false,
      units_sold: 2,
      total_centavos: 37_000,
      payment_method: 'gcash',
      change_given_centavos: null,
      is_retry: false,
    };
    checkout.recent = [
      {
        sale_id: 'sale-recent-cash',
        shift_id: 'shift-live-2026-11-03',
        receipt_number: 'ML-20261103-0042',
        business_date: '2026-11-03',
        completed_at: '2026-11-03T09:42:00.000Z',
        cashier_display_name: 'Ynah',
        sale_state: 'completed',
        units_sold: 2,
        item_summary: '1 x Matcha Latte (12oz), 1 x Sea Salt Cream Matcha (12oz)',
        gross_total_centavos: 37_000,
        net_total_centavos: 37_000,
        payment_method: 'cash',
        estimated_gross_profit_centavos: 21_500,
        can_view_costs: true,
        can_void: true,
      },
      {
        sale_id: 'sale-recent-gcash',
        shift_id: 'shift-live-2026-11-03',
        receipt_number: 'ML-20261103-0041',
        business_date: '2026-11-03',
        completed_at: '2026-11-03T09:35:00.000Z',
        cashier_display_name: 'Ynah',
        sale_state: 'completed',
        units_sold: 1,
        item_summary: '1 x Coconut Matcha Cloud (12oz)',
        gross_total_centavos: 18_000,
        net_total_centavos: 18_000,
        payment_method: 'gcash',
        estimated_gross_profit_centavos: 10_200,
        can_view_costs: true,
        can_void: true,
      },
      {
        sale_id: 'sale-recent-gotyme',
        shift_id: 'shift-live-2026-11-03',
        receipt_number: 'ML-20261103-0040',
        business_date: '2026-11-03',
        completed_at: '2026-11-03T09:28:00.000Z',
        cashier_display_name: 'Ynah',
        sale_state: 'completed',
        units_sold: 1,
        item_summary: '1 x Hojicha Latte (12oz)',
        gross_total_centavos: 17_000,
        net_total_centavos: 17_000,
        payment_method: 'gotyme',
        estimated_gross_profit_centavos: 9_400,
        can_view_costs: true,
        can_void: true,
      },
    ];
    checkout.reportMode = 'live';
    checkout.lastUpdatedAt = Date.parse('2026-11-03T09:45:00.000Z');

    app.session = {
      user: { id: 'pos-view-cashier', email: 'ynah@example.test' },
    };
    app.posContext = {
      loaded: true,
      loading: false,
      businessId: 'business-matcha-luna',
      businessName: 'Matcha Luna',
      role: 'owner',
      publications: {},
      error: '',
    };
    app.posCheckout = checkout;
    app.__posViewMobileCatalog = catalog;
    app.__posViewMobileShiftStatus = shiftStatus;
    app.__posViewMobileStateChecks = [];
    app.__posViewMobileBusinessCalls = [];

    [
      'loadPosCheckoutData',
      'refreshPosSilently',
      'refreshPos',
      'openPosRegister',
      'openPosShift',
      'openPosClose',
      'submitPosSale',
      'beginPosSaleConfirmation',
      'cancelPosSaleConfirmation',
      'posNewSale',
      'openPosVoid',
      'posSavePending',
      'posClearPending',
      'posRememberCatalogCache',
      'posClearCatalogCache',
      'publishProductToPos',
      'cloudSave',
      'save',
      'logChanges',
    ].forEach((name) => {
      if (typeof app[name] !== 'function') return;
      app[name] = () => {
        app.__posViewMobileBusinessCalls.push(name);
        throw new Error(`${name} must not run during read-only POS rendering`);
      };
    });

    const stateSnapshot = () =>
      JSON.stringify({
        session: app.session,
        posContext: app.posContext,
        posCheckout: app.posCheckout,
        posOpsModal: app.posOpsModal,
        posSalesHistory: app.posSalesHistory,
        costingState: app.state,
      });
    app.__renderPosViewScenario = (name: string) => {
      const before = stateSnapshot();
      app.renderPos();
      const after = stateSnapshot();
      app.__posViewMobileStateChecks.push({ name, before, after });
    };
    app.__posViewMobileStorage = {
      local: snapshotStorage(localStorage),
      session: snapshotStorage(sessionStorage),
    };

    app.activateAppTab('pos', false);
    app.__renderPosViewScenario('live-cash-cart');
  });
}

async function posLayout(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const section = document.getElementById('pos')!;
    const isVisible = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const contained = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= -1 && rect.right <= root.clientWidth + 1;
    };
    const regions = Array.from(
      section.querySelectorAll<HTMLElement>(
        '.pos-topbar, .pos-shift-bar, .pos-start-banner, .pos-receipt, .pos-summary, .pos-workspace, .pos-catalog-card, #posCartPanel, .pos-mobile-order-bar, .pos-recent-row',
      ),
    ).filter(isVisible);
    const internalRegions = Array.from(
      section.querySelectorAll<HTMLElement>(
        '#posCatalogBody, #posCartPanel, .pos-product, .pos-cart-line, .pos-recent-row, .pos-recent-actions',
      ),
    ).filter(isVisible);
    const controls = Array.from(
      section.querySelectorAll<HTMLElement>(
        '.pos-category-bar button, .pos-product, [data-act="setPosPayment"], #posCashReceived, #posReference, [data-act="reviewPosSale"], [data-act="confirmPosSale"], [data-act="cancelPosConfirmation"], [data-act="focusPosCart"], [data-act="posNewSale"], [data-act="openPosSalesHistory"]',
      ),
    ).filter(isVisible);
    return {
      viewportWidth: root.clientWidth,
      pageWidth: root.scrollWidth,
      sectionClientWidth: section.clientWidth,
      sectionScrollWidth: section.scrollWidth,
      visibleRegionCount: regions.length,
      regionsContained: regions.every(contained),
      internalRegionsContained: internalRegions.every(
        (element) =>
          contained(element) && element.scrollWidth <= element.clientWidth + 1,
      ),
      controlCount: controls.length,
      controlsContained: controls.every(contained),
    };
  });
}

async function expectReachable(page: Page, selector: string) {
  const control = page.locator(selector).first();
  await expect(control, `${selector} should be rendered`).toBeVisible();
  await control.scrollIntoViewIfNeeded();
  const rect = await control.boundingBox();
  const viewport = page.viewportSize();
  expect(rect, `${selector} should have a reachable box`).not.toBeNull();
  expect(rect!.width).toBeGreaterThan(0);
  expect(rect!.height).toBeGreaterThan(0);
  expect(rect!.x).toBeGreaterThanOrEqual(-1);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport!.width + 1);
}

test('realistic POS views remain contained, reachable, and read-only', async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const serverErrors: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  await openSeededPos(page);

  await expect(page.locator('section#pos')).toHaveClass(/active/);
  await expect(page.locator('.pos-product')).toHaveCount(5);
  await expect(page.locator('#posCatalogBody')).toContainText('Matcha Latte');
  await expect(page.locator('#posCatalogBody')).toContainText('Hojicha Latte');
  await expect(page.locator('.pos-category-bar button')).toHaveCount(3);
  await expect(page.locator('#posCartPanel')).toContainText('Matcha Latte');
  await expect(page.locator('#posCartPanel')).toContainText(
    'Sea Salt Hojicha Latte',
  );
  await expect(page.locator('#posCartPanel')).toContainText('Wakatake');
  await expect(page.locator('#posCartPanel')).toContainText('780.00');
  await expect(page.locator('[data-act="setPosPayment"]')).toHaveCount(3);
  await expect(page.locator('#posCashReceived')).toHaveValue('1000');
  await expect(page.locator('[data-act="reviewPosSale"]')).toBeEnabled();
  await expect(page.locator('.pos-receipt')).toContainText(
    'ML-20261103-0042',
  );
  await expect(page.locator('.pos-receipt')).toContainText('GCash');
  await expect(page.locator('.pos-recent-row')).toHaveCount(3);
  await expect(page.locator('.pos-recent-method')).toHaveText([
    'Cash',
    'GCash',
    'GoTyme',
  ]);
  await expect(page.locator('.pos-mobile-order-bar')).toHaveCount(1);
  await expect(page.locator('.pos-mobile-order-bar')).toContainText('4 drinks');
  await expect(page.locator('.pos-mobile-order-bar')).toContainText('780.00');

  let layout = await posLayout(page);
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.sectionScrollWidth).toBeLessThanOrEqual(
    layout.sectionClientWidth + 1,
  );
  expect(layout.visibleRegionCount).toBeGreaterThan(8);
  expect(layout.regionsContained).toBe(true);
  expect(layout.internalRegionsContained).toBe(true);
  expect(layout.controlCount).toBeGreaterThan(10);
  expect(layout.controlsContained).toBe(true);

  await expectReachable(
    page,
    '[data-act="addPosProduct"][data-id="drink-matcha-latte"]',
  );
  await expectReachable(
    page,
    '[data-act="setPosPayment"][data-method="gcash"]',
  );
  await expectReachable(page, '[data-act="reviewPosSale"]');
  await expectReachable(page, '[data-act="posNewSale"]');
  await expectReachable(page, '[data-act="openPosSalesHistory"]');
  if (testInfo.project.name !== 'chromium-desktop') {
    await expectReachable(page, '[data-act="focusPosCart"]');
  }

  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    app.posCheckout.paymentMethod = 'gcash';
    app.posCheckout.referenceNumber = 'GCASH-ML-20261103-2198';
    app.posCheckout.confirming = true;
    app.__renderPosViewScenario('gcash-confirmation');
  });
  await expect(page.locator('#posCartPanel')).toContainText('Confirm order');
  await expect(page.locator('#posCartPanel')).toContainText('GCash');
  await expect(page.locator('[data-act="cancelPosConfirmation"]')).toBeVisible();
  await expect(page.locator('[data-act="confirmPosSale"]')).toBeVisible();
  await expectReachable(page, '[data-act="confirmPosSale"]');
  layout = await posLayout(page);
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.regionsContained).toBe(true);
  expect(layout.internalRegionsContained).toBe(true);
  expect(layout.controlsContained).toBe(true);

  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    app.posCheckout.confirming = false;
    app.posCheckout.shift = null;
    app.posCheckout.paymentMethod = 'gotyme';
    app.posCheckout.referenceNumber = 'GOTYME-ML-20261103-0871';
    app.posCheckout.lastReceipt = null;
    app.posCheckout.pending = {
      schemaVersion: 3,
      userId: 'pos-view-cashier',
      businessId: 'business-matcha-luna',
      rpcName: 'pos_complete_shift_sale_v3',
      rpcArgs: {
        p_business_id: 'business-matcha-luna',
        p_shift_id: 'shift-live-2026-11-03',
        p_is_training: false,
        p_client_sale_id: 'sale-recovery-client-id',
        p_items: [
          {
            product_id: 'drink-matcha-latte',
            product_version_id: 'version-matcha-latte-12oz',
            quantity: 2,
            matcha_option_id: null,
            matcha_option_revision: null,
          },
          {
            product_id: 'drink-sea-salt-matcha',
            product_version_id: 'version-sea-salt-matcha-12oz',
            quantity: 1,
            matcha_option_id: 'upgrade-wakatake',
            matcha_option_revision: 2,
          },
          {
            product_id: 'drink-sea-salt-hojicha',
            product_version_id: 'version-sea-salt-hojicha-12oz',
            quantity: 1,
            matcha_option_id: null,
            matcha_option_revision: null,
          },
        ],
        p_payment_method: 'gotyme',
        p_cash_tendered_centavos: null,
        p_reference_number: 'GOTYME-ML-20261103-0871',
      },
      cartSnapshot: Object.values(app.posCheckout.cart),
    };
    app.posCheckout.notice =
      'A sale may have reached the server. Retry this exact sale safely.';
    app.__renderPosViewScenario('gotyme-exact-recovery');
  });
  await expect(page.locator('.pos-shift-bar')).toContainText(
    'Exact sale retry required',
  );
  await expect(page.locator('#posCartPanel')).toContainText('GoTyme');
  await expect(page.locator('#posCartPanel')).toContainText(
    'Retry exact order',
  );
  await expect(page.locator('#posCartPanel')).toContainText(
    'Recover this exact frozen sale',
  );
  await expectReachable(page, '[data-act="confirmPosSale"]');
  layout = await posLayout(page);
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.regionsContained).toBe(true);
  expect(layout.internalRegionsContained).toBe(true);
  expect(layout.controlsContained).toBe(true);

  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    app.posCheckout.pending = null;
    app.posCheckout.notice = '';
    app.posCheckout.shift = { ...app.__posViewMobileShiftStatus };
    app.posCheckout.paymentMethod = 'cash';
    app.posCheckout.cashReceived = '1000';
    app.posCheckout.referenceNumber = '';
    app.posCheckout.category = 'hojicha';
    app.__renderPosViewScenario('hojicha-category');
  });
  await expect(
    page.locator('[data-act="setPosCategory"][data-id="hojicha"]'),
  ).toHaveClass(/active/);
  await expect(page.locator('.pos-product')).toHaveCount(2);
  await expect(page.locator('#posCatalogBody')).toContainText('Hojicha Latte');
  await expect(page.locator('#posCatalogBody')).not.toContainText(
    'Coconut Matcha Cloud',
  );
  await expectReachable(
    page,
    '[data-act="setPosCategory"][data-id="hojicha"]',
  );
  layout = await posLayout(page);
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.regionsContained).toBe(true);
  expect(layout.internalRegionsContained).toBe(true);
  expect(layout.controlsContained).toBe(true);

  const readOnly = await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const snapshotStorage = (storage: Storage) =>
      Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .filter((key): key is string => key !== null)
        .sort()
        .map((key) => [key, storage.getItem(key)]);
    return {
      businessCalls: app.__posViewMobileBusinessCalls,
      directIo: app.__posViewMobileDirectIo,
      stateChecks: app.__posViewMobileStateChecks,
      storageUnchanged:
        JSON.stringify(app.__posViewMobileStorage.local) ===
          JSON.stringify(snapshotStorage(localStorage)) &&
        JSON.stringify(app.__posViewMobileStorage.session) ===
          JSON.stringify(snapshotStorage(sessionStorage)),
    };
  });

  expect(readOnly.businessCalls).toEqual([]);
  expect(readOnly.directIo).toMatchObject({
    fetchCalls: [],
    cloudCalls: [],
    storageCalls: [],
    guardErrors: [],
    fetchGuardInstalled: true,
    storageGuardsInstalled: 3,
    storageGuardMethods: ['setItem', 'removeItem', 'clear'],
  });
  expect(readOnly.directIo.cloudBoundariesInstalled).toBeGreaterThanOrEqual(3);
  expect(readOnly.directIo.cloudBoundaryLabels).toEqual(
    expect.arrayContaining([
      'cloudClient[0].rpc',
      'cloudClient[0].from',
      'cloudClient[0].storage.from',
    ]),
  );
  expect(readOnly.stateChecks.map((check: { name: string }) => check.name)).toEqual(
    [
      'live-cash-cart',
      'gcash-confirmation',
      'gotyme-exact-recovery',
      'hojicha-category',
    ],
  );
  expect(
    readOnly.stateChecks.every(
      (check: { before: string; after: string }) =>
        check.before === check.after,
    ),
  ).toBe(true);
  expect(readOnly.storageUnchanged).toBe(true);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(serverErrors).toEqual([]);
});
