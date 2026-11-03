import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const modalNames = [
  'refreshModalBodyClass', 'focusSoon', 'focusLastMixtureField',
  'consumePendingRemoteForCommit', 'applyPendingAfterModal',
  'openCategoryModal', 'closeCategoryModal',
  'purchasedIngredientCategoryOptions', 'openPurchasedIngredientModal',
  'closePurchasedIngredientModal', 'savePurchasedIngredient',
  'categoryNameError', 'saveCategory', 'deleteCategory', 'newMixtureDraft',
  'draftIngredientLookup', 'mixtureCandidates', 'draftMixtureInfo',
  'sanitizeMixtureSessionCategories', 'captureMixtureSession',
  'mixtureSessionChanged', 'hasDraftValue',
  'mixtureSessionHasMeaningfulWork', 'setMixtureError',
  'openMixtureModal', 'closeMixtureModal', 'currentMixtureDraftConflict',
  'saveCurrentMixtureDraft', 'requestCloseMixtureModal',
  'discardMixtureChanges', 'renderDraftButton', 'formatDraftTime',
  'renderDraftsModal', 'openDraftsModal', 'closeDraftsModal',
  'resumeMixtureDraft', 'deleteMixtureDraft', 'mixtureComponentCost',
  'beginQuickIngredient', 'setMixtureSaving', 'renderMixtureModal',
  'refreshMixtureTotals', 'quickIngredientError', 'addQuickIngredient',
  'mixtureValidationError', 'saveMixture',
] as const;

const protectedModalNames = [
  'refreshModalBodyClass', 'draftMixtureInfo', 'openMixtureModal',
  'closeMixtureModal', 'saveMixture',
] as const;

const activeRuntimeFiles = [
  'state.js', 'pos-catalog.js', 'workspace-sync.js',
  'pos-operations.js', 'boot.js', 'start.js',
] as const;

const transitionRuntimeFiles = [
  'core.js', 'runtime-factories.js', 'state.js', 'costing.js',
  'pos-catalog.js', 'stocks.js', 'workspace-sync.js', 'pos-operations.js',
  'publication.js', 'render-costing.js', 'render-modals.js',
  'render-pos.js', 'render-stocks.js', 'support.js', 'events.js',
  'boot.js', 'compatibility.js', 'start.js',
] as const;

async function stubSupabase(page: Page): Promise<void> {
  await page.route(
    /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/,
    async (route) => route.fulfill({
      contentType: 'application/javascript',
      body: 'window.supabase={createClient:function(){throw new Error("Supabase is disabled in browser tests");}};',
    }),
  );
}

async function openPrimary(page: Page): Promise<void> {
  await stubSupabase(page);
  await page.goto('index.html?test=1', { waitUntil: 'load' });
  await page.evaluate(() =>
    (window as typeof window & { MatchaLunaApp: { ready: Promise<void> } })
      .MatchaLunaApp.ready,
  );
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
}

