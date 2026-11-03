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
    if (response.status() >= 400) errors.serverErrors.push(`${response.status()} ${response.url()}`);
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
    const visible = Array.from(element.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, [tabindex], .pos-cart-line, .pos-mode-banner',
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
      controls: visible.length,
      contained: visible.every((node) => {
        const box = node.getBoundingClientRect();
        return box.left >= -1 && box.right <= root.clientWidth + 1;
      }),
    };
  });
  expect(result.pageWidth).toBeLessThanOrEqual(result.viewportWidth + 1);
  expect(result.left).toBeGreaterThanOrEqual(-1);
  expect(result.right).toBeLessThanOrEqual(result.viewportWidth + 1);
  expect(result.controls).toBeGreaterThan(0);
  expect(result.contained).toBe(true);
}

async function seedLocalCheckout(page: Page): Promise<void> {
  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const guard = {
      fetchCalls: [] as string[], storageWrites: [] as string[],
      rpcCalls: [] as string[], queryCalls: [] as string[],
      objectStorageCalls: [] as string[], writeHookCalls: [] as string[],
      guardErrors: [] as string[], storageMethods: [] as string[],
      cloudMethods: [] as string[], writeHooks: [] as string[],
    };
    app.session = { user: { id: 'mobile-workspace-user', email: 'owner@example.test' } };
    app.posContext = {
      loaded: true, loading: false, businessId: 'mobile-business',
      businessName: 'Matcha Luna', role: 'owner', publications: {}, error: '',
    };
    const checkout = app.freshPosCheckout();
    checkout.loaded = true;
    checkout.catalog = [{
      product_id: 'matcha', active_version_id: 'matcha-v1',
      category_name: 'Matcha', product_name: 'Matcha Latte',
      size_snapshot: '12oz', selling_price_centavos: 17_000,
      image_object_path: null, matcha_upgrades: [],
    }];
    checkout.shift = {
      has_open_shift: true, shift_id: 'mobile-shift', is_training: false,
    };
    checkout.shiftStatus = { ...checkout.shift };
    checkout.cart = {
      'matcha|matcha-v1|standard|standard': {
        key: 'matcha|matcha-v1|standard|standard', productId: 'matcha',
        productVersionId: 'matcha-v1', name: 'Matcha Latte', size: '12oz',
        basePriceCentavos: 17_000, priceCentavos: 17_000, quantity: 1,
        matchaOptionId: '', matchaOptionRevision: null,
        matchaOptionCode: '', matchaOptionName: '',
        matchaSurchargeCentavos: 0, stale: false, latest: null,
      },
    };
    checkout.paymentMethod = 'cash';
    checkout.cashReceived = '200';
    checkout.referenceNumber = '';
    app.posCheckout = checkout;
    app.posOpsModal = app.freshPosOpsModal();
    app.posSalesHistory = app.freshPosSalesHistory();
    app.__phase4iMobileGuard = guard;
    app.__phase4iStateBefore = JSON.stringify(app.state);

    const client = {
      rpc: (name: string, args: unknown) => {
        guard.rpcCalls.push(`${name}:${JSON.stringify(args)}`);
        throw new Error(`RPC blocked in local Workspace mobile test: ${name}`);
      },
      from: (name: string) => {
        guard.queryCalls.push(name);
        throw new Error(`Query blocked in local Workspace mobile test: ${name}`);
      },
      storage: {
        from: (name: string) => {
          guard.objectStorageCalls.push(name);
          throw new Error(`Object storage blocked in local Workspace mobile test: ${name}`);
        },
      },
    };
    app.cloud = { connected: true, url: 'https://mobile.example.test', client };
    guard.cloudMethods.push('rpc', 'from', 'storage.from');

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
        throw new Error(`${name} must not run in local Workspace mobile test`);
      };
      guard.writeHooks.push(name);
    }
    app.activateAppTab('pos', false);
    app.renderPos();
  });
}

