import { expect, test, type Locator, type Page } from '@playwright/test';

type ModalIoGuard = {
  fetchCalls: string[];
  storageCalls: string[];
  cloudCalls: string[];
  hookCalls: string[];
  guardErrors: string[];
  fetchGuardInstalled: boolean;
  storageGuardMethods: string[];
  cloudGuardMethods: string[];
  hookGuardNames: string[];
};

type BrowserErrors = {
  pageErrors: string[];
  consoleErrors: string[];
  failedRequests: string[];
  serverErrors: string[];
};

const EXPECTED_HOOK_GUARDS = [
  'save',
  'logChanges',
  'markLocalDirty',
  'cloudSave',
  'rememberSynced',
  'maybeApplyRemote',
  'consumePendingRemoteForCommit',
];

function watchBrowserErrors(page: Page): BrowserErrors {
  const errors: BrowserErrors = {
    pageErrors: [],
    consoleErrors: [],
    failedRequests: [],
    serverErrors: [],
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

async function seedModalStateAndInstallGuards(page: Page) {
  await page.evaluate((expectedHookGuards) => {
    const app = window as typeof window & Record<string, any>;
    const nextState = app.blank();
    nextState.ingredientCategories = [
      { id: 'powders', name: 'Ceremonial Tea Powders and Roasted Tea' },
      { id: 'milks', name: 'Milk and Shelf Stable Beverages' },
      { id: 'prepared', name: 'Prepared Cream and Foam Mixtures' },
    ];
    nextState.ingredients = [
      {
        id: 'matcha',
        name: 'Ceremonial Matcha Powder From Uji Reserve',
        kind: 'purchased',
        categoryId: 'powders',
        purchaseQty: 1,
        amountPerItem: 100,
        unit: 'g',
        price: 1_000,
      },
      {
        id: 'oat-milk',
        name: 'Oatside Barista Blend One Liter Carton',
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
        name: 'Whipping Cream One Liter Carton',
        kind: 'purchased',
        categoryId: 'milks',
        purchaseQty: 1,
        amountPerItem: 1,
        unit: 'l',
        price: 500,
      },
      {
        id: 'sea-salt-cream',
        name: 'Sea Salt Cream Weekend Service Batch',
        kind: 'mixture',
        categoryId: 'prepared',
        batchYield: 700,
        unit: 'ml',
        components: [
          {
            ingredientId: 'whipping-cream',
            qty: 500,
            unit: 'ml',
          },
          { ingredientId: 'sea-salt', qty: 5, unit: 'g' },
        ],
      },
    ];
    nextState.mixtureDrafts = [
      {
        id: 'draft-weekend-foam',
        createdAt: '2026-11-01T08:00:00.000Z',
        updatedAt: '2026-11-02T09:30:00.000Z',
        sourceMixtureId: '',
        sourceSnapshot: null,
        conflictCopy: false,
        data: {
          id: 'draft-mixture-weekend-foam',
          kind: 'mixture',
          name: 'Weekend Strawberry Matcha Foam Test Batch',
          categoryId: 'prepared',
          batchYield: 650,
          unit: 'ml',
          components: [
            { ingredientId: 'whipping-cream', qty: 500, unit: 'ml' },
          ],
          pendingIngredients: [],
        },
        quickIngredient: null,
      },
    ];
    nextState.recipes = [
      {
        id: 'sea-salt-matcha',
        name: 'Sea Salt Cream Matcha',
        yield: 1,
        lines: [
          {
            id: 'cream-line',
            ingredientId: 'sea-salt-cream',
            qty: 40,
            unit: 'ml',
          },
        ],
      },
    ];

    app.state = app.normalizeState(nextState);
    app.ingredientUi = { search: '', category: 'all' };
    app.session = {
      user: { id: 'modal-mobile-owner', email: 'owner@example.test' },
    };
    app.pendingRemote = null;
    app.pendingSave = false;
    app.localDirty = false;
    app.saveTimer = null;
    app.renderAll();
    app.activateAppTab('ingredients', false);

    const snapshotStorage = (storage: Storage) =>
      Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .filter((key): key is string => key !== null)
        .sort()
        .map((key) => [key, storage.getItem(key)]);
    const directIo: ModalIoGuard = {
      fetchCalls: [],
      storageCalls: [],
      cloudCalls: [],
      hookCalls: [],
      guardErrors: [],
      fetchGuardInstalled: false,
      storageGuardMethods: [],
      cloudGuardMethods: [],
      hookGuardNames: [],
    };
    app.__modalsMobileDirectIo = directIo;
    app.__modalsMobileBefore = {
      state: JSON.stringify(app.state),
      drafts: JSON.stringify(app.state.mixtureDrafts),
      local: snapshotStorage(localStorage),
      session: snapshotStorage(sessionStorage),
    };

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
          new Error(`Direct fetch is blocked during modal interaction: ${label}`),
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
            throw new Error(`${area}.${method} is blocked during modal review`);
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
        throw new Error('RPC is blocked during modal review');
      },
      from(name: string) {
        directIo.cloudCalls.push(`cloud.client.from(${name})`);
        throw new Error('Queries are blocked during modal review');
      },
      storage: {
        from(name: string) {
          directIo.cloudCalls.push(`cloud.client.storage.from(${name})`);
          throw new Error('Cloud storage is blocked during modal review');
        },
      },
    };
    app.cloud = {
      ...(app.cloud || {}),
      connected: true,
      client: guardedCloudClient,
    };
    if (app.cloud.client !== guardedCloudClient) {
      directIo.guardErrors.push('cloud.client guard was not retained');
    }
    [
      ['rpc', app.cloud.client.rpc],
      ['from', app.cloud.client.from],
      ['storage.from', app.cloud.client.storage?.from],
    ].forEach(([label, value]) => {
      if (typeof value === 'function') {
        directIo.cloudGuardMethods.push(String(label));
      } else {
        directIo.guardErrors.push(`cloud.client.${label} guard is missing`);
      }
    });

    expectedHookGuards.forEach((name) => {
      if (typeof app[name] !== 'function') {
        directIo.guardErrors.push(`${name} hook is missing`);
        return;
      }
      try {
        app[name] = (..._args: unknown[]) => {
          directIo.hookCalls.push(name);
          throw new Error(`${name} is blocked during modal review`);
        };
        if (typeof app[name] === 'function') directIo.hookGuardNames.push(name);
        else directIo.guardErrors.push(`${name} hook guard was not installed`);
      } catch (error) {
        directIo.guardErrors.push(
          `${name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }, EXPECTED_HOOK_GUARDS);
}

async function expectDialogContained(
  page: Page,
  modal: Locator,
  controls: string[],
) {
  await expect(modal).toBeVisible();
  for (const selector of controls) {
    const control = modal.locator(selector).last();
    await expect(control, `${selector} should be visible`).toBeVisible();
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    const viewport = page.viewportSize();
    expect(box, `${selector} should have a reachable box`).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  }
  const layout = await modal.evaluate((backdrop) => {
    const root = document.documentElement;
    const dialog = backdrop.querySelector<HTMLElement>('.modal')!;
    const rect = dialog.getBoundingClientRect();
    return {
      viewportWidth: root.clientWidth,
      pageWidth: root.scrollWidth,
      dialogLeft: rect.left,
      dialogRight: rect.right,
      dialogScrollWidth: dialog.scrollWidth,
      dialogClientWidth: dialog.clientWidth,
    };
  });
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.dialogLeft).toBeGreaterThanOrEqual(-1);
  expect(layout.dialogRight).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.dialogScrollWidth).toBeLessThanOrEqual(
    layout.dialogClientWidth + 1,
  );
}

async function expectDismissFocus(
  page: Page,
  modal: Locator,
  trigger: Locator,
  browserName: string,
) {
  if (browserName !== 'webkit') {
    await expect(trigger).toBeFocused();
    return;
  }
  const hiddenModalRetainedFocus = await modal.evaluate(
    (element) => element.contains(document.activeElement),
  );
  expect(hiddenModalRetainedFocus).toBe(false);
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeEnabled();
  await trigger.focus();
  await expect(trigger).toBeFocused();
}

async function expectWriteFreeResult(
  page: Page,
  errors: BrowserErrors,
) {
  const result = await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const snapshotStorage = (storage: Storage) =>
      Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .filter((key): key is string => key !== null)
        .sort()
        .map((key) => [key, storage.getItem(key)]);
    return {
      stateUnchanged: app.__modalsMobileBefore.state === JSON.stringify(app.state),
      draftsUnchanged:
        app.__modalsMobileBefore.drafts ===
        JSON.stringify(app.state.mixtureDrafts),
      storageUnchanged:
        JSON.stringify(app.__modalsMobileBefore.local) ===
          JSON.stringify(snapshotStorage(localStorage)) &&
        JSON.stringify(app.__modalsMobileBefore.session) ===
          JSON.stringify(snapshotStorage(sessionStorage)),
      directIo: app.__modalsMobileDirectIo as ModalIoGuard,
    };
  });
  expect(result.stateUnchanged).toBe(true);
  expect(result.draftsUnchanged).toBe(true);
  expect(result.storageUnchanged).toBe(true);
  expect(result.directIo).toEqual({
    fetchCalls: [],
    storageCalls: [],
    cloudCalls: [],
    hookCalls: [],
    guardErrors: [],
    fetchGuardInstalled: true,
    storageGuardMethods: ['setItem', 'removeItem', 'clear'],
    cloudGuardMethods: ['rpc', 'from', 'storage.from'],
    hookGuardNames: EXPECTED_HOOK_GUARDS,
  });
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.failedRequests).toEqual([]);
  expect(errors.serverErrors).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await openTestApp(page);
  await seedModalStateAndInstallGuards(page);
});

test('category, purchased ingredient, and drafts dialogs stay reachable and write-free', async ({
  page,
  browserName,
}) => {
  const errors = watchBrowserErrors(page);

  const categoryTrigger = page.locator('[data-act="openCategoryModal"]');
  await categoryTrigger.focus();
  await expect(categoryTrigger).toBeFocused();
  await categoryTrigger.click();
  const categoryModal = page.locator('#categoryModal');
  await expect(page.locator('#categoryName')).toBeFocused();
  await expect(page.locator('body')).toHaveClass(/modal-open/);
  await expect(page.locator('header')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.wrap')).toHaveAttribute('aria-hidden', 'true');
  await page
    .locator('#categoryName')
    .fill('Seasonal Pop-up Ingredients and Special Components');
  await expectDialogContained(page, categoryModal, [
    '#categoryName',
    '[data-act="saveCategory"]',
    '.modal-actions [data-act="closeCategoryModal"]',
  ]);
  await categoryModal
    .locator('.modal-actions [data-act="closeCategoryModal"]')
    .click();
  await expect(categoryModal).toBeHidden();
  await expectDismissFocus(page, categoryModal, categoryTrigger, browserName);

  const purchasedTrigger = page.locator('[data-act="addIngredient"]');
  await purchasedTrigger.scrollIntoViewIfNeeded();
  await purchasedTrigger.focus();
  await expect(purchasedTrigger).toBeFocused();
  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    app.openPurchasedIngredientModal();
  });
  const purchasedModal = page.locator('#purchasedIngredientModal');
  await expect(page.locator('#purchasedIngredientName')).toBeFocused();
  await page
    .locator('#purchasedIngredientName')
    .fill('Long Shelf Life Oat Milk For Weekend Pop-up Service');
  await page.locator('#purchasedIngredientCategory').selectOption('milks');
  await page.locator('#purchasedIngredientUnit').selectOption('ml');
  await expectDialogContained(page, purchasedModal, [
    '#purchasedIngredientName',
    '#purchasedIngredientCategory',
    '#purchasedIngredientUnit',
    '[data-act="savePurchasedIngredient"]',
    '.modal-actions [data-act="closePurchasedIngredientModal"]',
  ]);
  await purchasedModal
    .locator('.modal-actions [data-act="closePurchasedIngredientModal"]')
    .click();
  await expect(purchasedModal).toBeHidden();
  await expectDismissFocus(
    page,
    purchasedModal,
    purchasedTrigger,
    browserName,
  );

  const draftsTrigger = page.locator('#mixtureDraftButton');
  await draftsTrigger.scrollIntoViewIfNeeded();
  await draftsTrigger.focus();
  await expect(draftsTrigger).toBeFocused();
  await draftsTrigger.click();
  const draftsModal = page.locator('#draftsModal');
  await expect(draftsModal.locator('.draft-card')).toHaveCount(1);
  await expect(draftsModal.locator('.draft-card-name')).toContainText(
    'Weekend Strawberry Matcha Foam Test Batch',
  );
  const resumeDraft = draftsModal.locator('[data-act="resumeMixtureDraft"]');
  await resumeDraft.focus();
  await expect(resumeDraft).toBeFocused();
  await expectDialogContained(page, draftsModal, [
    '[data-act="resumeMixtureDraft"]',
    '[data-act="deleteMixtureDraft"]',
    '.modal-actions [data-act="closeDraftsModal"]',
  ]);
  await draftsModal
    .locator('.modal-actions [data-act="closeDraftsModal"]')
    .click();
  await expect(draftsModal).toBeHidden();
  await expectDismissFocus(page, draftsModal, draftsTrigger, browserName);
  await expect(page.locator('body')).not.toHaveClass(/modal-open/);
  await expect(page.locator('header')).not.toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.wrap')).not.toHaveAttribute('aria-hidden', 'true');

  await expectWriteFreeResult(page, errors);
});

test('create, edit, and read-only mixture dialogs stay contained and discard without writes', async ({
  page,
  browserName,
}) => {
  const errors = watchBrowserErrors(page);

  const createTrigger = page.locator('[data-act="openMixtureModal"]');
  await createTrigger.focus();
  await expect(createTrigger).toBeFocused();
  await createTrigger.click();
  const mixtureModal = page.locator('#mixtureModal');
  await expect(page.locator('#mixtureName')).toBeFocused();
  await page
    .locator('#mixtureName')
    .fill('Long Weekend Strawberry Matcha Cloud Foam Test Mixture');
  await mixtureModal.locator('[data-act="addMixtureComponent"]').click();
  const component = mixtureModal.locator('[data-mix-index="0"]');
  await component
    .locator('[data-mix-field="ingredientId"]')
    .selectOption('oat-milk');
  await component.locator('[data-mix-field="qty"]').fill('120');
  await mixtureModal.locator('[data-mix-root="batchYield"]').fill('700');
  await mixtureModal.locator('[data-act="beginQuickIngredient"]').click();
  await mixtureModal
    .locator('#quickIngredientName')
    .fill('House Strawberry Preserve For Seasonal Weekend Service');
  await mixtureModal
    .locator('[data-quick-field="categoryId"]')
    .selectOption('prepared');
  await mixtureModal.locator('[data-quick-field="purchaseQty"]').fill('1');
  await mixtureModal
    .locator('[data-quick-field="amountPerItem"]')
    .fill('500');
  await mixtureModal.locator('[data-quick-field="unit"]').selectOption('g');
  await mixtureModal.locator('[data-quick-field="price"]').fill('430');
  await expect(mixtureModal.locator('.component-grid[data-mix-index]')).toHaveCount(
    1,
  );
  await expect(mixtureModal.locator('.quick-panel')).toBeVisible();
  await expect(mixtureModal.locator('.mixture-totals')).toBeVisible();
  await expectDialogContained(page, mixtureModal, [
    '#mixtureName',
    '[data-mix-index="0"] [data-mix-field="ingredientId"]',
    '[data-mix-index="0"] [data-mix-field="qty"]',
    '#quickIngredientName',
    '[data-quick-field="price"]',
    '[data-act="discardMixtureChanges"]',
    '[data-act="saveMixtureDraft"]',
    '[data-act="saveMixture"]',
  ]);
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toContain('Discard these unsaved changes?');
    await dialog.accept();
  });
  await mixtureModal.locator('[data-act="discardMixtureChanges"]').click();
  await expect(mixtureModal).toBeHidden();
  await expectDismissFocus(page, mixtureModal, createTrigger, browserName);

  const editTrigger = page.locator(
    '[data-act="editMixture"][data-id="sea-salt-cream"]',
  );
  await editTrigger.scrollIntoViewIfNeeded();
  await editTrigger.focus();
  await expect(editTrigger).toBeFocused();
  await editTrigger.click();
  await expect(page.locator('#mixtureModalTitle')).toHaveText(
    'Edit combined cost',
  );
  await page
    .locator('#mixtureName')
    .fill('Sea Salt Cream Weekend Service Batch Locally Edited');
  await expectDialogContained(page, mixtureModal, [
    '#mixtureName',
    '[data-mix-index="0"] [data-mix-field="ingredientId"]',
    '[data-mix-index="1"] [data-mix-field="qty"]',
    '[data-act="discardMixtureChanges"]',
  ]);
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toContain('Discard these unsaved changes?');
    await dialog.accept();
  });
  await mixtureModal.locator('[data-act="discardMixtureChanges"]').click();
  await expect(mixtureModal).toBeHidden();
  await expectDismissFocus(page, mixtureModal, editTrigger, browserName);

  await page.locator('nav button[data-tab="recipes"]').click();
  const viewTrigger = page.locator(
    '[data-act="viewMixture"][data-id="sea-salt-cream"]',
  );
  await viewTrigger.scrollIntoViewIfNeeded();
  await viewTrigger.focus();
  await expect(viewTrigger).toBeFocused();
  await viewTrigger.click();
  await expect(page.locator('#mixtureModalTitle')).toHaveText('Mixture details');
  await expect(page.locator('#mixtureName')).toBeDisabled();
  await expect(mixtureModal.locator('[data-act="enableMixtureEdit"]')).toBeVisible();
  await expectDialogContained(page, mixtureModal, [
    '#mixtureName',
    '[data-mix-index="0"] [data-mix-field="ingredientId"]',
    '#closeMixtureButton',
    '[data-act="enableMixtureEdit"]',
  ]);
  await mixtureModal.locator('#closeMixtureButton').click();
  await expect(mixtureModal).toBeHidden();
  await expectDismissFocus(page, mixtureModal, viewTrigger, browserName);

  await expectWriteFreeResult(page, errors);
});