async function openClassic(context: BrowserContext): Promise<Page> {
  const builtHtml = readFileSync(resolve(process.cwd(), 'dist/index.html'), 'utf8');
  const scripts = transitionRuntimeFiles
    .map((file) => `<script src="/Scoopies/assets/js/${file}"></script>`)
    .join('\n');
  const html = builtHtml
    .replace(/\s*<script type="module"[^>]*><\/script>/, '')
    .replace('</body>', `${scripts}\n</body>`);
  const page = await context.newPage();
  await stubSupabase(page);
  await page.route('**/index.html?test=1&modals-transition=1', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.goto('index.html?test=1&modals-transition=1', { waitUntil: 'load' });
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
  return page;
}

async function installHarness(page: Page): Promise<void> {
  await page.evaluate(() => {
    const app = window as any;
    const NativeDate = Date;
    const h: Record<string, any> = {};
    h.reset = () => {
      h.trace = [];
      h.timers = [];
      h.confirmations = [];
      h.confirmResult = true;
      h.uid = 0;
      app.state = {
        schemaVersion: 3,
        ingredientCategories: [
          { id: 'main', name: 'Main & Milk' },
          { id: 'cream', name: 'Cream' },
        ],
        ingredients: [
          { id: 'milk', kind: 'purchased', categoryId: 'main', name: 'Milk', purchaseQty: 1, amountPerItem: 1000, unit: 'ml', price: 120 },
          { id: 'salt', kind: 'purchased', categoryId: 'main', name: 'Salt', purchaseQty: 1, amountPerItem: 100, unit: 'g', price: 50 },
          { id: 'saved-mix', kind: 'mixture', categoryId: 'cream', name: 'Saved Cream', batchYield: 100, unit: 'ml', components: [{ ingredientId: 'milk', qty: 50, unit: 'ml' }] },
        ],
        mixtureDrafts: [], packaging: [], recipes: [], products: [],
      };
      app.ingredientUi = { category: 'all', search: 'old' };
      app.pendingRemote = null;
      app.syncedState = app.snapshot(app.state);
      app.lastState = app.snapshot(app.state);
      app.categoryModalOpen = false;
      app.categoryEditId = '';
      app.purchasedIngredientModalOpen = false;
      app.purchasedIngredientReturnFocus = null;
      app.mixtureModalOpen = false;
      app.mixtureDraft = null;
      app.mixtureReadOnly = false;
      app.mixtureSaving = false;
      app.quickIngredientDraft = null;
      app.mixtureOriginalExisting = false;
      app.draftsModalOpen = false;
      app.activeMixtureDraftId = '';
      app.mixtureInitialSnapshot = null;
      app.mixtureSourceId = '';
      app.mixtureSourceSnapshot = null;
      app.openedMixtureDraftUpdatedAt = '';
      app.openedMixtureDraftFingerprint = '';
      app.mixtureDraftNotice = '';
      app.modalReturnFocus = null;
      app.publishModalOpen = false;
      app.stockModal = { open: false };
      app.posOpsModal = { open: false };
      app.cloud = { connected: false, client: null };
      app.session = null;
      app.KEY = 'phase4g-test';
      app.uid = () => `uid-${++h.uid}`;
      app.logChanges = () => h.trace.push('logChanges');
      app.save = () => h.trace.push('save');
      app.renderAll = () => h.trace.push('renderAll');
      app.setStatus = (message: string, kind: string) =>
        h.trace.push(`status:${message}:${kind}`);
      app.alert = (message: string) => h.trace.push(`alert:${message}`);
      app.confirm = (message: string) => {
        h.confirmations.push(message);
        h.trace.push(`confirm:${message}`);
        return h.confirmResult;
      };
      app.setTimeout = (callback: () => void, delay: number) => {
        h.trace.push(`timer:${delay}`);
        h.timers.push(callback);
        return h.timers.length;
      };
      class FixedDate extends NativeDate {
        constructor(value?: string | number | Date) {
          super(value == null ? '2026-10-03T06:00:00.000Z' : value);
        }
        static now() { return new NativeDate('2026-10-03T06:00:00.000Z').getTime(); }
      }
      app.Date = FixedDate;
      h.flush = () => {
        while (h.timers.length) h.timers.shift()();
      };
      ['categoryModal', 'purchasedIngredientModal', 'mixtureModal', 'draftsModal']
        .forEach((id) => {
          const element = document.getElementById(id) as HTMLElement | null;
          if (element) element.hidden = true;
        });
      const mixtureContent = document.getElementById('mixtureModalContent');
      if (mixtureContent) mixtureContent.innerHTML = '';
      const draftsList = document.getElementById('draftsList');
      if (draftsList) draftsList.innerHTML = '';
      document.body.classList.remove('modal-open');
      [document.querySelector('header'), document.querySelector('.wrap')]
        .forEach((element) => {
          if (!element) return;
          (element as HTMLElement).inert = false;
          element.removeAttribute('aria-hidden');
        });
      return app.state;
    };
    app.__phase4gModalHarness = h;
  });
}

async function openPair(page: Page, context: BrowserContext): Promise<[Page, Page]> {
  await openPrimary(page);
  await installHarness(page);
  const classic = await openClassic(context);
  await installHarness(classic);
  return [page, classic];
}

test('typed Modals boundary preserves API, registration, live descriptors, runtime paths, and fallback', async ({ page, context }) => {
  await openPrimary(page);
  const contract = await page.evaluate((names) => {
    const root = window as typeof window & Record<string, any>;
    const facade = root.MatchaLunaApp;
    const modals = facade.domains.modals as Record<string, any>;
    const descriptor = (target: object, name: string) => {
      const value = Object.getOwnPropertyDescriptor(target, name)!;
      return {
        configurable: value.configurable, enumerable: value.enumerable,
        writable: value.writable, hasGetter: typeof value.get === 'function',
        hasSetter: typeof value.set === 'function',
      };
    };
    const originals = Object.fromEntries(names.map((name) => [name, modals[name]]));
    const roundTrips = names.map((name, index) => {
      const domainValue = function domainReplacement() { return index; };
      modals[name] = domainValue;
      const domainReachedRoot = root[name] === domainValue;
      const domainReachedLegacy = facade.domains.legacy[name] === domainValue;
      const rootValue = function rootReplacement() { return index + 100; };
      root[name] = rootValue;
      const rootReachedDomain = modals[name] === rootValue;
      const rootReachedLegacy = facade.domains.legacy[name] === rootValue;
      modals[name] = originals[name];
      return { domainReachedRoot, domainReachedLegacy, rootReachedDomain, rootReachedLegacy };
    });
    return {
      version: facade.contractVersion,
      contractLength: facade.contractNames.length,
      domainOrder: Object.keys(facade.domains),
      domainSizes: Object.fromEntries(Object.entries(facade.domains)
        .map(([name, domain]) => [name, Object.keys(domain as object).length])),
      modalOrder: Object.keys(modals),
      protectedNames: names.filter((name) => facade.contractNames.includes(name)),
      rootMatches: names.map((name) => root[name] === modals[name]),
      namespaceDescriptors: names.map((name) => descriptor(modals, name)),
      rootDescriptors: names.map((name) => descriptor(root, name)),
      roundTrips,
      activeRuntime: Array.from(
        document.querySelectorAll<HTMLScriptElement>('script[data-matcha-luna-runtime]'),
        (script) => script.dataset.matchaLunaRuntime,
      ),
    };
  }, [...modalNames]);

  const classic = await openClassic(context);
  const classicRuntime = await classic.evaluate(() => ({
    modules: document.querySelectorAll('script[type="module"]').length,
    scripts: Array.from(
      document.querySelectorAll<HTMLScriptElement>('script[src*="/assets/js/"]'),
      (script) => new URL(script.src).pathname.split('/').pop(),
    ),
    hasModalsDomain: Boolean(
      (window as typeof window & Record<string, any>).MatchaLunaApp?.domains?.modals,
    ),
  }));
  await classic.close();

  const response = await page.request.get(
    'http://127.0.0.1:4173/Scoopies/assets/js/render-modals.js',
  );
  const served = (await response.text()).replace(/\r\n?/g, '\n');
  const source = readFileSync(resolve(process.cwd(), 'assets/js/render-modals.js'), 'utf8')
    .replace(/\r\n?/g, '\n');
  const bytes = Buffer.from(served, 'utf8');
  const sha256 = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  const gitBlob = createHash('sha1')
    .update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');
  const main = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8');
  const publicationSlot = main.indexOf('registerPublicationModule(facade, window)');
  const costingViewSlot = main.indexOf('registerCostingViewModule(facade, window)');
  const modalsSlot = main.indexOf('registerModalsModule(facade, window)');
  const posSlot = main.indexOf('registerPosViewModule(facade, window)');
  const stocksViewSlot = main.indexOf('registerStocksViewModule(facade, window)');

  expect(contract).toMatchObject({
    version: 1,
    contractLength: 175,
    domainOrder: [
      'core', 'runtime', 'costing', 'stocks', 'publication', 'modals',
      'pos', 'support', 'events', 'legacy',
    ],
    domainSizes: {
      core: 15, runtime: 4, costing: 37, stocks: 63, publication: 10,
      modals: 46, pos: 19, support: 3, events: 1,
    },
    modalOrder: modalNames,
    protectedNames: protectedModalNames,
    activeRuntime: activeRuntimeFiles,
  });
  expect(contract.rootMatches).toEqual(modalNames.map(() => true));
  expect(contract.namespaceDescriptors).toEqual(modalNames.map(() => ({
    configurable: true, enumerable: true, writable: true,
    hasGetter: false, hasSetter: false,
  })));
  expect(contract.rootDescriptors).toEqual(modalNames.map(() => ({
    configurable: true, enumerable: true, writable: undefined,
    hasGetter: true, hasSetter: true,
  })));
  expect(contract.roundTrips).toEqual(modalNames.map((name) => {
    const protectedName = (protectedModalNames as readonly string[]).includes(name);
    return {
      domainReachedRoot: true, domainReachedLegacy: protectedName,
      rootReachedDomain: true, rootReachedLegacy: protectedName,
    };
  }));
  expect(classicRuntime).toEqual({
    modules: 0, scripts: transitionRuntimeFiles, hasModalsDomain: false,
  });
  expect(response.status()).toBe(200);
  expect(served).toBe(source);
  expect(gitBlob).toBe('86175e501cbaaaa4136b01f7e9c0ec1483ab9b2d');
  expect(sha256).toBe('881269390352390F1C77F78B3D9230403E2A7E41498C11B0DA3B33914299819C');
  expect(costingViewSlot).toBeGreaterThan(publicationSlot);
  expect(modalsSlot).toBeGreaterThan(costingViewSlot);
  expect(posSlot).toBeGreaterThan(modalsSlot);
  expect(stocksViewSlot).toBeGreaterThan(posSlot);
});

async function collectLifecycle(page: Page) {
  return page.evaluate(() => {
    const app = window as any;
    const h = app.__phase4gModalHarness;
    h.reset();
    app.categoryModalOpen = true;
    app.refreshModalBodyClass();
    const accessibility = {
      body: document.body.classList.contains('modal-open'),
      headerInert: (document.querySelector('header') as HTMLElement).inert,
      headerHidden: document.querySelector('header')?.getAttribute('aria-hidden'),
      wrapInert: (document.querySelector('.wrap') as HTMLElement).inert,
    };
    app.categoryModalOpen = false;
    app.refreshModalBodyClass();
    const content = document.getElementById('mixtureModalContent')!;
    content.innerHTML = '<div data-mix-index="0"><input data-mix-field="qty" id="firstQty"></div>' +
      '<div data-mix-index="1"><input data-mix-field="qty" id="lastQty"></div>';
    app.focusSoon('#categoryName');
    app.focusLastMixtureField('qty');
    h.flush();
    const focused = (document.activeElement as HTMLElement | null)?.id;

    app.normalizeState = (value: any) => { h.trace.push(`normalize:${value.marker}`); return { normalized: value.marker }; };
    app.mergeStates = (base: any, local: any, remote: any) => {
      h.trace.push(`merge:${base.base || 'blank'}:${local.local}:${remote.normalized}`);
      return { merged: true };
    };
    app.blank = () => ({ base: 'blank' });
    app.reconcileCostingInventoryLifecycle = (remote: any, merged: any, base: any) => {
      h.trace.push(`reconcile:${remote.normalized}:${merged.merged}:${base.base || 'blank'}`);
      return { state: { committed: remote.normalized }, blocked: ['Milk'] };
    };
    app.rememberSynced = (remote: any, render: boolean) =>
      h.trace.push(`remember:${remote.normalized}:${render}`);
    app.snapshot = (value: any) => { h.trace.push(`snapshot:${value.committed}`); return { snap: value.committed }; };
    Storage.prototype.setItem = function (key: string, value: string) {
      h.trace.push(`storage:${key}:${value}`);
      throw new Error('quota');
    };
    app.pendingRemote = { marker: 'remote' };
    app.syncedState = { base: 'synced' };
    app.state = { local: 'local' };
    const consumed = app.consumePendingRemoteForCommit(true);
    h.flush();
    const committed = {
      consumed, state: app.state, pending: app.pendingRemote,
      lastState: app.lastState, trace: [...h.trace],
    };

    h.trace = [];
    app.pendingRemote = { marker: 'first' };
    app.appIsEditing = () => { h.trace.push('editing'); return false; };
    app.maybeApplyRemote = (value: any) => h.trace.push(`apply:${value.marker}`);
    app.applyPendingAfterModal();
    app.pendingRemote = { marker: 'latest' };
    h.flush();
    const delayed = [...h.trace];

    h.trace = [];
    app.pendingRemote = { marker: 'boom' };
    app.normalizeState = (value: any) => value;
    app.mergeStates = () => ({ merged: true });
    app.reconcileCostingInventoryLifecycle = () => { h.trace.push('throw-reconcile'); throw new Error('reconcile failed'); };
    let exception = '';
    try { app.consumePendingRemoteForCommit(false); } catch (error) {
      exception = (error as Error).message;
    }
    return {
      accessibility, closed: {
        body: document.body.classList.contains('modal-open'),
        headerInert: (document.querySelector('header') as HTMLElement).inert,
        headerHidden: document.querySelector('header')?.getAttribute('aria-hidden'),
      },
      focused, committed, delayed, exception,
      exceptionPending: app.pendingRemote,
      exceptionTrace: [...h.trace],
      emptyReturn: (() => { app.pendingRemote = null; return app.consumePendingRemoteForCommit(); })(),
    };
  });
}

test('typed shared lifecycle, focus, pending merge, and delayed remote application match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectLifecycle(typedPage);
  const classic = await collectLifecycle(classicPage);
  expect(typed).toEqual(classic);
  expect(typed).toMatchObject({
    accessibility: { body: true, headerInert: true, headerHidden: 'true', wrapInert: true },
    closed: { body: false, headerInert: false, headerHidden: null },
    focused: '',
    committed: { consumed: true, state: { committed: 'remote' }, pending: null },
    delayed: ['timer:0', 'editing', 'apply:latest'],
    exception: 'reconcile failed',
    exceptionPending: { marker: 'boom' },
    emptyReturn: false,
  });
  await classicPage.close();
});
async function collectCategoryPurchased(page: Page) {
  return page.evaluate(() => {
    const app = window as any;
    const h = app.__phase4gModalHarness;
    h.reset();
    const trigger = document.getElementById('mixtureDraftButton') as HTMLElement;
    trigger.focus();
    app.openCategoryModal('main');
    h.flush();
    const categoryOpen = {
      editId: app.categoryEditId,
      open: app.categoryModalOpen,
      title: document.getElementById('categoryModalTitle')?.textContent,
      value: (document.getElementById('categoryName') as HTMLInputElement).value,
      error: document.getElementById('categoryError')?.textContent,
      hidden: (document.getElementById('categoryModal') as HTMLElement).hidden,
      focused: (document.activeElement as HTMLElement | null)?.id,
      bodyOpen: document.body.classList.contains('modal-open'),
    };
    app.closeCategoryModal(true);
    const categoryClosed = {
      editId: app.categoryEditId, open: app.categoryModalOpen,
      hidden: (document.getElementById('categoryModal') as HTMLElement).hidden,
      focused: (document.activeElement as HTMLElement | null)?.id,
      bodyOpen: document.body.classList.contains('modal-open'),
    };
    const options = [
      app.purchasedIngredientCategoryOptions(),
      app.purchasedIngredientCategoryOptions('main'),
      app.purchasedIngredientCategoryOptions(7),
    ];
    const validations = [
      app.categoryNameError('', ''),
      app.categoryNameError(' all ', ''),
      app.categoryNameError('MAIN & MILK', ''),
      app.categoryNameError('MAIN & MILK', 'main'),
      app.categoryNameError(' New Folder ', ''),
    ];

    app.ingredientUi.category = 'main';
    app.openPurchasedIngredientModal();
    h.flush();
    const purchasedOpen = {
      open: app.purchasedIngredientModalOpen,
      name: (document.getElementById('purchasedIngredientName') as HTMLInputElement).value,
      categoryHtml: (document.getElementById('purchasedIngredientCategory') as HTMLSelectElement).innerHTML,
      category: (document.getElementById('purchasedIngredientCategory') as HTMLSelectElement).value,
      unit: (document.getElementById('purchasedIngredientUnit') as HTMLSelectElement).value,
      hidden: (document.getElementById('purchasedIngredientModal') as HTMLElement).hidden,
      focused: (document.activeElement as HTMLElement | null)?.id,
    };
    h.trace = [];
    app.consumePendingRemoteForCommit = (render: any) => {
      h.trace.push(`consume:${String(render)}`);
      return false;
    };
    const rejected = app.savePurchasedIngredient();
    const rejectedResult = {
      value: rejected,
      error: document.getElementById('purchasedIngredientError')?.textContent,
      ingredients: app.state.ingredients.length,
      trace: [...h.trace],
    };

    h.trace = [];
    (document.getElementById('purchasedIngredientName') as HTMLInputElement).value = '  Oat Cream  ';
    const category = document.getElementById('purchasedIngredientCategory') as HTMLSelectElement;
    category.innerHTML += '<option value="stale">Stale</option>';
    category.value = 'stale';
    (document.getElementById('purchasedIngredientUnit') as HTMLSelectElement).value = 'ml';
    app.closePurchasedIngredientModal = (skip: any) => h.trace.push(`close:${skip}`);
    app.focusSoon = (selector: string) => h.trace.push(`focus:${selector}`);
    const saved = app.savePurchasedIngredient();
    return {
      categoryOpen, categoryClosed, options, validations, purchasedOpen,
      rejectedResult,
      success: {
        value: saved,
        created: app.state.ingredients.at(-1),
        ui: app.ingredientUi,
        trace: [...h.trace],
      },
    };
  });
}

