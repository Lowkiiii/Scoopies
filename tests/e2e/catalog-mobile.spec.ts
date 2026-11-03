import { expect, test, type Locator, type Page } from '@playwright/test';

type BrowserErrors = {
  pageErrors: string[];
  consoleErrors: string[];
  failedRequests: string[];
  serverErrors: string[];
};

type CatalogGuard = {
  fetchCalls: string[];
  storageWrites: string[];
  rpcCalls: string[];
  queryCalls: string[];
  objectStorageCalls: string[];
  hookCalls: string[];
  guardErrors: string[];
  fetchInstalled: boolean;
  storageMethods: string[];
  cloudMethods: string[];
  hookNames: string[];
};

const GUARDED_HOOKS = [
  'submitPosSale', 'posSavePending', 'posClearPending',
  'posRememberCatalogCache', 'posClearCatalogCache',
  'publishProductToPos', 'cloudSave', 'save', 'logChanges',
];

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

async function seedCatalogAndGuards(
  page: Page,
  allowMediaRead: boolean,
): Promise<void> {
  await page.evaluate(({ hooks, allowRead }) => {
    const app = window as typeof window & Record<string, any>;
    const guard: CatalogGuard = {
      fetchCalls: [], storageWrites: [], rpcCalls: [], queryCalls: [],
      objectStorageCalls: [], hookCalls: [], guardErrors: [],
      fetchInstalled: false, storageMethods: [], cloudMethods: [], hookNames: [],
    };
    const upgrades = [
      {
        id: 'waka', revision: 1, code: 'waka', display_name: 'Wakatake',
        surcharge_centavos: 7_000, sort_order: 1,
      },
      {
        id: 'aya', revision: 2, code: 'aya', display_name: 'Aya no Mori',
        surcharge_centavos: 8_000, sort_order: 2,
      },
    ];
    const catalog = [
      {
        product_id: 'matcha', active_version_id: 'matcha-v1',
        category_name: 'Matcha', product_name: 'Matcha Latte',
        size_snapshot: '12oz', selling_price_centavos: 17_000,
        image_object_path: null, matcha_upgrades: upgrades,
      },
      {
        product_id: 'hojicha', active_version_id: 'hojicha-v1',
        category_name: 'Hojicha', product_name: 'Hojicha Latte',
        size_snapshot: '12oz', selling_price_centavos: 17_000,
        image_object_path: null, matcha_upgrades: [],
      },
    ];
    const mediaRows = catalog.map((row) => ({
      product_id: row.product_id,
      product_name: row.product_name,
      size_snapshot: row.size_snapshot,
      available: true,
      image_object_path: null,
      updated_at: '2026-11-03T00:00:00.000Z',
    }));

    app.session = { user: { id: 'mobile-catalog-user', email: 'owner@example.test' } };
    app.currentUserId = 'mobile-catalog-user';
    app.posContext = {
      loaded: true, loading: false, businessId: 'mobile-business',
      businessName: 'Matcha Luna', role: 'owner', publications: {}, error: '',
    };
    app.posCheckout = app.freshPosCheckout();
    app.posCheckout.loaded = true;
    app.posCheckout.catalog = catalog;
    app.posCheckout.shift = { shift_id: 'mobile-shift', is_training: false };
    app.posCheckout.shiftStatus = {
      has_open_shift: true, shift_id: 'mobile-shift', is_training: false,
      can_close_shift: true, can_void_sales: true, can_view_costs: true,
    };
    app.posCheckout.summary = {
      gross_sales_centavos: 0, voided_sales_centavos: 0,
      net_sales_centavos: 0, net_items_sold: 0,
    };
    app.posOpsModal = app.freshPosOpsModal();
    app.posSalesHistory = app.freshPosSalesHistory();
    app.posMediaGeneration = 0;
    app.posMediaSelectionGeneration = 0;
    app.__phase4hMobileGuard = guard;
    app.__phase4hMobilePersistentState = JSON.stringify(app.state);

    const client = {
      rpc: async (name: string, args: unknown) => {
        guard.rpcCalls.push(`${name}:${JSON.stringify(args)}`);
        if (allowRead && name === 'pos_get_product_media') {
          return { data: mediaRows, error: null };
        }
        throw new Error(`RPC blocked in catalog mobile test: ${name}`);
      },
      from: (name: string) => {
        guard.queryCalls.push(name);
        throw new Error(`Query blocked in catalog mobile test: ${name}`);
      },
      storage: {
        from: (name: string) => {
          guard.objectStorageCalls.push(name);
          throw new Error(`Object storage blocked in catalog mobile test: ${name}`);
        },
      },
    };
    app.cloud = {
      connected: true, url: 'https://catalog-mobile.example.test', client,
    };
    guard.cloudMethods.push('rpc', 'from', 'storage.from');

    try {
      window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string'
          ? input
          : input instanceof URL ? input.href : input.url;
        guard.fetchCalls.push(`${(init?.method || 'GET').toUpperCase()} ${url}`);
        return Promise.reject(new Error(`fetch blocked: ${url}`));
      }) as typeof window.fetch;
      guard.fetchInstalled = true;
    } catch (error) {
      guard.guardErrors.push(`fetch:${String(error)}`);
    }

    const storagePrototype = Storage.prototype as unknown as Record<
      string,
      (...args: string[]) => void
    >;
    (['setItem', 'removeItem', 'clear'] as const).forEach((method) => {
      try {
        Object.defineProperty(storagePrototype, method, {
          configurable: true, enumerable: false, writable: true,
          value: function guardedStorageWrite(this: Storage, ...args: string[]) {
            const area = this === localStorage
              ? 'localStorage'
              : this === sessionStorage ? 'sessionStorage' : 'Storage';
            guard.storageWrites.push(`${area}.${method}:${args[0] || ''}`);
          },
        });
        guard.storageMethods.push(method);
      } catch (error) {
        guard.guardErrors.push(`Storage.${method}:${String(error)}`);
      }
    });

    hooks.forEach((name) => {
      if (typeof app[name] !== 'function') {
        guard.guardErrors.push(`missing hook:${name}`);
        return;
      }
      app[name] = () => {
        guard.hookCalls.push(name);
        throw new Error(`${name} must not run in catalog mobile tests`);
      };
      guard.hookNames.push(name);
    });

    app.activateAppTab('pos', false);
    app.renderPos();
  }, { hooks: GUARDED_HOOKS, allowRead: allowMediaRead });
}

