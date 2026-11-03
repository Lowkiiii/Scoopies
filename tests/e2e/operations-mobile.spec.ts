import { expect, test, type Locator, type Page } from '@playwright/test';

type BrowserErrors = {
  pageErrors: string[];
  consoleErrors: string[];
  failedRequests: string[];
  serverErrors: string[];
};

function watchBrowserErrors(page: Page): BrowserErrors {
  const errors: BrowserErrors = {
    pageErrors: [], consoleErrors: [], failedRequests: [], serverErrors: [],
  };
  page.on('pageerror', (error) => errors.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    errors.failedRequests.push(`${request.method()} ${request.url()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      errors.serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  return errors;
}

async function openTestApp(page: Page): Promise<void> {
  await page.route(
    /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/,
    async (route) => route.fulfill({
      contentType: 'application/javascript',
      body: 'window.supabase={createClient:function(){throw new Error("Supabase is disabled in browser tests");}};',
    }),
  );
  await page.goto('index.html?test=1', { waitUntil: 'load' });
  await page.evaluate(() =>
    (window as typeof window & { MatchaLunaApp: { ready: Promise<void> } })
      .MatchaLunaApp.ready,
  );
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
}

async function expectContained(page: Page, region: Locator): Promise<void> {
  await expect(region).toBeVisible();
  const result = await region.evaluate((element) => {
    const root = document.documentElement;
    const rect = element.getBoundingClientRect();
    const controls = Array.from(element.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, [tabindex], [role="tab"]',
    )).filter((node) => {
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        box.width > 0 && box.height > 0;
    });
    return {
      viewportWidth: root.clientWidth,
      pageWidth: root.scrollWidth,
      left: rect.left,
      right: rect.right,
      controls: controls.length,
      controlsContained: controls.every((node) => {
        const box = node.getBoundingClientRect();
        return box.left >= -1 && box.right <= root.clientWidth + 1;
      }),
    };
  });
  expect(result.pageWidth).toBeLessThanOrEqual(result.viewportWidth + 1);
  expect(result.left).toBeGreaterThanOrEqual(-1);
  expect(result.right).toBeLessThanOrEqual(result.viewportWidth + 1);
  expect(result.controls).toBeGreaterThan(0);
  expect(result.controlsContained).toBe(true);
}

async function installNoWriteGuard(page: Page): Promise<void> {
  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const guard = {
      fetchCalls: [] as string[], storageWrites: [] as string[],
      rpcCalls: [] as Array<[string, unknown]>, writeRpcCalls: [] as string[],
      queryCalls: [] as string[], objectStorageCalls: [] as string[],
      writeHookCalls: [] as string[], guardErrors: [] as string[],
      storageMethods: [] as string[], cloudMethods: [] as string[],
      writeHooks: [] as string[],
    };
    app.__phase4jOperationsMobileGuard = guard;
    app.__phase4jOperationsStateBefore = JSON.stringify(app.state);

    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input : input instanceof URL ? input.href : input.url;
      guard.fetchCalls.push(`${(init?.method || 'GET').toUpperCase()} ${url}`);
      return Promise.reject(new Error(`fetch blocked: ${url}`));
    }) as typeof window.fetch;

    const storagePrototype = Storage.prototype as unknown as Record<string, any>;
    for (const method of ['setItem', 'removeItem', 'clear']) {
      try {
        Object.defineProperty(storagePrototype, method, {
          configurable: true, enumerable: false, writable: true,
          value: function guardedWrite(this: Storage, ...args: string[]) {
            const area = this === localStorage ? 'localStorage'
              : this === sessionStorage ? 'sessionStorage' : 'Storage';
            guard.storageWrites.push(`${area}.${method}:${args[0] || ''}`);
          },
        });
        guard.storageMethods.push(method);
      } catch (error) {
        guard.guardErrors.push(`Storage.${method}:${String(error)}`);
      }
    }

    for (const name of [
      'submitPosOpenShift', 'submitPosCloseShift', 'submitPosVoidSale',
      'submitPosSale', 'posSavePending', 'posClearPending',
      'posRememberCatalogCache', 'posClearCatalogCache',
      'publishProductToPos', 'cloudSave', 'save', 'logChanges',
      'submitStockModal', 'deleteIngredientSafely',
      'changeIngredientUnitSafely',
    ]) {
      if (typeof app[name] !== 'function') {
        guard.guardErrors.push(`missing hook:${name}`);
        continue;
      }
      app[name] = () => {
        guard.writeHookCalls.push(name);
        throw new Error(`${name} must not run in Operations mobile tests`);
      };
      guard.writeHooks.push(name);
    }
  });
}

async function readGuard(page: Page) {
  return page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    return {
      guard: app.__phase4jOperationsMobileGuard,
      costingStateUnchanged:
        JSON.stringify(app.state) === app.__phase4jOperationsStateBefore,
    };
  });
}

function expectNoWrites(result: Awaited<ReturnType<typeof readGuard>>): void {
  expect(result.guard.guardErrors).toEqual([]);
  expect(result.guard.storageMethods).toEqual(['setItem', 'removeItem', 'clear']);
  expect(result.guard.cloudMethods).toEqual(['rpc', 'from', 'storage.from']);
  expect(result.guard.writeHooks).toHaveLength(15);
  expect(result.guard.fetchCalls).toEqual([]);
  expect(result.guard.storageWrites).toEqual([]);
  expect(result.guard.writeRpcCalls).toEqual([]);
  expect(result.guard.queryCalls).toEqual([]);
  expect(result.guard.objectStorageCalls).toEqual([]);
  expect(result.guard.writeHookCalls).toEqual([]);
  expect(result.costingStateUnchanged).toBe(true);
}

test('open, close, and void dialogs keep local validation, review, dismissal, focus, and containment write-free', async ({ page }) => {
  const errors = watchBrowserErrors(page);
  await openTestApp(page);
  await installNoWriteGuard(page);
  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const guard = app.__phase4jOperationsMobileGuard;
    app.session = { user: { id: 'operations-mobile-user' } };
    app.posContext = {
      loaded: true, loading: false, businessId: 'operations-mobile-business',
      businessName: 'Matcha Luna', role: 'owner', publications: {}, error: '',
    };
    app.posCheckout = app.freshPosCheckout();
    app.posCheckout.loaded = true;
    app.posCheckout.shiftStatus = {
      has_open_shift: false, can_open_live: true, can_open_training: true,
      can_close_shift: true, can_view_costs: true, can_void_sales: true,
      register_name: 'Main register', business_timezone: 'Asia/Manila',
    };
    app.posCheckout.recent = [{
      sale_id: 'sale-mobile-1', receipt_number: 'SCP-MOBILE-1',
      sale_state: 'completed', can_void: true, units_sold: 1,
      item_summary: '1 x Matcha Latte', gross_total_centavos: 17_000,
      net_total_centavos: 17_000, payment_method: 'gcash',
    }];
    app.posOpsModal = app.freshPosOpsModal();
    app.posSalesHistory = app.freshPosSalesHistory();
    app.posOpsGeneration = 0;
    app.posHistoryGeneration = 0;
    app.posMediaGeneration = 0;
    app.posOpsModalReturnFocus = null;
    app.cloud = {
      connected: true, url: 'https://operations.invalid',
      client: {
        rpc: (name: string, args: unknown) => {
          guard.rpcCalls.push([name, args]);
          guard.writeRpcCalls.push(name);
          throw new Error(`RPC blocked: ${name}`);
        },
        from: (name: string) => {
          guard.queryCalls.push(name);
          throw new Error(`Query blocked: ${name}`);
        },
        storage: { from: (name: string) => {
          guard.objectStorageCalls.push(name);
          throw new Error(`Object storage blocked: ${name}`);
        } },
      },
    };
    guard.cloudMethods.push('rpc', 'from', 'storage.from');
    const returnButton = document.createElement('button');
    returnButton.id = 'operationsReturnFocus';
    returnButton.textContent = 'Operations focus anchor';
    document.body.appendChild(returnButton);
    returnButton.focus();
    app.openPosShiftModal();
  });

  const modal = page.locator('#posOpsModal .modal');
  await expect(page.locator('#posOpsModalTitle')).toHaveText('Open shift');
  await expect(page.locator('#posOpeningCash')).toBeFocused();
  await expectContained(page, modal);
  await page.locator('[data-act="setPosOpenMode"][data-mode="training"]').click();
  await expect(page.locator('.pos-mode-training')).toContainText('Training');
  await expect(page.locator('#posOpeningCash')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('#posOpsModal')).toBeHidden();
  await expect(page.locator('#operationsReturnFocus')).toBeFocused();

  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    app.posCheckout.shift = {
      has_open_shift: true, shift_id: 'shift-mobile-1', is_training: false,
      register_name: 'Main register',
    };
    app.posCheckout.shiftStatus = {
      ...app.posCheckout.shiftStatus, has_open_shift: true,
      shift_id: 'shift-mobile-1', is_training: false, can_close_shift: true,
    };
    app.posCheckout.cart = {};
    document.getElementById('operationsReturnFocus')?.focus();
    app.openPosCloseModal();
  });
  await expect(page.locator('#posOpsModalTitle')).toHaveText('Close Live shift');
  await page.locator('[data-act="reviewPosCloseShift"]').click();
  await expect(page.locator('#posOpsModal .pos-error')).toContainText(
    'Enter counted Cash, verified GCash, and verified GoTyme',
  );
  await page.locator('#posCountedCash').fill('1000.00');
  await page.locator('#posVerifiedGcash').fill('500.00');
  await page.locator('#posVerifiedGotyme').fill('250.00');
  await page.locator('#posCloseNotes').fill('Mobile local review');
  await page.locator('[data-act="reviewPosCloseShift"]').click();
  await expect(page.locator('#posOpsModalTitle')).toHaveText('Confirm shift close');
  await expect(page.locator('#posOpsModal')).toContainText('verified GCash');
  await expectContained(page, modal);
  await page.locator('[data-act="backPosCloseShift"]').click();
  await expect(page.locator('#posOpsModalTitle')).toHaveText('Close Live shift');
  await page.keyboard.press('Escape');
  await expect(page.locator('#operationsReturnFocus')).toBeFocused();

  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    document.getElementById('operationsReturnFocus')?.focus();
    app.openPosVoidModal('sale-mobile-1');
  });
  await expect(page.locator('#posOpsModalTitle')).toContainText('Void receipt');
  await page.locator('#posVoidReason').fill('x');
  await page.locator('[data-act="reviewPosVoidSale"]').click();
  await expect(page.locator('#posOpsModal .pos-error')).toContainText(
    'between 3 and 500 characters',
  );
  await page.locator('#posVoidReason').fill('Customer cancelled before preparation');
  await page.locator('[data-act="reviewPosVoidSale"]').click();
  await expect(page.locator('#posOpsModal')).toContainText('Confirm void');
  await expectContained(page, modal);
  await page.locator('[data-act="backPosVoidSale"]').click();
  await expect(page.locator('#posVoidReason')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#operationsReturnFocus')).toBeFocused();

  const result = await readGuard(page);
  expect(result.guard.rpcCalls).toEqual([]);
  expectNoWrites(result);
  expect(errors).toEqual({
    pageErrors: [], consoleErrors: [], failedRequests: [], serverErrors: [],
  });
});

test('read-only report, receipt, tally, date, and shift history remain keyboard-usable, contained, and write-free', async ({ page }) => {
  const errors = watchBrowserErrors(page);
  await openTestApp(page);
  await installNoWriteGuard(page);
  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const guard = app.__phase4jOperationsMobileGuard;
    const allowedReads = new Set([
      'pos_get_sales_history_page', 'pos_get_sales_history_summary',
      'pos_get_sales_product_tally_v2', 'pos_get_closed_shifts_page',
    ]);
    let receiptPage = 0;
    let tallyRequest = 0;
    let shiftPage = 0;
    app.session = { user: { id: 'operations-history-user' } };
    app.posContext = {
      loaded: true, loading: false, businessId: 'operations-history-business',
      businessName: 'Matcha Luna', role: 'owner', publications: {}, error: '',
    };
    app.posCheckout = app.freshPosCheckout();
    app.posCheckout.loaded = true;
    app.posCheckout.reportMode = 'live';
    app.posCheckout.shiftStatus = {
      can_view_costs: true, can_open_training: true, can_void_sales: true,
      business_timezone: 'Asia/Manila', register_name: 'Main register',
    };
    app.posCheckout.dailyReport = {
      business_date: '2026-11-04', business_timezone: 'Asia/Manila',
      is_training: false, can_view_costs: true, gross_sale_count: 3,
      voided_sale_count: 0, net_sale_count: 3, gross_items_sold: 4,
      voided_items_sold: 0, net_items_sold: 4,
      gross_sales_centavos: 70_000, voided_sales_centavos: 0,
      net_sales_centavos: 70_000, cash_net_centavos: 35_000,
      gcash_net_centavos: 20_000, gotyme_net_centavos: 15_000,
      estimated_cost_centavos: 25_000,
      estimated_gross_profit_centavos: 45_000,
    };
    app.posCheckout.reportLoadedMode = 'live';
    app.posCheckout.reportLoadedDate = '2026-11-04';
    app.posOpsModal = app.freshPosOpsModal();
    app.posSalesHistory = app.freshPosSalesHistory();
    app.posHistoryGeneration = 0;
    app.posOpsGeneration = 0;
    app.posMediaGeneration = 0;
    app.posOpsModalReturnFocus = null;

    const sale = (id: string, hasMore: boolean) => ({
      sale_id: id, receipt_number: `SCP-${id}`,
      completed_at: id === 'sale-a'
        ? '2026-11-04T10:00:00+08:00' : '2026-11-03T09:00:00+08:00',
      business_date: id === 'sale-a' ? '2026-11-04' : '2026-11-03',
      sale_state: 'completed', units_sold: 1,
      cashier_display_name: 'Mobile cashier', can_view_costs: true,
      estimated_gross_profit_centavos: 8_000,
      payment_method: 'gcash', net_total_centavos: 17_000,
      gross_total_centavos: 17_000, item_summary: '1 x Matcha Latte',
      has_more: hasMore,
    });
    const shift = (id: string, hasMore: boolean) => ({
      shift_id: id, closed_at: id === 'shift-a'
        ? '2026-11-04T13:00:00+08:00' : '2026-11-03T13:00:00+08:00',
      closed_business_date: id === 'shift-a' ? '2026-11-04' : '2026-11-03',
      register_name: 'Main register', event_name: 'Popup',
      closed_by_display_name: 'Mobile cashier', gross_sales_centavos: 34_000,
      voided_sales_centavos: 0, net_sales_centavos: 34_000,
      net_sale_count: 2, expected_cash_centavos: 17_000,
      counted_cash_centavos: 17_000, cash_variance_centavos: 0,
      expected_gcash_centavos: 17_000, verified_gcash_centavos: 17_000,
      gcash_variance_centavos: 0, expected_gotyme_centavos: 0,
      verified_gotyme_centavos: 0, gotyme_variance_centavos: 0,
      close_notes: 'Balanced', has_more: hasMore,
    });
    app.cloud = {
      connected: true, url: 'https://operations-history.invalid',
      client: {
        rpc: async (name: string, args: unknown) => {
          guard.rpcCalls.push([name, args]);
          if (!allowedReads.has(name)) {
            guard.writeRpcCalls.push(name);
            throw new Error(`Write or unexpected RPC blocked: ${name}`);
          }
          if (name === 'pos_get_sales_history_page') {
            receiptPage += 1;
            return { data: [sale(receiptPage === 1 ? 'sale-a' : 'sale-b', receiptPage === 1)], error: null };
          }
          if (name === 'pos_get_sales_history_summary') {
            return { data: [{
              first_business_date: '2026-11-03',
              last_business_date: '2026-11-04',
              business_timezone: 'Asia/Manila', is_training: false,
              can_view_costs: true, gross_sales_centavos: 70_000,
              voided_sales_centavos: 0, net_sales_centavos: 70_000,
              net_sale_count: 3, net_items_sold: 4,
              cash_net_centavos: 35_000, gcash_net_centavos: 20_000,
              gotyme_net_centavos: 15_000,
              estimated_gross_profit_centavos: 45_000,
            }], error: null };
          }
          if (name === 'pos_get_sales_product_tally_v2') {
            tallyRequest += 1;
            if (tallyRequest === 1) {
              return { data: null, error: { code: '57000', message: 'retry tally' } };
            }
            return { data: [{
              item_name: 'Matcha Latte', size_label: '12oz',
              units_sold: tallyRequest, order_count: tallyRequest,
              net_sales_centavos: 17_000 * tallyRequest,
            }], error: null };
          }
          shiftPage += 1;
          return { data: [shift(shiftPage < 3 ? 'shift-a' : 'shift-b', shiftPage < 3)], error: null };
        },
        from: (name: string) => {
          guard.queryCalls.push(name);
          throw new Error(`Query blocked: ${name}`);
        },
        storage: { from: (name: string) => {
          guard.objectStorageCalls.push(name);
          throw new Error(`Object storage blocked: ${name}`);
        } },
      },
    };
    guard.cloudMethods.push('rpc', 'from', 'storage.from');
    const returnButton = document.createElement('button');
    returnButton.id = 'operationsHistoryReturnFocus';
    returnButton.textContent = 'History focus anchor';
    document.body.appendChild(returnButton);
    returnButton.focus();
    app.openPosReportModal();
  });

  const modal = page.locator('#posOpsModal .modal');
  await expect(page.locator('#posOpsModalTitle')).toHaveText('End-of-day report');
  await expect(page.locator('#posOpsModal')).toContainText('Net collected');
  await expectContained(page, modal);
  await page.keyboard.press('Escape');
  await expect(page.locator('#operationsHistoryReturnFocus')).toBeFocused();

  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    document.getElementById('operationsHistoryReturnFocus')?.focus();
    return app.openPosSalesHistory();
  });
  await expect(page.locator('#posOpsModalTitle')).toHaveText('Sales history');
  await expect(page.locator('#posOpsModal')).toContainText('SCP-sale-a');
  await expectContained(page, modal);
  await page.locator('[data-act="loadOlderPosSalesHistory"]').click();
  await expect(page.locator('#posOpsModal')).toContainText('SCP-sale-b');

  const receiptTab = page.locator('[data-view="receipts"][role="tab"]');
  await receiptTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-view="tally"][role="tab"]')).toHaveAttribute(
    'aria-selected', 'true',
  );
  await expect(page.locator('#posOpsModal')).toContainText(
    'Could not load the drink tally',
  );
  await page.locator('[data-act="retryPosSalesProductTally"]').click();
  await expect(page.locator('#posOpsModal')).toContainText('Matcha Latte');
  await expectContained(page, modal);

  await page.locator('#posHistoryDateFilter').fill('2026-11-04');
  await page.locator('[data-act="applyPosHistoryDate"]').click();
  await expect(page.locator('#posOpsModal')).toContainText('Nov 4, 2026');
  const tallyTab = page.locator('[data-view="tally"][role="tab"]');
  await tallyTab.focus();
  await page.keyboard.press('End');
  await expect(page.locator('[data-view="shifts"][role="tab"]')).toHaveAttribute(
    'aria-selected', 'true',
  );
  await expect(page.locator('#posOpsModal')).toContainText('Main register');
  await expectContained(page, modal);

  const loadOlderShifts = page.locator('[data-act="loadOlderPosClosedShifts"]');
  await expect(loadOlderShifts).toBeVisible();
  await loadOlderShifts.click();
  await expect(page.locator('#posOpsModal')).toContainText('Nov 3, 2026');
  const shiftTally = page.locator('[data-act="viewPosShiftTally"]').first();
  await shiftTally.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-view="tally"][role="tab"]')).toHaveAttribute(
    'aria-selected', 'true',
  );
  await expect(page.locator('#posOpsModal')).toContainText('Shift: Main register');
  await expectContained(page, modal);
  await page.keyboard.press('Escape');
  await expect(page.locator('#operationsHistoryReturnFocus')).toBeFocused();

  const result = await readGuard(page);
  const rpcNames = result.guard.rpcCalls.map(([name]: [string, unknown]) => name);
  expect(rpcNames).toContain('pos_get_sales_history_page');
  expect(rpcNames).toContain('pos_get_sales_history_summary');
  expect(rpcNames).toContain('pos_get_sales_product_tally_v2');
  expect(rpcNames).toContain('pos_get_closed_shifts_page');
  expect(new Set(rpcNames)).toEqual(new Set([
    'pos_get_sales_history_page', 'pos_get_sales_history_summary',
    'pos_get_sales_product_tally_v2', 'pos_get_closed_shifts_page',
  ]));
  expectNoWrites(result);
  expect(errors).toEqual({
    pageErrors: [], consoleErrors: [], failedRequests: [], serverErrors: [],
  });
});