test('typed category and purchased-input options, lifecycle, validation, and saves match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectCategoryPurchased(typedPage);
  const classic = await collectCategoryPurchased(classicPage);
  expect(typed).toEqual(classic);
  expect(typed.categoryOpen).toMatchObject({
    editId: 'main', open: true, title: 'Rename category',
    value: 'Main & Milk', error: '', hidden: false,
    focused: 'categoryName', bodyOpen: true,
  });
  expect(typed.categoryClosed).toMatchObject({
    editId: '', open: false, hidden: true,
    focused: 'categoryName', bodyOpen: false,
  });
  expect(typed.validations).toEqual([
    'Enter a category name.', 'That name is reserved by the app.',
    'A category with that name already exists.', '', '',
  ]);
  expect(typed.rejectedResult).toEqual({
    value: false, error: 'Enter an ingredient name.', ingredients: 3,
    trace: ['consume:false'],
  });
  expect(typed.success.value).toBe(true);
  expect(typed.success.created).toEqual({
    id: 'uid-1', kind: 'purchased', categoryId: '', name: 'Oat Cream',
    purchaseQty: '', amountPerItem: '', unit: 'ml', price: '',
  });
  expect(typed.success.trace).toEqual([
    'consume:false', 'logChanges', 'save', 'close:true', 'renderAll',
    'focus:[data-entity="ingredient"][data-id="uid-1"] [data-field="purchaseQty"]',
  ]);
  await classicPage.close();
});