test('local review, confirmation, cancellation, focus restoration, and pending retry stay contained and write-free', async ({ page }) => {
  const errors = watchBrowserErrors(page);
  await openTestApp(page);
  await seedLocalCheckout(page);
  await expect(page.locator('#posCartPanel')).toContainText('Matcha Latte');
  await expect(page.locator('[data-act="reviewPosSale"]')).toBeEnabled();
  await expectContained(page, page.locator('#posCartPanel'));

  const review = page.locator('[data-act="reviewPosSale"]');
  await review.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#posCartPanel')).toContainText('Confirm order');
  await expect(page.locator('[data-act="cancelPosConfirmation"]')).toBeVisible();
  await expectContained(page, page.locator('#posCartPanel'));

  const cancel = page.locator('[data-act="cancelPosConfirmation"]');
  await cancel.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-act="reviewPosSale"]')).toBeVisible();
  await expect(page.locator('#posCartPanel')).not.toContainText('Confirm order');

  const focusRestored = await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const input = document.getElementById('posCashReceived') as HTMLInputElement;
    input.focus();
    input.setSelectionRange(1, 2);
    app.renderPosPreservingInteraction();
    const active = document.activeElement as HTMLInputElement;
    return {
      id: active?.id || '', start: active?.selectionStart,
      end: active?.selectionEnd,
    };
  });
  expect(focusRestored).toEqual({ id: 'posCashReceived', start: 1, end: 2 });

  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    app.posCheckout.shift = null;
    app.posCheckout.confirming = false;
    app.posCheckout.pending = {
      schemaVersion: 3, rpcName: 'pos_complete_shift_sale_v3',
      userId: 'mobile-workspace-user', businessId: 'mobile-business',
      rpcArgs: {
        p_business_id: 'mobile-business', p_shift_id: 'mobile-shift',
        p_is_training: false, p_client_sale_id: 'pending-client',
        p_items: [], p_payment_method: 'cash',
        p_cash_tendered_centavos: 20_000,
        p_reference_number: null, p_note: null,
      },
      cartSnapshot: Object.values(app.posCheckout.cart),
    };
    app.posCheckout.notice = 'Retry this exact sale safely.';
    app.renderPos();
  });
  await expect(page.locator('.pos-shift-bar')).toContainText('Exact sale retry required');
  await expect(page.locator('#posCartPanel')).toContainText('Retry exact order');
  await expect(page.locator('#posCartPanel')).toContainText('Recover this exact frozen sale');
  await expectContained(page, page.locator('#posCartPanel'));

  const result = await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    return {
      guard: app.__phase4iMobileGuard,
      stateUnchanged: JSON.stringify(app.state) === app.__phase4iStateBefore,
    };
  });
  expect(result.guard.guardErrors).toEqual([]);
  expect(result.guard.storageMethods).toEqual(['setItem', 'removeItem', 'clear']);
  expect(result.guard.cloudMethods).toEqual(['rpc', 'from', 'storage.from']);
  expect(result.guard.writeHooks).toHaveLength(12);
  expect(result.guard.fetchCalls).toEqual([]);
  expect(result.guard.storageWrites).toEqual([]);
  expect(result.guard.rpcCalls).toEqual([]);
  expect(result.guard.queryCalls).toEqual([]);
  expect(result.guard.objectStorageCalls).toEqual([]);
  expect(result.guard.writeHookCalls).toEqual([]);
  expect(result.stateUnchanged).toBe(true);
  expect(errors).toEqual({ pageErrors: [], consoleErrors: [], failedRequests: [], serverErrors: [] });
});