async function expectContained(page: Page, region: Locator): Promise<void> {
  await expect(region).toBeVisible();
  const result = await region.evaluate((element) => {
    const root = document.documentElement;
    const rect = element.getBoundingClientRect();
    const visible = Array.from(element.querySelectorAll<HTMLElement>(
      'button, input, label, canvas, fieldset, .modal-actions, .pos-media-row, .pos-cart-line',
    )).filter((node) => {
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        box.width > 0 && box.height > 0;
    });
    return {
      viewportWidth: root.clientWidth,
      pageWidth: root.scrollWidth,
      regionLeft: rect.left,
      regionRight: rect.right,
      controls: visible.length,
      contained: visible.every((node) => {
        const box = node.getBoundingClientRect();
        return box.left >= -1 && box.right <= root.clientWidth + 1;
      }),
    };
  });
  expect(result.pageWidth).toBeLessThanOrEqual(result.viewportWidth + 1);
  expect(result.regionLeft).toBeGreaterThanOrEqual(-1);
  expect(result.regionRight).toBeLessThanOrEqual(result.viewportWidth + 1);
  expect(result.controls).toBeGreaterThan(0);
  expect(result.contained).toBe(true);
}

async function guardResult(page: Page) {
  return page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    return {
      guard: app.__phase4hMobileGuard as CatalogGuard,
      costingStateUnchanged:
        app.__phase4hMobilePersistentState === JSON.stringify(app.state),
      modalOpen: app.posOpsModal.open,
    };
  });
}