async function collectCategoryMutations(page: Page) {
  return page.evaluate(() => {
    const app = window as any;
    const h = app.__phase4gModalHarness;
    h.reset();
    app.consumePendingRemoteForCommit = (render: any) => {
      h.trace.push(`consume:${String(render)}`); return false;
    };
    app.closeCategoryModal = (skip: any) => h.trace.push(`close:${skip}`);
    app.focusSoon = (selector: string) => h.trace.push(`focus:${selector}`);
    (document.getElementById('categoryName') as HTMLInputElement).value = '  New Folder  ';
    app.categoryEditId = '';
    const addResult = app.saveCategory();
    const added = {
      result: addResult,
      categories: app.state.ingredientCategories,
      ui: app.ingredientUi,
      trace: [...h.trace],
    };

    h.reset();
    app.consumePendingRemoteForCommit = () => false;
    (document.getElementById('categoryName') as HTMLInputElement).value = 'Gone';
    app.categoryEditId = 'missing';
    const missingEdit = {
      result: app.saveCategory(),
      error: document.getElementById('categoryError')?.textContent,
      trace: [...h.trace],
    };

    h.reset();
    app.state.mixtureDrafts = [{
      id: 'draft-1', createdAt: 'old', updatedAt: 'old',
      sourceSnapshot: { categoryId: 'main' },
      data: {
        id: 'draft-mixture', kind: 'mixture', name: 'Draft', categoryId: 'main',
        batchYield: '', unit: 'ml', components: [],
        pendingIngredients: [{ id: 'pending', name: 'Pending', categoryId: 'main' }],
      },
      quickIngredient: { id: 'quick', categoryId: 'main' },
    }];
    const missingDelete = app.deleteCategory('missing');
    h.confirmResult = false;
    const cancelled = app.deleteCategory('main');
    const cancelledSnapshot = app.snapshot(app.state);
    h.confirmResult = true;
    h.trace = [];
    const deleted = app.deleteCategory('main');
    const deletion = {
      missingDelete, cancelled, cancelledSnapshot, deleted,
      categories: app.state.ingredientCategories,
      ingredientCategories: app.state.ingredients.map((item: any) => item.categoryId),
      draft: app.state.mixtureDrafts[0], ui: app.ingredientUi,
      confirmations: [...h.confirmations], trace: [...h.trace],
    };

    h.reset();
    h.trace = [];
    app.consumePendingRemoteForCommit = (render: any) => {
      h.trace.push(`event-consume:${render}`); return false;
    };
    app.deleteCategory = (id: string) => { h.trace.push(`event-delete:${id}`); return true; };
    const button = document.createElement('button');
    button.dataset.act = 'deleteCategory';
    button.dataset.id = 'main';
    document.body.appendChild(button);
    button.click();
    button.remove();
    return { added, missingEdit, deletion, eventTrace: [...h.trace] };
  });
}

test('typed category mutation, cascading deletion, and live Events delegation match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectCategoryMutations(typedPage);
  const classic = await collectCategoryMutations(classicPage);
  expect(typed).toEqual(classic);
  expect(typed.added).toMatchObject({
    result: true,
    ui: { category: 'uid-1', search: 'old' },
    trace: [
      'consume:undefined', 'logChanges', 'save', 'close:true', 'renderAll',
      'focus:[data-act="openCategoryModal"]',
    ],
  });
  expect(typed.missingEdit).toMatchObject({
    result: false,
    error: 'This category was removed on another device. Close and try again.',
  });
  expect(typed.deletion).toMatchObject({
    missingDelete: false, cancelled: false, deleted: true,
    categories: [{ id: 'cream', name: 'Cream' }],
    ingredientCategories: ['', '', 'cream'],
    ui: { category: 'uncategorized', search: 'old' },
    trace: [
      'confirm:Delete the folder "Main & Milk"? 2 items and 1 draft will move to Uncategorized.',
      'logChanges', 'save', 'renderAll',
    ],
  });
  expect(typed.deletion.draft.updatedAt).toBe('2026-10-03T06:00:00.000Z');
  expect(typed.deletion.draft.data.categoryId).toBe('');
  expect(typed.deletion.draft.sourceSnapshot.categoryId).toBe('');
  expect(typed.deletion.draft.data.pendingIngredients[0].categoryId).toBe('');
  expect(typed.deletion.draft.quickIngredient.categoryId).toBe('');
  expect(typed.eventTrace).toEqual(['event-consume:false', 'event-delete:main']);
  await classicPage.close();
});

