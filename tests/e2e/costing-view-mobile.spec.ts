import { expect, test, type Page } from '@playwright/test';

type TabExpectation = {
  tab: 'ingredients' | 'packaging' | 'recipes' | 'products';
  section: string;
  table: string;
  controls: string[];
};

async function openSeededCostingApp(page: Page) {
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
    const nextState = app.blank();
    nextState.ingredientCategories = [
      { id: 'powders', name: 'Ceremonial Tea Powders' },
      { id: 'milks', name: 'Milk and Shelf Stable Beverages' },
      { id: 'prepared', name: 'Prepared Cream Mixtures' },
    ];
    nextState.ingredients = [
      {
        id: 'matcha',
        name: 'Moli Ceremonial Matcha Powder',
        kind: 'purchased',
        categoryId: 'powders',
        purchaseQty: 1,
        amountPerItem: 135,
        unit: 'g',
        price: 1_360,
      },
      {
        id: 'oat-milk',
        name: 'Oatside Barista Blend Oat Milk',
        kind: 'purchased',
        categoryId: 'milks',
        purchaseQty: 1,
        amountPerItem: 1,
        unit: 'l',
        price: 180,
      },
      {
        id: 'sea-salt',
        name: 'Fine Sea Salt',
        kind: 'purchased',
        categoryId: '',
        purchaseQty: 1,
        amountPerItem: 225,
        unit: 'g',
        price: 99,
      },
      {
        id: 'whipping-cream',
        name: 'Whipping Cream',
        kind: 'purchased',
        categoryId: 'milks',
        purchaseQty: 1,
        amountPerItem: 1,
        unit: 'l',
        price: 500,
      },
      {
        id: 'sea-salt-cream',
        name: 'Sea Salt Cream Weekend Batch',
        kind: 'mixture',
        categoryId: 'prepared',
        batchYield: 700,
        unit: 'ml',
        components: [
          {
            id: 'cream-component',
            ingredientId: 'whipping-cream',
            qty: 500,
            unit: 'ml',
          },
          {
            id: 'salt-component',
            ingredientId: 'sea-salt',
            qty: 5,
            unit: 'g',
          },
        ],
      },
    ];
    nextState.packaging = [
      { id: 'cup', name: 'Dabba Clear Cup 12oz', qty: 100, price: 257 },
      { id: 'lid', name: 'Dabba Flat Lid', qty: 100, price: 257 },
      { id: 'straw', name: 'Wrapped Drinking Straw', qty: 100, price: 90 },
    ];
    nextState.recipes = [
      {
        id: 'sea-salt-matcha',
        name: 'Sea Salt Cream Matcha',
        yield: 1,
        lines: [
          {
            id: 'matcha-line',
            ingredientId: 'matcha',
            qty: 3,
            unit: 'g',
          },
          {
            id: 'milk-line',
            ingredientId: 'oat-milk',
            qty: 120,
            unit: 'ml',
          },
          {
            id: 'cream-line',
            ingredientId: 'sea-salt-cream',
            qty: 40,
            unit: 'ml',
          },
        ],
      },
    ];
    nextState.products = [
      {
        id: 'sea-salt-matcha-12oz',
        name: 'Sea Salt Cream Matcha 12oz',
        recipeId: 'sea-salt-matcha',
        targetMargin: 53,
        price: 190,
        packLines: [
          { id: 'cup-line', packagingId: 'cup', qty: 1 },
          { id: 'lid-line', packagingId: 'lid', qty: 1 },
          { id: 'straw-line', packagingId: 'straw', qty: 1 },
        ],
      },
    ];

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
      cloudBoundariesInstalled: 0,
    };
    app.__costingViewMobileDirectIo = directIo;

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
          new Error(`Direct fetch is blocked during costing rendering: ${label}`),
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
            throw new Error(
              `${label} is blocked during read-only costing rendering`,
            );
          },
        });
        directIo.cloudBoundariesInstalled += 1;
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
    const cloudClients = [app.cloud?.client, app.supabaseClient].filter(
      (client, index, clients) =>
        client && typeof client === 'object' && clients.indexOf(client) === index,
    );
    cloudClients.forEach((client, index) => {
      const label = `cloudClient[${index}]`;
      guardCloudBoundary(client, 'rpc', `${label}.rpc`);
      guardCloudBoundary(client, 'from', `${label}.from`);
      guardCloudBoundary(client.storage, 'from', `${label}.storage.from`);
    });

    app.state = app.normalizeState(nextState);
    app.ingredientUi = { search: '', category: 'all' };
    app.session = null;
    app.posContext = {
      loaded: true,
      loading: false,
      businessId: '',
      businessName: 'Matcha Luna',
      role: 'owner',
      publications: {},
      error: '',
    };
    app.__costingViewMobileWrites = [];
    app.__costingViewMobileStorage = {
      local: snapshotStorage(localStorage),
      session: snapshotStorage(sessionStorage),
    };
    ['save', 'logChanges', 'cloudSave', 'publishProductToPos'].forEach(
      (name) => {
        if (typeof app[name] !== 'function') return;
        app[name] = () => {
          app.__costingViewMobileWrites.push(name);
          throw new Error(`${name} must not run during costing rendering`);
        };
      },
    );
    app.renderIngredients();
    app.renderPackaging();
    app.renderRecipes();
    app.renderProducts();
    app.activateAppTab('ingredients', false);
  });
}