test('local catalog, upgrade, quantity, remove, clear, dismissal, and focus stay write-free and contained', async ({ page }) => {
  const errors = watchBrowserErrors(page);
  await openTestApp(page);
  await seedCatalogAndGuards(page, false);

  await expect(page.locator('.pos-product')).toHaveCount(2);
  const matchaCategory = page.locator(
    '[data-act="setPosCategory"][data-id="matcha"]',
  );
  const hojichaCategory = page.locator(
    '[data-act="setPosCategory"][data-id="hojicha"]',
  );
  const allCategory = page.locator(
    '[data-act="setPosCategory"][data-id="all"]',
  );
  await matchaCategory.click();
  await expect(matchaCategory).toHaveClass(/active/);
  await expect(page.locator('.pos-product')).toHaveCount(1);
  await expect(page.locator('[data-act="addPosProduct"][data-id="matcha"]'))
    .toBeVisible();
  await hojichaCategory.click();
  await expect(hojichaCategory).toHaveClass(/active/);
  await expect(page.locator('.pos-product')).toHaveCount(1);
  await expect(page.locator('[data-act="addPosProduct"][data-id="hojicha"]'))
    .toBeVisible();
  await allCategory.click();
  await expect(allCategory).toHaveClass(/active/);
  await expect(page.locator('.pos-product')).toHaveCount(2);

  const product = page.locator('[data-act="addPosProduct"][data-id="matcha"]');
  await product.focus();
  await expect(product).toBeFocused();
  await product.press('Enter');
  const modal = page.locator('#posOpsModal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('#posOpsModalTitle')).toContainText('Customize Matcha Latte');
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(product).toBeFocused();

  await product.click();
  await expect(modal).toBeVisible();
  await modal.locator('input[name="posMatchaOption"][value="waka"]').check();
  await expect(modal.locator('.pos-upgrade-total')).toContainText('240.00');
  await expectContained(page, modal.locator('.modal'));
  await modal.locator('[data-act="confirmPosProductOption"]').click();
  await expect(modal).toBeHidden();
  await expect(product).toBeFocused();
  await expect(page.locator('#posCartPanel')).toContainText('Wakatake');

  const line = page.locator('.pos-cart-line');
  await expect(line).toHaveCount(1);
  await line.locator('[data-act="posQtyUp"]').click();
  await expect(line.locator('.pos-qty-value')).toHaveText('2');
  const removeLine = line.locator('[data-act="removePosLine"]');
  await removeLine.focus();
  await removeLine.press('Enter');
  await expect(modal.locator('#posOpsModalTitle')).toHaveText('Remove this drink?');
  await expectContained(page, modal.locator('.modal'));
  await modal.locator('#posCartConfirmCancel').click();
  await expect(modal).toBeHidden();
  await expect(removeLine).toBeFocused();
  await expect(line).toHaveCount(1);
  await removeLine.press('Enter');
  await modal.locator('[data-act="confirmPosCartAction"]').click();
  await expect(page.locator('.pos-cart-line')).toHaveCount(0);

  await page.locator('[data-act="addPosProduct"][data-id="hojicha"]').click();
  await expect(page.locator('.pos-cart-line')).toHaveCount(1);
  await page.locator('[data-act="clearPosCart"]').click();
  await expect(modal.locator('#posOpsModalTitle')).toHaveText('Clear current order?');
  await modal.locator('[data-act="confirmPosCartAction"]').click();
  await expect(page.locator('.pos-cart-line')).toHaveCount(0);
  await expect(page.locator('#posCartPanel')).toBeFocused();
  await expect(page.locator('body')).not.toHaveClass(/modal-open/);
  await expect(product).toBeVisible();

  const result = await guardResult(page);
  expect(result.guard).toMatchObject({
    fetchCalls: [], storageWrites: [], rpcCalls: [], queryCalls: [],
    objectStorageCalls: [], hookCalls: [], guardErrors: [],
    fetchInstalled: true,
    storageMethods: ['setItem', 'removeItem', 'clear'],
    cloudMethods: ['rpc', 'from', 'storage.from'],
    hookNames: GUARDED_HOOKS,
  });
  expect(result.costingStateUnchanged).toBe(true);
  expect(result.modalOpen).toBe(false);
  expect(errors).toEqual({
    pageErrors: [], consoleErrors: [], failedRequests: [], serverErrors: [],
  });
});

test('read-only media and local image crop controls stay write-free, reachable, and contained', async ({ page }) => {
  const errors = watchBrowserErrors(page);
  await openTestApp(page);
  await seedCatalogAndGuards(page, true);

  const manageDrinks = page.locator('[data-act="openManageDrinks"]');
  await manageDrinks.focus();
  await expect(manageDrinks).toBeFocused();
  await manageDrinks.press('Enter');
  const modal = page.locator('#posOpsModal');
  await expect(modal.locator('#posOpsModalTitle')).toHaveText('Drink photos');
  await expect(modal.locator('.pos-media-row')).toHaveCount(2);
  await expectContained(page, modal.locator('.modal'));

  await modal.locator('input[data-pos-image-product="matcha"]').setInputFiles({
    name: 'not-an-image.txt', mimeType: 'text/plain',
    buffer: Buffer.from('not an image'),
  });
  await expect(modal.locator('.pos-error')).toContainText(
    'Choose a JPG, PNG, or WebP image.',
  );
  await expect(modal.locator('#posOpsModalTitle')).toHaveText('Drink photos');

  const transparentPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYGD4z8DAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==',
    'base64',
  );
  await modal.locator('input[data-pos-image-product="matcha"]').setInputFiles({
    name: 'matcha.png', mimeType: 'image/png', buffer: transparentPng,
  });
  await expect(modal.locator('#posOpsModalTitle')).toContainText('Adjust Matcha Latte photo');
  const canvas = modal.locator('#posPhotoCropCanvas');
  await expect(canvas).toBeVisible();
  await expectContained(page, modal.locator('.modal'));
  await modal.locator('[data-act="adjustPosDrinkImageZoom"][data-delta="0.1"]').click();
  await expect(modal.locator('#posPhotoZoomValue')).toHaveText('110%');
  const beforeDrag = await page.evaluate(() => {
    const editor = (window as typeof window & Record<string, any>)
      .posOpsModal.mediaEditor;
    return { panX: editor.panX, panY: editor.panY, drag: editor.drag };
  });
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  const startX = canvasBox!.x + canvasBox!.width / 2;
  const startY = canvasBox!.y + canvasBox!.height / 2;
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 41, isPrimary: true, button: 0,
    clientX: startX, clientY: startY,
  });
  await canvas.dispatchEvent('pointermove', {
    pointerId: 41, isPrimary: true, button: 0,
    clientX: startX - 30, clientY: startY - 24,
  });
  await canvas.dispatchEvent('pointerup', {
    pointerId: 41, isPrimary: true, button: 0,
    clientX: startX - 30, clientY: startY - 24,
  });
  const afterDrag = await page.evaluate(() => {
    const editor = (window as typeof window & Record<string, any>)
      .posOpsModal.mediaEditor;
    return { panX: editor.panX, panY: editor.panY, drag: editor.drag };
  });
  expect(afterDrag.drag).toBeNull();
  expect(
    afterDrag.panX !== beforeDrag.panX || afterDrag.panY !== beforeDrag.panY,
  ).toBe(true);
  await canvas.focus();
  await canvas.press('ArrowRight');
  await canvas.press('ArrowDown');
  const afterKeyboard = await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const editor = app.posOpsModal.mediaEditor;
    const geometry = app.posDrinkImageCropGeometry(
      editor.sourceWidth, editor.sourceHeight, editor.zoom,
      editor.panX, editor.panY, 1200, 900,
    );
    return {
      panX: editor.panX, panY: editor.panY,
      maxX: geometry.maxX, maxY: geometry.maxY,
    };
  });
  expect(
    afterKeyboard.panX !== afterDrag.panX ||
      afterKeyboard.panY !== afterDrag.panY,
  ).toBe(true);
  expect(Math.abs(afterKeyboard.panX)).toBeLessThanOrEqual(
    afterKeyboard.maxX,
  );
  expect(Math.abs(afterKeyboard.panY)).toBeLessThanOrEqual(
    afterKeyboard.maxY,
  );
  await modal.locator('[data-act="resetPosDrinkImageEditor"]').click();
  await expect(modal.locator('#posPhotoZoomValue')).toHaveText('100%');
  await modal.locator('.modal-actions [data-act="cancelPosDrinkImageEditor"]').click();
  await expect(modal.locator('#posOpsModalTitle')).toHaveText('Drink photos');
  await expect(modal.locator('.pos-media-row')).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    return active?.dataset.posImageProduct || '';
  })).toBe('matcha');
  await modal.locator('.modal-actions [data-act="closePosOpsModal"]').click();
  await expect(modal).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/modal-open/);
  await expect(manageDrinks).toBeFocused();

  const result = await guardResult(page);
  expect(result.guard.fetchCalls).toEqual([]);
  expect(result.guard.storageWrites).toEqual([]);
  expect(result.guard.rpcCalls).toEqual([
    'pos_get_product_media:{"p_business_id":"mobile-business"}',
  ]);
  expect(result.guard.queryCalls).toEqual([]);
  expect(result.guard.objectStorageCalls).toEqual([]);
  expect(result.guard.hookCalls).toEqual([]);
  expect(result.guard.guardErrors).toEqual([]);
  expect(result.guard.fetchInstalled).toBe(true);
  expect(result.guard.storageMethods).toEqual(['setItem', 'removeItem', 'clear']);
  expect(result.guard.cloudMethods).toEqual(['rpc', 'from', 'storage.from']);
  expect(result.guard.hookNames).toEqual(GUARDED_HOOKS);
  expect(result.costingStateUnchanged).toBe(true);
  expect(result.modalOpen).toBe(false);
  expect(errors).toEqual({
    pageErrors: [], consoleErrors: [], failedRequests: [], serverErrors: [],
  });
});