async function collectMixtureSession(page: Page) {
  return page.evaluate(() => {
    const app = window as any;
    const h = app.__phase4gModalHarness;
    h.reset();
    app.ingredientUi.category = 'main';
    const fresh = app.newMixtureDraft();
    app.mixtureDraft = {
      id: 'working', kind: 'mixture', name: 'Working', categoryId: 'missing-cat',
      batchYield: 100, unit: 'ml',
      components: [{ ingredientId: 'milk', qty: 50, unit: 'ml' }],
      pendingIngredients: [{ id: 'pending', kind: 'purchased', name: 'Pending', categoryId: 'missing-cat', purchaseQty: 1, amountPerItem: 10, unit: 'ml', price: 5 }],
    };
    app.quickIngredientDraft = { id: 'quick', name: '', categoryId: 'missing-cat', purchaseQty: '', amountPerItem: '', unit: 'g', price: '' };
    app.state.ingredients.push({
      id: 'cycle', kind: 'mixture', name: 'Cycle', categoryId: '',
      batchYield: 1, unit: 'ml',
      components: [{ ingredientId: 'working', qty: 1, unit: 'ml' }],
    });
    const lookups = [
      app.draftIngredientLookup('working')?.id,
      app.draftIngredientLookup('pending')?.id,
      app.draftIngredientLookup('milk')?.id,
      app.draftIngredientLookup('missing'),
    ];
    const candidates = app.mixtureCandidates().map((item: any) => item.id);
    const info = app.draftMixtureInfo();
    const beforeSanitize = app.captureMixtureSession();
    app.sanitizeMixtureSessionCategories();
    const sanitized = {
      draft: app.mixtureDraft.categoryId,
      pending: app.mixtureDraft.pendingIngredients[0].categoryId,
      quick: app.quickIngredientDraft.categoryId,
    };
    app.mixtureInitialSnapshot = app.captureMixtureSession();
    const unchanged = app.mixtureSessionChanged();
    app.mixtureDraft.name = 'Changed';
    const changed = app.mixtureSessionChanged();
    const values = ['', null, undefined, '  ', 0, '0', false, 'x']
      .map((value) => app.hasDraftValue(value));
    app.mixtureDraft.name = '';
    app.mixtureDraft.batchYield = '';
    app.mixtureDraft.components = [];
    app.mixtureDraft.pendingIngredients = [];
    app.quickIngredientDraft = null;
    app.mixtureInitialSnapshot = app.captureMixtureSession();
    const meaningfulEmpty = app.mixtureSessionHasMeaningfulWork();
    app.mixtureDraft.components.push({ ingredientId: '', qty: '0', unit: 'ml' });
    const meaningfulZero = app.mixtureSessionHasMeaningfulWork();

    h.trace = [];
    app.openMixtureModal('missing', false);
    const missingTrace = [...h.trace];
    h.trace = [];
    const trigger = document.getElementById('mixtureDraftButton') as HTMLElement;
    trigger.focus();
    app.openMixtureModal('saved-mix', true);
    h.flush();
    const opened = {
      source: app.mixtureSourceId,
      original: app.mixtureOriginalExisting,
      readOnly: app.mixtureReadOnly,
      open: app.mixtureModalOpen,
      pending: app.mixtureDraft.pendingIngredients,
      title: document.getElementById('mixtureModalTitle')?.textContent,
      focused: (document.activeElement as HTMLElement | null)?.id,
      snapshot: app.mixtureInitialSnapshot,
      hidden: (document.getElementById('mixtureModal') as HTMLElement).hidden,
    };
    app.applyPendingAfterModal = () => h.trace.push('applyPending');
    app.closeMixtureModal(false);
    const closed = {
      open: app.mixtureModalOpen, draft: app.mixtureDraft,
      readOnly: app.mixtureReadOnly, source: app.mixtureSourceId,
      hidden: (document.getElementById('mixtureModal') as HTMLElement).hidden,
      focused: (document.activeElement as HTMLElement | null)?.id,
      trace: [...h.trace],
    };
    return {
      fresh, lookups, candidates, info, beforeSanitize, sanitized,
      unchanged, changed, values, meaningfulEmpty, meaningfulZero,
      missingTrace, opened, closed,
    };
  });
}

test('typed mixture creation, lookup, costing, sanitization, snapshots, and open-close lifecycle match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectMixtureSession(typedPage);
  const classic = await collectMixtureSession(classicPage);
  expect(typed).toEqual(classic);
  expect(typed.fresh).toEqual({
    id: 'uid-1', kind: 'mixture', name: '', categoryId: 'main',
    batchYield: '', unit: 'ml', components: [], pendingIngredients: [],
  });
  expect(typed.lookups).toEqual(['working', 'pending', 'milk', null]);
  expect(typed.candidates).not.toContain('working');
  expect(typed.candidates).not.toContain('cycle');
  expect(typed.info.valid).toBe(true);
  expect(typed.sanitized).toEqual({ draft: '', pending: '', quick: '' });
  expect(typed.unchanged).toBe(false);
  expect(typed.changed).toBe(true);
  expect(typed.values).toEqual([false, false, false, false, true, true, true, true]);
  expect(typed.meaningfulEmpty).toBe(false);
  expect(typed.meaningfulZero).toBe(true);
  expect(typed.missingTrace).toEqual(['alert:That mixture is no longer available.']);
  expect(typed.opened).toMatchObject({
    source: 'saved-mix', original: true, readOnly: true, open: true,
    pending: [], title: 'Mixture details', focused: 'closeMixtureButton', hidden: false,
  });
  expect(typed.closed).toMatchObject({
    open: false, draft: null, readOnly: false, source: '', hidden: true,
    focused: 'closeMixtureButton',
  });
  expect(typed.closed.trace).toContain('applyPending');
  await classicPage.close();
});