test('populated costing tabs remain contained, reachable, and read-only', async ({
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

  await openSeededCostingApp(page);

  const tabs: TabExpectation[] = [
    {
      tab: 'ingredients',
      section: '#ingredients',
      table: '#ingTable',
      controls: [
        '#ingredientSearch',
        '[data-entity="ingredient"] [data-field="name"]',
        '[data-act="addIngredient"]',
      ],
    },
    {
      tab: 'packaging',
      section: '#packaging',
      table: '#pkgTable',
      controls: [
        '[data-entity="packaging"] [data-field="name"]',
        '[data-act="addPackaging"]',
      ],
    },
    {
      tab: 'recipes',
      section: '#recipes',
      table: '#recipeList table',
      controls: [
        '[data-entity="recipe"] [data-field="name"]',
        '[data-act="addRecipe"]',
      ],
    },
    {
      tab: 'products',
      section: '#products',
      table: '#productList .card > .scroll > table',
      controls: [
        '[data-entity="product"] [data-field="name"]',
        '[data-act="addProduct"]',
      ],
    },
  ];

  for (const expectation of tabs) {
    await page.locator(`nav button[data-tab="${expectation.tab}"]`).click();
    const section = page.locator(expectation.section);
    await expect(section).toHaveClass(/active/);
    await expect(section).toBeVisible();
    await expect(page.locator(expectation.table).first()).toBeVisible();

    for (const selector of expectation.controls) {
      const control = section.locator(selector).first();
      await expect(control).toBeVisible();
      await control.scrollIntoViewIfNeeded();
      const rect = await control.boundingBox();
      expect(rect, `${expectation.tab} control ${selector} must be reachable`).not.toBeNull();
      expect(rect!.width).toBeGreaterThan(0);
      expect(rect!.height).toBeGreaterThan(0);
    }

    const layout = await section.evaluate((activeSection) => {
      const root = document.documentElement;
      const sectionElement = activeSection as HTMLElement;
      const sectionRect = sectionElement.getBoundingClientRect();
      const scrollRegions = Array.from(
        sectionElement.querySelectorAll<HTMLElement>('.scroll'),
      ).filter((element) => element.getBoundingClientRect().width > 0);
      return {
        viewportWidth: root.clientWidth,
        pageWidth: root.scrollWidth,
        sectionClientWidth: sectionElement.clientWidth,
        sectionScrollWidth: sectionElement.scrollWidth,
        scrollRegionCount: scrollRegions.length,
        scrollRegionsContainTables: scrollRegions.every((element) =>
          Boolean(element.querySelector('table')),
        ),
        scrollRegionsContained: scrollRegions.every((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.left >= sectionRect.left - 1 &&
            rect.right <= sectionRect.right + 1 &&
            rect.left >= -1 &&
            rect.right <= root.clientWidth + 1
          );
        }),
      };
    });
    expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.sectionScrollWidth).toBeLessThanOrEqual(
      layout.sectionClientWidth + 1,
    );
    expect(layout.scrollRegionCount).toBeGreaterThan(0);
    expect(layout.scrollRegionsContainTables).toBe(true);
    expect(layout.scrollRegionsContained).toBe(true);
  }

  const readOnly = await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const snapshotStorage = (storage: Storage) =>
      Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .filter((key): key is string => key !== null)
        .sort()
        .map((key) => [key, storage.getItem(key)]);
    return {
      writes: app.__costingViewMobileWrites,
      directIo: app.__costingViewMobileDirectIo,
      storageUnchanged:
        JSON.stringify(app.__costingViewMobileStorage.local) ===
          JSON.stringify(snapshotStorage(localStorage)) &&
        JSON.stringify(app.__costingViewMobileStorage.session) ===
          JSON.stringify(snapshotStorage(sessionStorage)),
    };
  });

  expect(readOnly.writes).toEqual([]);
  expect(readOnly.directIo).toMatchObject({
    fetchCalls: [],
    cloudCalls: [],
    storageCalls: [],
    guardErrors: [],
    fetchGuardInstalled: true,
    storageGuardsInstalled: 3,
  });
  expect(readOnly.directIo.cloudBoundariesInstalled).toBeGreaterThanOrEqual(3);
  expect(readOnly.storageUnchanged).toBe(true);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(serverErrors).toEqual([]);
});
