import { expect, test, type Page } from '@playwright/test';

type PublicationIoGuard = {
  fetchCalls: string[];
  cloudCalls: string[];
  storageCalls: string[];
  guardErrors: string[];
  fetchGuardInstalled: boolean;
  storageGuardMethods: string[];
  cloudBoundaryLabels: string[];
  cloudGuardsInstalled: boolean;
};

async function openSeededPublication(page: Page) {
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
    const directIo: PublicationIoGuard = {
      fetchCalls: [],
      cloudCalls: [],
      storageCalls: [],
      guardErrors: [],
      fetchGuardInstalled: false,
      storageGuardMethods: [],
      cloudBoundaryLabels: [],
      cloudGuardsInstalled: false,
    };
    app.__publicationMobileDirectIo = directIo;

    try {
      window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        const method =
          init?.method || (input instanceof Request ? input.method : 'GET');
        const label = `${method.toUpperCase()} ${url}`;
        directIo.fetchCalls.push(label);
        return Promise.reject(
          new Error(`Direct fetch is blocked during publication review: ${label}`),
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
        directIo.storageGuardMethods.push(method);
      } catch (error) {
        directIo.guardErrors.push(
          `Storage.${method}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    });

    const guardedCloudClient = {
      rpc(name: string) {
        directIo.cloudCalls.push(`cloud.client.rpc(${name})`);
        throw new Error('RPC is blocked during publication review');
      },
      from(name: string) {
        directIo.cloudCalls.push(`cloud.client.from(${name})`);
        throw new Error('Queries are blocked during publication review');
      },
      storage: {
        from(name: string) {
          directIo.cloudCalls.push(`cloud.client.storage.from(${name})`);
          throw new Error('Cloud storage is blocked during publication review');
        },
      },
    };
    directIo.cloudBoundaryLabels.push(
      'cloud.client.rpc',
      'cloud.client.from',
      'cloud.client.storage.from',
    );

    const nextState = app.blank();
    nextState.ingredients = [
      {
        id: 'matcha',
        name: 'Ceremonial Matcha Powder',
        kind: 'purchased',
        categoryId: '',
        purchaseQty: 1,
        amountPerItem: 100,
        unit: 'g',
        price: 1_000,
      },
    ];
    nextState.packaging = [
      {
        id: 'cup',
        name: 'Dabba Clear Cup 12oz',
        qty: 100,
        price: 257,
      },
    ];
    nextState.recipes = [
      {
        id: 'matcha-latte',
        name: 'Matcha Latte',
        yield: 1,
        lines: [
          {
            id: 'matcha-line',
            ingredientId: 'matcha',
            qty: 3,
            unit: 'g',
          },
        ],
      },
    ];
    nextState.products = [
      {
        id: 'matcha-latte-12oz',
        name: 'Matcha Latte 12oz',
        recipeId: 'matcha-latte',
        targetMargin: 53,
        price: 170,
        packLines: [{ id: 'cup-line', packagingId: 'cup', qty: 1 }],
      },
    ];

    app.state = app.normalizeState(nextState);
    app.session = {
      user: { id: 'publication-mobile-owner', email: 'owner@example.test' },
    };
    app.cloud = {
      ...(app.cloud || {}),
      connected: true,
      client: guardedCloudClient,
    };
    directIo.cloudGuardsInstalled =
      app.cloud.client === guardedCloudClient &&
      typeof app.cloud.client.rpc === 'function' &&
      typeof app.cloud.client.from === 'function' &&
      typeof app.cloud.client.storage?.from === 'function';
    app.costingCloudReady = true;
    app.pendingRemote = null;
    app.pendingSave = false;
    app.saveTimer = null;
    app.localDirty = false;
    app.posContext = {
      loaded: true,
      loading: false,
      businessId: 'business-matcha-luna',
      businessName: 'Matcha Luna',
      role: 'owner',
      publications: {},
      error: '',
    };
    app.__publicationMobileBefore = {
      state: JSON.stringify(app.state),
      publications: JSON.stringify(app.posContext.publications),
      notice: app.posCheckout.notice,
      local: snapshotStorage(localStorage),
      session: snapshotStorage(sessionStorage),
    };
    app.renderProducts();
    app.activateAppTab('products', false);
  });
}

test('publication review stays contained, reachable, and write-free', async ({
  page,
}) => {
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

  await openSeededPublication(page);

  const pricing = page.locator('section#products');
  const openButton = pricing.locator('[data-act="openPublishModal"]');
  await expect(pricing).toHaveClass(/active/);
  await expect(openButton).toBeVisible();
  await expect(openButton).toHaveText('Publish to POS');
  await openButton.scrollIntoViewIfNeeded();
  await openButton.focus();
  await expect(openButton).toBeFocused();

  await openButton.click();
  const modal = page.locator('#publishModal');
  await expect(modal).toBeVisible();
  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    app.__publicationMobileReturnFocus = app.modalReturnFocus;
  });
  await expect(page.locator('#publishModalTitle')).toHaveText(
    'Publish product to POS',
  );
  await expect(page.locator('#publishCategory')).toHaveValue('Drinks');
  await expect(page.locator('#publishCategory')).toBeFocused();
  await expect(page.locator('#publishSize')).toHaveValue('');
  await expect(modal.locator('.publish-summary')).toContainText('170.00');
  await expect(modal.locator('.publish-note')).toContainText(
    'frozen POS version',
  );

  await page.locator('#publishCategory').fill('Matcha');
  await page.locator('#publishSize').fill('12 oz');
  await expect(page.locator('#publishCategory')).toHaveValue('Matcha');
  await expect(page.locator('#publishSize')).toHaveValue('12 oz');
  const localDraft = await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    return {
      categoryName: app.publishSnapshot.categoryName,
      size: app.publishSnapshot.size,
    };
  });
  expect(localDraft).toEqual({ categoryName: 'Matcha', size: '12 oz' });

  const controls = [
    '#publishCategory',
    '#publishSize',
    '[data-act="closePublishModal"]',
    '[data-act="publishProductToPos"]',
  ];
  for (const selector of controls) {
    const control = modal.locator(selector).last();
    await expect(control).toBeVisible();
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    const viewport = page.viewportSize();
    expect(box, `${selector} must have a reachable box`).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  }

  const layout = await modal.evaluate((backdrop) => {
    const root = document.documentElement;
    const dialog = backdrop.querySelector<HTMLElement>('.modal')!;
    const dialogRect = dialog.getBoundingClientRect();
    const visible = Array.from(
      dialog.querySelectorAll<HTMLElement>('input, button, .metric, .publish-note'),
    ).filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden';
    });
    return {
      viewportWidth: root.clientWidth,
      pageWidth: root.scrollWidth,
      dialogLeft: dialogRect.left,
      dialogRight: dialogRect.right,
      controlsContained: visible.every((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= -1 && rect.right <= root.clientWidth + 1;
      }),
    };
  });
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.dialogLeft).toBeGreaterThanOrEqual(-1);
  expect(layout.dialogRight).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.controlsContained).toBe(true);

  await modal.locator('[data-act="closePublishModal"]').last().click();
  await expect(modal).toBeHidden();
  await expect.poll(() => page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    return document.activeElement === app.__publicationMobileReturnFocus;
  })).toBe(true);

  const readOnly = await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const snapshotStorage = (storage: Storage) =>
      Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .filter((key): key is string => key !== null)
        .sort()
        .map((key) => [key, storage.getItem(key)]);
    return {
      stateUnchanged:
        app.__publicationMobileBefore.state === JSON.stringify(app.state),
      publicationsUnchanged:
        app.__publicationMobileBefore.publications ===
        JSON.stringify(app.posContext.publications),
      noticeUnchanged:
        app.__publicationMobileBefore.notice === app.posCheckout.notice,
      localStorageUnchanged:
        JSON.stringify(app.__publicationMobileBefore.local) ===
        JSON.stringify(snapshotStorage(localStorage)),
      sessionStorageUnchanged:
        JSON.stringify(app.__publicationMobileBefore.session) ===
        JSON.stringify(snapshotStorage(sessionStorage)),
      directIo: app.__publicationMobileDirectIo as PublicationIoGuard,
      modal: {
        open: app.publishModalOpen,
        productId: app.publishProductId,
        snapshot: app.publishSnapshot,
        submitting: app.publishSubmitting,
      },
    };
  });
  expect(readOnly.stateUnchanged).toBe(true);
  expect(readOnly.publicationsUnchanged).toBe(true);
  expect(readOnly.noticeUnchanged).toBe(true);
  expect(readOnly.localStorageUnchanged).toBe(true);
  expect(readOnly.sessionStorageUnchanged).toBe(true);
  expect(readOnly.directIo).toEqual({
    fetchCalls: [],
    cloudCalls: [],
    storageCalls: [],
    guardErrors: [],
    fetchGuardInstalled: true,
    storageGuardMethods: ['setItem', 'removeItem', 'clear'],
    cloudBoundaryLabels: [
      'cloud.client.rpc',
      'cloud.client.from',
      'cloud.client.storage.from',
    ],
    cloudGuardsInstalled: true,
  });
  expect(readOnly.modal).toEqual({
    open: false,
    productId: '',
    snapshot: null,
    submitting: false,
  });
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(serverErrors).toEqual([]);
});