async function collectDrafts(page: Page) {
  return page.evaluate(() => {
    const app = window as any;
    const h = app.__phase4gModalHarness;
    h.reset();
    app.activeMixtureDraftId = 'gone';
    app.openedMixtureDraftUpdatedAt = 'old';
    const deletedConflict = app.currentMixtureDraftConflict();
    const conflictRecord = {
      id: 'draft-x', createdAt: 'old', updatedAt: 'new', sourceMixtureId: '',
      sourceSnapshot: null, conflictCopy: false,
      data: { id: 'mix-x', kind: 'mixture', name: 'X', categoryId: '', batchYield: '', unit: 'ml', components: [], pendingIngredients: [] },
      quickIngredient: null,
    };
    app.state.mixtureDrafts = [conflictRecord];
    app.activeMixtureDraftId = 'draft-x';
    app.openedMixtureDraftUpdatedAt = 'new';
    app.openedMixtureDraftFingerprint = 'different';
    const changedConflict = app.currentMixtureDraftConflict();

    h.reset();
    app.mixtureDraft = {
      id: 'new-mix', kind: 'mixture', name: '  Sea Salt Cloud  ', categoryId: 'main',
      batchYield: '', unit: 'ml', components: [], pendingIngredients: [],
    };
    app.mixtureInitialSnapshot = { data: null, quickIngredient: null, sourceMixtureId: '' };
    app.mixtureModalOpen = true;
    (document.getElementById('mixtureModal') as HTMLElement).hidden = false;
    app.renderMixtureModal();
    h.trace = [];
    const saved = app.saveCurrentMixtureDraft(false, false);
    const firstSave = {
      saved, record: app.snapshot(app.state.mixtureDrafts[0]),
      active: app.activeMixtureDraftId,
      notice: app.mixtureDraftNotice,
      trace: [...h.trace],
    };
    app.mixtureDraft.name = 'Changed after save';
    h.trace = [];
    app.requestCloseMixtureModal();
    const automaticClose = {
      open: app.mixtureModalOpen, draft: app.mixtureDraft,
      records: app.snapshot(app.state.mixtureDrafts), trace: [...h.trace],
    };

    h.reset();
    const record = {
      id: 'draft-1', createdAt: '2026-10-01T01:00:00.000Z',
      updatedAt: '2026-10-02T02:00:00.000Z', sourceMixtureId: 'gone-source',
      sourceSnapshot: { id: 'gone-source', categoryId: 'main' }, conflictCopy: false,
      data: {
        id: 'draft-mixture', kind: 'mixture', name: 'Cloud & Cream', categoryId: 'main',
        batchYield: 250, unit: 'ml',
        components: [{ ingredientId: 'milk', qty: 100, unit: 'ml' }],
        pendingIngredients: [],
      },
      quickIngredient: { id: 'quick', kind: 'purchased', name: 'Vanilla', categoryId: 'main', purchaseQty: '', amountPerItem: '', unit: 'g', price: '' },
    };
    app.state.mixtureDrafts = [record];
    app.renderDraftButton();
    app.renderDraftsModal();
    const rendered = {
      button: document.getElementById('mixtureDraftButton')?.textContent,
      aria: document.getElementById('mixtureDraftButton')?.getAttribute('aria-label'),
      html: document.getElementById('draftsList')?.innerHTML,
      invalidTime: app.formatDraftTime('not-a-date'),
      validTime: app.formatDraftTime(record.updatedAt),
    };
    app.openDraftsModal();
    h.flush();
    const draftsOpen = {
      open: app.draftsModalOpen,
      hidden: (document.getElementById('draftsModal') as HTMLElement).hidden,
      focusedAct: (document.activeElement as HTMLElement | null)?.dataset.act,
    };
    h.trace = [];
    app.resumeMixtureDraft('missing');
    const missingResume = [...h.trace];
    h.trace = [];
    app.resumeMixtureDraft('draft-1');
    const resumed = {
      modalOpen: app.mixtureModalOpen, draftsOpen: app.draftsModalOpen,
      active: app.activeMixtureDraftId, source: app.mixtureSourceId,
      notice: app.mixtureDraftNotice, name: app.mixtureDraft.name,
      quick: app.quickIngredientDraft?.name,
    };
    app.closeMixtureModal(true);
    app.state.mixtureDrafts = [record];
    h.confirmResult = false;
    app.deleteMixtureDraft('draft-1');
    const afterCancel = app.state.mixtureDrafts.length;
    h.confirmResult = true;
    h.trace = [];
    app.deleteMixtureDraft('draft-1');
    h.flush();
    const deletion = { afterCancel, remaining: app.state.mixtureDrafts.length, trace: [...h.trace] };

    h.reset();
    app.mixtureDraft = {
      id: 'empty', kind: 'mixture', name: '', categoryId: '',
      batchYield: '', unit: 'ml', components: [], pendingIngredients: [],
    };
    app.mixtureInitialSnapshot = app.captureMixtureSession();
    app.mixtureModalOpen = true;
    app.renderMixtureModal();
    app.mixtureDraft.name = 'Unsaved';
    h.confirmResult = false;
    app.discardMixtureChanges();
    const discardCancelled = app.mixtureModalOpen;
    h.confirmResult = true;
    app.discardMixtureChanges();
    const discardConfirmed = app.mixtureModalOpen;
    return {
      deletedConflict, changedConflict, firstSave, automaticClose,
      rendered, draftsOpen, missingResume, resumed, deletion,
      discardCancelled, discardConfirmed,
    };
  });
}

test('typed draft conflict, persistence, automatic close, rendering, resume, discard, and deletion match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectDrafts(typedPage);
  const classic = await collectDrafts(classicPage);
  expect(typed).toEqual(classic);
  expect(typed.deletedConflict).toBe('This draft was deleted on another device.');
  expect(typed.changedConflict).toBe('This draft changed on another device.');
  expect(typed.firstSave).toMatchObject({
    saved: true, active: 'uid-1',
    notice: 'Draft saved. It will not affect costing until you finish it.',
  });
  expect(typed.firstSave.trace).toEqual([
    'save', 'status:Draft saved on device:good', 'renderAll',
  ]);
  expect(typed.automaticClose.open).toBe(false);
  expect(typed.automaticClose.draft).toBeNull();
  expect(typed.rendered.button).toBe('Drafts (1)');
  expect(typed.rendered.aria).toBe('View 1 combined-cost draft');
  expect(typed.rendered.html).toContain('Cloud &amp; Cream');
  expect(typed.rendered.invalidTime).toBe('Saved draft');
  expect(typed.draftsOpen).toEqual({ open: true, hidden: false, focusedAct: 'closeDraftsModal' });
  expect(typed.missingResume).toContain('alert:That draft is no longer available.');
  expect(typed.resumed).toMatchObject({
    modalOpen: true, draftsOpen: false, active: 'draft-1',
    source: 'gone-source', name: 'Cloud & Cream', quick: 'Vanilla',
  });
  expect(typed.resumed.notice).toContain('original mixture was deleted');
  expect(typed.deletion).toMatchObject({ afterCancel: 1, remaining: 0 });
  expect(typed.discardCancelled).toBe(true);
  expect(typed.discardConfirmed).toBe(false);
  await classicPage.close();
});