async function exerciseReadOnlyRefresh(page: Page) {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const api: any = app.MatchaLunaApp.domains.workspace;
    const guard = {
      rpcCalls: [] as Array<[string, unknown]>, storageWrites: [] as string[],
      fetchCalls: [] as string[], queryCalls: [] as string[],
      objectStorageCalls: [] as string[], persistenceCalls: [] as string[],
      guardErrors: [] as string[],
    };
    app.session = { user: { id: 'mobile-read-user' } };
    app.posContext = {
      loaded: true, loading: false, businessId: 'mobile-read-business',
      businessName: 'Matcha Luna', role: 'owner', publications: {}, error: '',
    };
    app.posCheckout = app.freshPosCheckout();
    app.posOpsModal = app.freshPosOpsModal();
    app.posCheckoutLoadGeneration = 0;
    app.posCatalogGeneration = 0;
    app.posLastSilentRefreshAttemptAt = 0;
    app.posSilentRefreshPromise = null;
    const catalog = [{
      product_id: 'matcha', active_version_id: 'matcha-v1',
      category_name: 'Matcha', product_name: 'Matcha Latte',
      size_snapshot: '12oz', selling_price_centavos: 17_000,
      image_object_path: null, matcha_upgrades: [],
    }];
    let mode: 'cold' | 'background' | 'failure' = 'cold';
    const client = {
      rpc: async (name: string, args: unknown) => {
        guard.rpcCalls.push([name, args]);
        if (mode === 'failure' && name === 'pos_get_shift_status') {
          return { data: null, error: { code: '57000', message: 'offline' } };
        }
        if (name === 'pos_get_catalog_v2') return { data: catalog, error: null };
        if (name === 'pos_get_shift_status') return { data: [{
          has_open_shift: true, shift_id: 'mobile-read-shift', is_training: false,
        }], error: null };
        if (name === 'pos_get_end_of_day_summary') return { data: [{
          business_date: '2026-11-03', gross_sales_centavos: 17_000,
        }], error: null };
        if (name === 'pos_get_recent_sales_v2') return { data: [], error: null };
        throw new Error(`Unexpected Workspace RPC: ${name}`);
      },
      from: (name: string) => {
        guard.queryCalls.push(name);
        throw new Error(`Query blocked: ${name}`);
      },
      storage: { from: (name: string) => {
        guard.objectStorageCalls.push(name);
        throw new Error(`Object storage blocked: ${name}`);
      } },
    };
    app.cloud = { connected: true, url: 'https://read.example.test', client };
    window.fetch = ((input: RequestInfo | URL) => {
      guard.fetchCalls.push(String(input));
      return Promise.reject(new Error('fetch blocked'));
    }) as typeof window.fetch;
    const storagePrototype = Storage.prototype as unknown as Record<string, any>;
    for (const method of ['setItem', 'removeItem', 'clear']) {
      try {
        Object.defineProperty(storagePrototype, method, {
          configurable: true, writable: true,
          value: function guardedWrite(this: Storage, ...args: string[]) {
            const area = this === localStorage ? 'localStorage'
              : this === sessionStorage ? 'sessionStorage' : 'Storage';
            guard.storageWrites.push(`${area}.${method}:${args[0] || ''}`);
          },
        });
      } catch (error) { guard.guardErrors.push(String(error)); }
    }
    app.posHydrateCatalogCache = () => {
      guard.persistenceCalls.push('hydrate');
      return mode === 'background';
    };
    app.posRememberCatalogCache = () => guard.persistenceCalls.push('remember');
    app.posRestorePending = () => guard.persistenceCalls.push('restore-pending');
    app.posSavePending = () => { throw new Error('pending save must not run'); };
    app.posClearPending = () => { throw new Error('pending clear must not run'); };
    app.activateAppTab('pos', false);
    const layout = () => {
      const root = document.documentElement;
      const posRoot = document.getElementById('posRoot');
      if (!posRoot) return { missing: true };
      const rect = posRoot.getBoundingClientRect();
      const controls = Array.from(posRoot.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, [tabindex], .pos-product, .pos-cart-line',
      )).filter((node) => {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' &&
          box.width > 0 && box.height > 0;
      });
      return {
        missing: false,
        viewportWidth: root.clientWidth,
        pageWidth: root.scrollWidth,
        rootLeft: rect.left,
        rootRight: rect.right,
        rootClientWidth: posRoot.clientWidth,
        rootScrollWidth: posRoot.scrollWidth,
        controlCount: controls.length,
        controlsContained: controls.every((node) => {
          const box = node.getBoundingClientRect();
          return box.left >= -1 && box.right <= root.clientWidth + 1;
        }),
      };
    };

    const start = guard.rpcCalls.length;
    const cold = await api.loadPosCheckoutData();
    const coldCalls = guard.rpcCalls.slice(start);
    const coldState = {
      ok: cold, loaded: app.posCheckout.loaded,
      refreshing: app.posCheckout.refreshing,
      required: app.posCheckout.checkoutRefreshRequired,
    };
    const coldLayout = layout();

    mode = 'background';
    app.posCheckout.catalog = catalog;
    app.posCheckout.loaded = true;
    const backgroundStart = guard.rpcCalls.length;
    const cash = document.getElementById('posCashReceived') as HTMLInputElement | null;
    if (cash) cash.focus();
    const background = await api.loadPosCheckoutData({ background: true });
    const backgroundCalls = guard.rpcCalls.slice(backgroundStart);
    const backgroundState = {
      ok: background,
      activeId: (document.activeElement as HTMLElement | null)?.id || '',
      required: app.posCheckout.checkoutRefreshRequired,
    };
    const backgroundLayout = layout();

    mode = 'failure';
    const failureStart = guard.rpcCalls.length;
    const failure = await api.loadPosCheckoutData({ background: true });
    const failureCalls = guard.rpcCalls.slice(failureStart);
    const failureState = {
      ok: failure, loaded: app.posCheckout.loaded,
      required: app.posCheckout.checkoutRefreshRequired,
      error: app.posCheckout.refreshError,
      catalogCount: app.posCheckout.catalog.length,
    };
    const failureLayout = layout();
    app.renderPos();
    return {
      coldCalls, coldState, coldLayout,
      backgroundCalls, backgroundState, backgroundLayout,
      failureCalls, failureState, failureLayout, guard,
    };
  });
}