async function collectEditor(page: Page) {
  return page.evaluate(() => {
    const app = window as any;
    const h = app.__phase4gModalHarness;
    h.reset();
    app.mixtureDraft = {
      id: 'working', kind: 'mixture', name: 'Cloud', categoryId: 'main',
      batchYield: 100, unit: 'ml',
      components: [{ ingredientId: 'milk', qty: 50, unit: 'ml' }],
      pendingIngredients: [],
    };
    app.mixtureReadOnly = false;
    app.mixtureDraftNotice = 'Draft note';
    app.mixtureModalOpen = true;
    (document.getElementById('mixtureModal') as HTMLElement).hidden = false;
    const validCost = app.mixtureComponentCost(app.mixtureDraft.components[0]);
    const invalidCost = app.mixtureComponentCost({ ingredientId: 'milk', qty: 2, unit: 'g' });
    app.renderMixtureModal();
    const initialHtml = document.getElementById('mixtureModalContent')?.innerHTML;
    const controls = Array.from(document.querySelectorAll<HTMLElement>('#mixtureModal input,#mixtureModal select,#mixtureModal button'));
    const preDisabled = controls[0] as HTMLInputElement;
    preDisabled.disabled = true;
    app.setMixtureSaving(true);
    const saving = {
      busy: document.getElementById('mixtureModalContent')?.getAttribute('aria-busy'),
      disabled: controls.every((control: any) => control.disabled),
      markers: controls.map((control) => control.dataset.mixtureWasDisabled),
    };
    app.setMixtureSaving(false);
    const restored = {
      busy: document.getElementById('mixtureModalContent')?.getAttribute('aria-busy'),
      firstDisabled: preDisabled.disabled,
      markerCount: controls.filter((control) => 'mixtureWasDisabled' in control.dataset).length,
    };

    h.trace = [];
    app.beginQuickIngredient();
    h.flush();
    const begun = {
      draft: app.snapshot(app.quickIngredientDraft),
      focused: (document.activeElement as HTMLElement | null)?.id,
      hasPanel: Boolean(document.querySelector('.quick-panel')),
    };
    const quickErrors: string[] = [];
    quickErrors.push(app.quickIngredientError());
    app.quickIngredientDraft.name = ' Milk ';
    quickErrors.push(app.quickIngredientError());
    app.quickIngredientDraft.name = 'Vanilla';
    quickErrors.push(app.quickIngredientError());
    app.quickIngredientDraft.purchaseQty = 1;
    app.quickIngredientDraft.amountPerItem = 100;
    app.quickIngredientDraft.price = '';
    quickErrors.push(app.quickIngredientError());
    app.quickIngredientDraft.price = 0;
    quickErrors.push(app.quickIngredientError());
    const added = app.addQuickIngredient();
    h.flush();
    const quickAdded = {
      added, quick: app.quickIngredientDraft,
      pending: app.mixtureDraft.pendingIngredients,
      component: app.mixtureDraft.components.at(-1),
      focusedField: (document.activeElement as HTMLElement | null)?.dataset.mixField,
    };
    app.refreshMixtureTotals();
    const totals = {
      batch: document.getElementById('mixtureBatchCost')?.textContent,
      unit: document.getElementById('mixtureUnitCost')?.textContent,
      error: document.getElementById('mixtureError')?.textContent,
    };

    const base = () => ({
      id: 'validate', kind: 'mixture', name: 'Valid Cloud', categoryId: '',
      batchYield: 100, unit: 'ml',
      components: [{ ingredientId: 'milk', qty: 50, unit: 'ml' }],
      pendingIngredients: [],
    });
    const validation: string[] = [];
    app.mixtureDraft = base(); app.mixtureDraft.name = ''; validation.push(app.mixtureValidationError());
    app.mixtureDraft = base(); app.mixtureDraft.name = 'Milk'; validation.push(app.mixtureValidationError());
    app.mixtureDraft = base(); app.mixtureDraft.batchYield = ''; validation.push(app.mixtureValidationError());
    app.mixtureDraft = base(); app.mixtureDraft.components = []; validation.push(app.mixtureValidationError());
    app.mixtureDraft = base(); app.mixtureDraft.components[0].ingredientId = 'missing'; validation.push(app.mixtureValidationError());
    app.mixtureDraft = base(); app.mixtureDraft.components.push({ ingredientId: 'milk', qty: 1, unit: 'ml' }); validation.push(app.mixtureValidationError());
    app.mixtureDraft = base(); app.mixtureDraft.components[0].unit = 'g'; validation.push(app.mixtureValidationError());
    app.mixtureDraft = base(); app.mixtureDraft.components[0].qty = 0; validation.push(app.mixtureValidationError());
    app.mixtureDraft = base(); validation.push(app.mixtureValidationError());

    app.mixtureDraft = base();
    app.mixtureDraft.components = [{ ingredientId: 'missing-render', qty: 1, unit: 'ml' }];
    app.renderMixtureModal();
    const missingHtml = document.getElementById('mixtureModalContent')?.innerHTML;
    return {
      validCost, invalidCost: Number.isNaN(invalidCost) ? 'NaN' : invalidCost,
      initialHtml, saving, restored, begun, quickErrors, quickAdded,
      totals, validation, missingHtml,
    };
  });
}

test('typed mixture editor cost, quick input, saving state, rendering, totals, and validation match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectEditor(typedPage);
  const classic = await collectEditor(classicPage);
  expect(typed).toEqual(classic);
  expect(typed.validCost).toBe(6);
  expect(typed.invalidCost).toBe('NaN');
  expect(typed.initialHtml).toContain('Add combined cost');
  expect(typed.initialHtml).toContain('Draft note');
  expect(typed.saving.busy).toBe('true');
  expect(typed.saving.disabled).toBe(true);
  expect(typed.restored).toEqual({ busy: 'false', firstDisabled: true, markerCount: 0 });
  expect(typed.begun).toMatchObject({ focused: 'quickIngredientName', hasPanel: true });
  expect(typed.quickErrors).toEqual([
    'Enter the purchased ingredient name.',
    'An ingredient with that name already exists.',
    'Enter a quantity bought and the amount in each.',
    'Enter the total purchase price. Use 0 only when it is genuinely free.',
    '',
  ]);
  expect(typed.quickAdded).toMatchObject({
    added: true, quick: null,
    component: { ingredientId: 'uid-1', qty: '', unit: 'g' },
    focusedField: 'qty',
  });
  expect(typed.validation).toEqual([
    'Enter a mixture name.',
    'An ingredient or mixture with that name already exists.',
    'Enter the actual finished batch yield.',
    'Add at least one item to the mixture.',
    'Choose an ingredient for every item row.',
    'The same item is listed twice. Combine it into one row.',
    'The unit for "Milk" is incompatible.',
    'Enter an amount used for "Milk".',
    '',
  ]);
  expect(typed.missingHtml).toContain('[Missing ingredient - replace this]');
  await classicPage.close();
});

async function collectCommit(page: Page) {
  return page.evaluate(async () => {
    const app = window as any;
    const h = app.__phase4gModalHarness;
    const baseDraft = () => ({
      id: 'commit-mix', kind: 'mixture', name: '  Commit Cloud  ', categoryId: 'main',
      batchYield: 100, unit: 'ml',
      components: [{ ingredientId: 'milk', qty: 50, unit: 'ml' }],
      pendingIngredients: [],
    });
    const prepare = () => {
      h.reset();
      app.mixtureDraft = baseDraft();
      app.mixtureInitialSnapshot = app.captureMixtureSession();
      app.mixtureModalOpen = true;
      (document.getElementById('mixtureModal') as HTMLElement).hidden = false;
      app.renderMixtureModal();
      h.trace = [];
    };

    prepare();
    app.state.mixtureDrafts = [{
      id: 'active', updatedAt: 'new', createdAt: 'old', sourceMixtureId: '',
      sourceSnapshot: null, conflictCopy: false, data: baseDraft(), quickIngredient: null,
    }];
    app.activeMixtureDraftId = 'active';
    app.openedMixtureDraftUpdatedAt = 'old';
    const conflictPromise = app.saveMixture();
    const conflictSync = {
      promise: conflictPromise instanceof Promise,
      error: document.getElementById('mixtureError')?.textContent,
      trace: [...h.trace], ingredients: app.state.ingredients.length,
    };
    const conflictResult = await conflictPromise;

    prepare();
    app.quickIngredientDraft = { id: 'quick', name: 'In progress' };
    app.pendingRemote = app.snapshot(app.state);
    app.syncedState = app.snapshot(app.state);
    const quickPromise = app.saveMixture();
    const quickSync = {
      pending: app.pendingRemote,
      error: document.getElementById('mixtureError')?.textContent,
      trace: [...h.trace],
    };
    const quickResult = await quickPromise;

    prepare();
    app.mixtureSourceId = 'deleted-source';
    app.mixtureSourceSnapshot = { id: 'deleted-source' };
    h.confirmResult = false;
    const missingCancelResult = await app.saveMixture();
    const missingCancel = {
      result: missingCancelResult, id: app.mixtureDraft.id,
      source: app.mixtureSourceId,
      error: document.getElementById('mixtureError')?.textContent,
      confirmations: [...h.confirmations], trace: [...h.trace],
    };

    prepare();
    app.mixtureDraft.name = '';
    app.mixtureSourceId = 'deleted-source';
    app.mixtureSourceSnapshot = { id: 'deleted-source' };
    h.confirmResult = true;
    const missingAcceptResult = await app.saveMixture();
    const missingAccept = {
      result: missingAcceptResult, id: app.mixtureDraft.id,
      source: app.mixtureSourceId, snapshot: app.mixtureSourceSnapshot,
      original: app.mixtureOriginalExisting,
      error: document.getElementById('mixtureError')?.textContent,
    };

    prepare();
    app.mixtureDraft.id = 'milk';
    app.mixtureDraft.name = '';
    const collisionResult = await app.saveMixture();
    const collision = {
      result: collisionResult, id: app.mixtureDraft.id,
      error: document.getElementById('mixtureError')?.textContent,
    };

    prepare();
    const NativeObject = app.Object;
    app.mixtureDraft.pendingIngredients = [
      { id: 'pending-1', kind: 'purchased', categoryId: '', name: 'Pending 1', purchaseQty: 1, amountPerItem: 10, unit: 'ml', price: 10 },
      { id: 'pending-2', kind: 'purchased', categoryId: '', name: 'Pending 2', purchaseQty: 1, amountPerItem: 10, unit: 'ml', price: 10 },
    ];
    app.mixtureDraft.components = [
      { ingredientId: 'pending-1', qty: 1, unit: 'ml' },
      { ingredientId: 'pending-2', qty: 1, unit: 'ml' },
    ];
    let assignCalls = 0;
    app.Object = {
      prototype: NativeObject.prototype,
      assign(...args: any[]) {
        assignCalls += 1;
        if (assignCalls === 2) throw new Error('assign failed');
        return NativeObject.assign(...args);
      },
    };
    const partialPromise = app.saveMixture();
    const partialSync = app.state.ingredients.map((item: any) => item.id);
    let partialError = '';
    try { await partialPromise; } catch (error) { partialError = (error as Error).message; }
    app.Object = NativeObject;
    const partial = {
      promise: partialPromise instanceof Promise,
      syncIds: partialSync,
      error: partialError,
      ids: app.state.ingredients.map((item: any) => item.id),
      trace: [...h.trace], modalOpen: app.mixtureModalOpen,
    };

    prepare();
    app.state.mixtureDrafts = [{
      id: 'active', createdAt: 'old', updatedAt: 'old', sourceMixtureId: '',
      sourceSnapshot: null, conflictCopy: false, data: baseDraft(), quickIngredient: null,
    }];
    app.activeMixtureDraftId = 'active';
    app.openedMixtureDraftUpdatedAt = 'old';
    app.openedMixtureDraftFingerprint = app.stableSerialize(app.state.mixtureDrafts[0]);
    const successPromise = app.saveMixture();
    const successSync = {
      promise: successPromise instanceof Promise,
      saved: app.state.ingredients.find((item: any) => item.id === 'commit-mix'),
      drafts: app.state.mixtureDrafts,
      ui: app.ingredientUi,
      modalOpen: app.mixtureModalOpen,
      draft: app.mixtureDraft,
      trace: [...h.trace],
    };
    const successResult = await successPromise;
    h.flush();
    return {
      conflictSync, conflictResult, quickSync, quickResult,
      missingCancel, missingAccept, collision, partial,
      successSync, successResult, successTraceAfterTimers: [...h.trace],
    };
  });
}

test('typed final mixture commit preserves Promise timing, rejection effects, partial exceptions, and success order', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectCommit(typedPage);
  const classic = await collectCommit(classicPage);
  expect(typed).toEqual(classic);
  expect(typed.conflictSync).toMatchObject({
    promise: true, trace: [], ingredients: 3,
  });
  expect(typed.conflictSync.error).toContain('Nothing was overwritten');
  expect(typed.conflictResult).toBe(false);
  expect(typed.quickSync.pending).toBeNull();
  expect(typed.quickSync.error).toContain('Add or cancel the new purchased ingredient');
  expect(typed.quickResult).toBe(false);
  expect(typed.missingCancel).toMatchObject({
    result: false, id: 'commit-mix', source: 'deleted-source',
    error: 'The original mixture is gone. Your draft is still safe.',
  });
  expect(typed.missingAccept).toMatchObject({
    result: false, id: 'uid-1', source: '', snapshot: null,
    original: false, error: 'Enter a mixture name.',
  });
  expect(typed.collision).toMatchObject({
    result: false, id: 'uid-1', error: 'Enter a mixture name.',
  });
  expect(typed.partial).toMatchObject({
    promise: true, error: 'assign failed', modalOpen: true, trace: [],
  });
  expect(typed.partial.ids).toContain('pending-1');
  expect(typed.partial.ids).not.toContain('pending-2');
  expect(typed.successSync).toMatchObject({
    promise: true, drafts: [],
    ui: { category: 'main', search: '' },
    modalOpen: false, draft: null,
    trace: ['logChanges', 'save', 'timer:0', 'renderAll', 'timer:0'],
  });
  expect(typed.successSync.saved).toEqual({
    id: 'commit-mix', kind: 'mixture', name: 'Commit Cloud', categoryId: 'main',
    batchYield: 100, unit: 'ml',
    components: [{ ingredientId: 'milk', qty: 50, unit: 'ml' }],
  });
  expect(typed.successResult).toBe(true);
  expect(typed.successTraceAfterTimers).toEqual([
    'logChanges', 'save', 'timer:0', 'renderAll', 'timer:0',
  ]);
  await classicPage.close();
});