test('cold, background, and failed refreshes use only allowed reads, preserve interaction, and perform no real writes', async ({ page }) => {
  const errors = watchBrowserErrors(page);
  await openTestApp(page);
  const result = await exerciseReadOnlyRefresh(page);
  const readNames = (calls: Array<[string, unknown]>) => calls.map(([name]) => name);
  const expectedReads = [
    'pos_get_catalog_v2', 'pos_get_shift_status',
    'pos_get_end_of_day_summary', 'pos_get_recent_sales_v2',
  ];
  expect(readNames(result.coldCalls)).toEqual(expectedReads);
  expect(readNames(result.backgroundCalls)).toEqual(expectedReads);
  expect(readNames(result.failureCalls)).toEqual([
    'pos_get_catalog_v2', 'pos_get_shift_status',
  ]);
  expect(result.coldCalls).toHaveLength(4);
  expect(result.backgroundCalls).toHaveLength(4);
  expect(result.failureCalls).toHaveLength(2);
  for (const calls of [result.coldCalls, result.backgroundCalls, result.failureCalls]) {
    expect(calls[0][1]).toEqual({ p_business_id: 'mobile-read-business' });
    expect(calls[1][1]).toEqual({ p_business_id: 'mobile-read-business' });
  }
  expect(result.coldCalls[2][1]).toEqual({
    p_business_id: 'mobile-read-business', p_business_date: null,
    p_is_training: false,
  });
  expect(result.coldCalls[3][1]).toEqual({
    p_business_id: 'mobile-read-business', p_is_training: false, p_limit: 20,
  });
  expect(result.backgroundCalls[2][1]).toEqual({
    p_business_id: 'mobile-read-business', p_business_date: '2026-11-03',
    p_is_training: false,
  });
  expect(result.backgroundCalls[3][1]).toEqual({
    p_business_id: 'mobile-read-business', p_is_training: false, p_limit: 20,
  });
  expect(result.coldState).toEqual({
    ok: true, loaded: true, refreshing: false, required: false,
  });
  expect(result.backgroundState).toEqual({
    ok: true, activeId: 'posCashReceived', required: false,
  });
  expect(result.failureState).toEqual({
    ok: false, loaded: true, required: true,
    error: 'Could not verify the register. Your current screen is preserved; retry before confirming payment.',
    catalogCount: 1,
  });
  const failureText =
    'Could not verify the register. Your current screen is preserved; retry before confirming payment.';
  const failureNotice = page.locator('#posRoot .note').filter({ hasText: failureText });
  await expect(failureNotice).toBeVisible();
  await expect(failureNotice).toContainText(failureText);
  expect(result.guard.guardErrors).toEqual([]);
  expect(result.guard.fetchCalls).toEqual([]);
  expect(result.guard.storageWrites).toEqual([]);
  expect(result.guard.queryCalls).toEqual([]);
  expect(result.guard.objectStorageCalls).toEqual([]);
  expect(result.guard.persistenceCalls).toEqual([
    'hydrate', 'restore-pending', 'remember',
    'hydrate', 'restore-pending', 'remember',
    'hydrate', 'restore-pending', 'remember',
  ]);
  for (const intermediate of [
    result.coldLayout, result.backgroundLayout, result.failureLayout,
  ]) {
    expect(intermediate).toMatchObject({
      missing: false, controlsContained: true,
    });
    if ('viewportWidth' in intermediate) {
      const measured = intermediate as Record<string, number | boolean>;
      expect(measured.pageWidth).toBeLessThanOrEqual(Number(measured.viewportWidth) + 1);
      expect(measured.rootLeft).toBeGreaterThanOrEqual(-1);
      expect(measured.rootRight).toBeLessThanOrEqual(Number(measured.viewportWidth) + 1);
      expect(measured.rootScrollWidth).toBeLessThanOrEqual(Number(measured.rootClientWidth) + 1);
      expect(measured.controlCount).toBeGreaterThan(0);
    }
  }
  await expectContained(page, page.locator('#posRoot'));
  expect(errors).toEqual({ pageErrors: [], consoleErrors: [], failedRequests: [], serverErrors: [] });
});
