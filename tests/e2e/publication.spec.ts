import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const publicationNames = [
  'publicationStatusFor',
  'posPublicationHtml',
  'openPublishProductModal',
  'closePublishProductModal',
  'renderPublishProductModal',
  'waitForCostingSync',
  'publishProductToPos',
  'explainPublishedProductDelete',
  'deleteCostingProduct',
  'ingredientDependsOn',
] as const;

const protectedPublicationNames = [
  'openPublishProductModal',
  'closePublishProductModal',
  'publishProductToPos',
  'deleteCostingProduct',
] as const;

const activeRuntimeFiles = [
  'state.js',
  'pos-catalog.js',
  'workspace-sync.js',
  'pos-operations.js',
  'boot.js',
  'start.js',
] as const;

const transitionRuntimeFiles = [
  'core.js',
  'runtime-factories.js',
  'state.js',
  'costing.js',
  'pos-catalog.js',
  'stocks.js',
  'workspace-sync.js',
  'pos-operations.js',
  'publication.js',
  'render-costing.js',
  'render-modals.js',
  'render-pos.js',
  'render-stocks.js',
  'support.js',
  'events.js',
  'boot.js',
  'compatibility.js',
  'start.js',
] as const;

async function stubSupabase(page: Page): Promise<void> {
  await page.route(
    /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/,
    async (route) => {
      await route.fulfill({
        contentType: 'application/javascript',
        body: 'window.supabase={createClient:function(){throw new Error("Supabase is disabled in browser tests");}};',
      });
    },
  );
}

async function installPublicationHarness(page: Page): Promise<void> {
  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const snapshotStorage = (storage: Storage) =>
      Array.from({ length: storage.length }, (_, index) => {
        const key = storage.key(index) || '';
        return [key, storage.getItem(key)] as const;
      }).sort((left, right) => left[0].localeCompare(right[0]));

    const reset = () => {
      const next = app.blank();
      next.ingredients = [
        {
          id: 'matcha', name: 'Matcha', kind: 'purchased',
          purchaseQty: 1, amountPerItem: 1, unit: 'piece', price: 62.425,
        },
        {
          id: 'unused-ingredient', name: 'Unused ingredient', kind: 'purchased',
          purchaseQty: 1, amountPerItem: 1, unit: 'piece', price: 999,
        },
      ];
      next.packaging = [
        { id: 'cup', name: '12oz cup set', qty: 1, price: 15.545 },
        { id: 'unused-packaging', name: 'Unused packaging', qty: 1, price: 999 },
      ];
      next.recipes = [{
        id: 'matcha-recipe', name: 'Matcha Latte', yield: 1,
        lines: [{ id: 'matcha-line', ingredientId: 'matcha', qty: 1, unit: 'piece' }],
      }];
      next.products = [{
        id: 'matcha-product', name: 'Matcha Latte 12oz', recipeId: 'matcha-recipe',
        packLines: [{ id: 'cup-line', packagingId: 'cup', qty: 1 }],
        targetMargin: 53, price: '170.005',
      }];
      app.state = app.normalizeState(next);
      app.session = { user: { id: 'phase4f-user', email: 'owner@example.test' } };
      app.currentUserId = 'phase4f-user';
      app.cloud.connected = true;
      app.cloud.client = null;
      app.costingCloudReady = true;
      app.costingLoadGeneration = 11;
      app.posLoadGeneration = 17;
      app.posContext = {
        loaded: true, loading: false,
        businessId: '11111111-1111-4111-8111-111111111111',
        businessName: 'Matcha Luna', role: 'owner', categories: [],
        publications: {}, error: '',
      };
      if (typeof app.freshPosCheckout === 'function') {
        app.posCheckout = app.freshPosCheckout();
      }
      app.posCheckout.catalog = [];
      app.posCheckout.notice = '';
      app.publishModalOpen = false;
      app.publishProductId = '';
      app.publishSnapshot = null;
      app.publishSubmitting = false;
      app.publishError = '';
      app.publishNotice = '';
      app.pendingRemote = null;
      app.pendingSave = false;
      app.saveTimer = null;
      app.localDirty = false;
      app.modalReturnFocus = null;
      const modal = document.getElementById('publishModal');
      if (modal) modal.hidden = true;
      const content = document.getElementById('publishModalContent');
      if (content) content.innerHTML = '';
      if (typeof app.refreshModalBodyClass === 'function') app.refreshModalBodyClass();
      return app.state.products[0];
    };

    const record = (overrides: Record<string, unknown> = {}) => {
      const product = app.state.products[0];
      const built = app.buildProductCostingSnapshot(product, '');
      return Object.assign({
        source_costing_product_id: product.id,
        product_id: '22222222-2222-4222-8222-222222222222',
        active_version_id: '33333333-3333-4333-8333-333333333333',
        version_id: '33333333-3333-4333-8333-333333333333',
        version_number: 1,
        category_id: '44444444-4444-4444-8444-444444444444',
        category_name: 'Matcha',
        product_name: product.name,
        catalog_name: product.name,
        name_snapshot: product.name,
        size_snapshot: null,
        source_costing_recipe_id: product.recipeId,
        source_costing_hash: 'phase4f-fixture-hash',
        selling_price_centavos: built.sellingPriceCentavos,
        ingredient_cost_centavos: built.ingredientCostCentavos,
        packaging_cost_centavos: built.packagingCostCentavos,
        estimated_unit_cost_centavos:
          built.ingredientCostCentavos + built.packagingCostCentavos,
        costing_snapshot: built.snapshot,
        active_costing_snapshot: built.snapshot,
        available: true,
        published_at: '2026-09-27T10:00:00.000Z',
        archived_at: null,
        publish_result: 'created',
      }, overrides);
    };

    app.__phase4fPublicationHarness = {
      reset,
      record,
      storage: () => ({
        local: snapshotStorage(localStorage),
        session: snapshotStorage(sessionStorage),
      }),
    };
  });
}

async function openPrimary(page: Page): Promise<void> {
  await stubSupabase(page);
  await page.goto('index.html?test=1', { waitUntil: 'load' });
  await page.evaluate(() =>
    (window as typeof window & { MatchaLunaApp: { ready: Promise<void> } })
      .MatchaLunaApp.ready,
  );
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
  await installPublicationHarness(page);
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
  await page.route('**/index.html?test=1&publication-transition=1', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.goto('index.html?test=1&publication-transition=1', {
    waitUntil: 'load',
  });
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
  await installPublicationHarness(page);
  return page;
}

async function collectPureFingerprint(page: Page): Promise<Record<string, any>> {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const api = (app.MatchaLunaApp?.domains?.publication || app) as Record<string, any>;
    const harness = app.__phase4fPublicationHarness;
    const originals = Object.fromEntries([
      'publicationStatusFor', 'escapeHtml', 'setTimeout', 'alert',
      'posCanPublish', 'consumePendingRemoteForCommit',
      'validateProductForPublish', 'renderProducts', 'getById',
      'focusSoon', 'String', 'Number', 'Date', 'Promise',
    ].map((name) => [name, app[name]]));
    const apiOriginals = Object.fromEntries([
      'publicationStatusFor', 'ingredientDependsOn',
    ].map((name) => [name, api[name]]));
    const summarize = (value: any) => ({
      key: value.key,
      label: value.label,
      detail: value.detail,
      hasRecord: Boolean(value.record),
      valid: value.validation?.valid,
    });
    const rejection = async (promise: Promise<unknown>) => {
      try {
        await promise;
        return null;
      } catch (error) {
        return error;
      }
    };
    try {
      const product = harness.reset();
      const builtRecord = harness.record();
      const statuses: Record<string, unknown> = {};
      statuses.unpublished = summarize(api.publicationStatusFor(product));
      app.posContext.publications[product.id] = builtRecord;
      statuses.published = summarize(api.publicationStatusFor(product));
      app.posContext.publications[product.id] = Object.assign({}, builtRecord, {
        available: false,
      });
      statuses.unavailable = summarize(api.publicationStatusFor(product));
      app.posContext.publications[product.id] = Object.assign({}, builtRecord, {
        archived_at: '2026-09-28T00:00:00.000Z',
      });
      product.price = '';
      statuses.archivedInvalid = summarize(api.publicationStatusFor(product));
      app.posContext.publications[product.id] = builtRecord;
      statuses.invalid = summarize(api.publicationStatusFor(product));
      product.price = '175';
      statuses.changed = summarize(api.publicationStatusFor(product));

      harness.reset();
      const html: Record<string, string> = {};
      html.unpublished = api.posPublicationHtml(app.state.products[0]);
      app.posContext.businessId = '';
      app.session = null;
      html.signedOut = api.posPublicationHtml(app.state.products[0]);
      app.session = { user: { id: 'user-1' } };
      html.missingBusiness = api.posPublicationHtml(app.state.products[0]);
      app.posContext.businessId = '11111111-1111-4111-8111-111111111111';
      app.posContext.loading = true;
      html.loading = api.posPublicationHtml(app.state.products[0]);
      app.posContext.loading = false;
      app.posContext.error = 'POS offline <retry>';
      html.error = api.posPublicationHtml(app.state.products[0]);
      app.posContext.error = '';
      app.costingCloudReady = false;
      html.costingUnavailable = api.posPublicationHtml(app.state.products[0]);
      app.costingCloudReady = true;
      app.posContext.role = 'cashier';
      html.readOnly = api.posPublicationHtml(app.state.products[0]);
      app.posContext.role = 'owner';
      app.posContext.publications[app.state.products[0].id] = harness.record({
        archived_at: '2026-09-28T00:00:00.000Z',
      });
      html.archived = api.posPublicationHtml(app.state.products[0]);

      const liveTrace: string[] = [];
      const statusReplacement = () => {
        liveTrace.push('publicationStatusFor');
        return {
          key: 'unpublished', label: 'Replacement <status>', detail: 'Live detail',
          record: null, validation: { valid: true, error: '' },
        };
      };
      api.publicationStatusFor = statusReplacement;
      app.escapeHtml = (value: unknown) => {
        liveTrace.push(`escape:${String(value)}`);
        return `ESC(${String(value)})`;
      };
      const liveHtml = api.posPublicationHtml(app.state.products[0]);
      api.publicationStatusFor = apiOriginals.publicationStatusFor;
      app.escapeHtml = originals.escapeHtml;

      const modalOrdering: Record<string, unknown> = {};
      harness.reset();
      app.pendingRemote = { marker: 'denied' };
      const deniedTrace: string[] = [];
      app.posCanPublish = () => { deniedTrace.push('canPublish'); return false; };
      app.consumePendingRemoteForCommit = () => {
        deniedTrace.push('consume');
        app.pendingRemote = null;
      };
      app.alert = () => { deniedTrace.push('alert'); };
      modalOrdering.denied = {
        result: api.openPublishProductModal('matcha-product'),
        trace: deniedTrace,
        pendingRemote: app.pendingRemote?.marker,
      };

      harness.reset();
      app.pendingRemote = { marker: 'invalid' };
      const invalidTrace: string[] = [];
      app.posCanPublish = () => { invalidTrace.push('canPublish'); return true; };
      app.consumePendingRemoteForCommit = () => {
        invalidTrace.push('consume');
        app.pendingRemote = null;
      };
      app.getById = (...args: unknown[]) => {
        invalidTrace.push('getById');
        return originals.getById(...args);
      };
      app.validateProductForPublish = () => {
        invalidTrace.push('validate');
        return { valid: false, error: 'invalid fixture' };
      };
      app.alert = (message: unknown) => { invalidTrace.push(`alert:${String(message)}`); };
      app.renderProducts = () => { invalidTrace.push('renderProducts'); };
      modalOrdering.invalid = {
        result: api.openPublishProductModal('matcha-product'),
        trace: invalidTrace,
        pendingRemote: app.pendingRemote,
      };
      for (const name of [
        'posCanPublish', 'consumePendingRemoteForCommit',
        'validateProductForPublish', 'renderProducts', 'getById', 'alert',
      ]) Reflect.set(app, name, originals[name]);

      const focusButton = document.createElement('button');
      focusButton.id = 'phase4f-focus-origin';
      document.body.appendChild(focusButton);
      focusButton.focus();
      harness.reset();
      focusButton.focus();
      const stateBeforeModal = app.stableSerialize(app.state);
      const storageBeforeModal = harness.storage();
      const opened = api.openPublishProductModal('matcha-product');
      const openState = {
        opened,
        visible: !document.getElementById('publishModal')!.hidden,
        productId: app.publishProductId,
        snapshot: JSON.parse(JSON.stringify(app.publishSnapshot)),
        html: document.getElementById('publishModalContent')!.innerHTML,
        stateUnchanged: stateBeforeModal === app.stableSerialize(app.state),
        storageUnchanged:
          JSON.stringify(storageBeforeModal) === JSON.stringify(harness.storage()),
      };
      const progressTrace: string[] = [];
      app.publishSubmitting = true;
      app.publishError = 'publish <error>';
      app.publishNotice = 'publish <notice>';
      app.focusSoon = (selector: string) => { progressTrace.push(selector); };
      api.renderPublishProductModal();
      const content = document.getElementById('publishModalContent')!;
      const progressState = {
        ariaBusy: content.getAttribute('aria-busy'),
        progressText: content.querySelector('#publishProgress')?.textContent,
        disabledCount: content.querySelectorAll('button:disabled,input:disabled').length,
        html: content.innerHTML,
        focusTrace: progressTrace,
      };
      app.focusSoon = originals.focusSoon;
      app.publishSubmitting = true;
      const blockedClose = api.closePublishProductModal();
      app.publishSubmitting = false;
      const scheduled: Array<() => void> = [];
      Reflect.set(app, 'setTimeout', (callback: () => void) => {
        scheduled.push(callback);
        return scheduled.length;
      });
      const closeResult = api.closePublishProductModal();
      const callbacksAfterClose = scheduled.length;
      scheduled.shift()?.();
      const callbacksAfterFocus = scheduled.length;
      scheduled.shift()?.();
      const closeState = {
        blockedClose,
        closeResult,
        callbacksAfterClose,
        callbacksAfterFocus,
        hidden: document.getElementById('publishModal')!.hidden,
        focusRestored: document.activeElement === focusButton,
        modalOpen: app.publishModalOpen,
      };
      Reflect.set(app, 'setTimeout', originals.setTimeout);
      focusButton.remove();

      harness.reset();
      api.openPublishProductModal('matcha-product');
      const modalContent = document.getElementById('publishModalContent')!;
      const modalParent = modalContent.parentNode!;
      const modalNext = modalContent.nextSibling;
      const missingContentTrace: string[] = [];
      app.getById = (...args: unknown[]) => {
        missingContentTrace.push('getById');
        return originals.getById(...args);
      };
      modalContent.remove();
      const missingContentResult = api.renderPublishProductModal();
      modalParent.insertBefore(modalContent, modalNext);
      app.publishProductId = 'missing-product';
      const htmlBeforeMissingProduct = modalContent.innerHTML;
      const missingProductResult = api.renderPublishProductModal();
      const missingLookup = {
        missingContentResultType: typeof missingContentResult,
        missingProductResultType: typeof missingProductResult,
        trace: [...missingContentTrace],
        htmlUnchanged: htmlBeforeMissingProduct === modalContent.innerHTML,
      };
      app.publishProductId = 'matcha-product';
      modalContent.remove();
      app.getById = () => { throw new Error('lookup exploded'); };
      let missingContentError = '';
      try {
        api.renderPublishProductModal();
      } catch (error) {
        missingContentError = String((error as Error).message || error);
      }
      modalParent.insertBefore(modalContent, modalNext);
      app.getById = originals.getById;

      harness.reset();
      const nativeTrace: string[] = [];
      const originalGetElementById = document.getElementById;
      app.String = new Proxy(originals.String, {
        apply(target, thisArg, args) {
          nativeTrace.push('String');
          return Reflect.apply(target, thisArg, args);
        },
      });
      app.Number = new Proxy(originals.Number, {
        apply(target, thisArg, args) {
          nativeTrace.push('Number');
          return Reflect.apply(target, thisArg, args);
        },
      });
      app.Date = new Proxy(originals.Date, {
        construct(target, args, newTarget) {
          nativeTrace.push('Date:construct');
          return Reflect.construct(target, args, newTarget);
        },
        get(target, property, receiver) {
          if (property === 'now') nativeTrace.push('Date:now');
          return Reflect.get(target, property, receiver);
        },
      });
      app.Promise = new Proxy(originals.Promise, {
        construct(target, args, newTarget) {
          nativeTrace.push('Promise:construct');
          return Reflect.construct(target, args, newTarget);
        },
      });
      (document as any).getElementById = new Proxy(originalGetElementById, {
        apply(target, thisArg, args) {
          nativeTrace.push(`document:${String(args[0])}`);
          return Reflect.apply(target, thisArg, args);
        },
      });
      app.posContext.publications['matcha-product'] = harness.record();
      api.publicationStatusFor(app.state.products[0]);
      await api.waitForCostingSync(25);
      api.openPublishProductModal('matcha-product');
      (document as any).getElementById = originalGetElementById;
      for (const name of ['String', 'Number', 'Date', 'Promise']) {
        Reflect.set(app, name, originals[name]);
      }

      harness.reset();
      const sync: Record<string, unknown> = {};
      sync.clean = await api.waitForCostingSync(25).then(
        (value: unknown) => ({ type: typeof value }),
      );
      app.pendingRemote = { marker: true };
      sync.partner = await rejection(api.waitForCostingSync(25));
      app.pendingRemote = null;
      app.localDirty = true;
      sync.dirty = await rejection(api.waitForCostingSync(25));
      app.localDirty = false;

      const originalDate = app.Date;
      const timerQueue: Array<() => void> = [];
      let clock = 0;
      Reflect.set(app, 'Date', { now: () => clock });
      Reflect.set(app, 'setTimeout', (callback: () => void, delay: number) => {
        liveTrace.push(`timer:${delay}`);
        timerQueue.push(callback);
        return timerQueue.length;
      });
      app.pendingSave = true;
      const pendingResolution = api.waitForCostingSync(50);
      app.pendingSave = false;
      timerQueue.shift()?.();
      sync.pendingThenClean = await pendingResolution.then(
        (value: unknown) => ({ type: typeof value }),
      );
      app.pendingSave = true;
      const timeoutPromise = rejection(api.waitForCostingSync(50));
      clock = 51;
      timerQueue.shift()?.();
      sync.timeout = await timeoutPromise;
      app.pendingSave = false;
      const runDefaultTimeout = async (timeout: number) => {
        clock = 0;
        timerQueue.length = 0;
        app.pendingSave = true;
        let settled = false;
        const pending = rejection(api.waitForCostingSync(timeout)).then((error) => {
          settled = true;
          return error;
        });
        const initiallyScheduled = timerQueue.length;
        clock = 7999;
        timerQueue.shift()?.();
        const beforeLimit = {
          settled,
          queued: timerQueue.length,
        };
        clock = 8000;
        timerQueue.shift()?.();
        const error = await pending;
        app.pendingSave = false;
        return { initiallyScheduled, beforeLimit, error };
      };
      sync.timeoutZero = await runDefaultTimeout(0);
      sync.timeoutNaN = await runDefaultTimeout(Number.NaN);
      Reflect.set(app, 'Date', originalDate);
      Reflect.set(app, 'setTimeout', originals.setTimeout);

      harness.reset();
      app.state.ingredients.push(
        {
          id: 'mix-a', name: 'A', kind: 'mixture', unit: 'ml', batchYield: 1,
          components: [{ ingredientId: 'mix-b', qty: 1, unit: 'ml' }],
        },
        {
          id: 'mix-b', name: 'B', kind: 'mixture', unit: 'ml', batchYield: 1,
          components: [
            { ingredientId: 'mix-a', qty: 1, unit: 'ml' },
            { ingredientId: 'matcha', qty: 1, unit: 'piece' },
          ],
        },
      );
      const seen: Record<string, boolean> = {};
      const dependencies = {
        same: api.ingredientDependsOn('mix-a', 'mix-a'),
        nested: api.ingredientDependsOn('mix-a', 'matcha'),
        missing: api.ingredientDependsOn('mix-a', 'missing', seen),
        seen,
        custom: api.ingredientDependsOn('custom-a', 'custom-target', {}, (id: string) => ({
          id,
          kind: 'mixture',
          components: id === 'custom-a' ? [{ ingredientId: 'custom-target' }] : [],
        })),
      };
      const recursiveTrace: string[] = [];
      const originalDependency = api.ingredientDependsOn;
      api.ingredientDependsOn = (...args: unknown[]) => {
        recursiveTrace.push(String(args[0]));
        return false;
      };
      const recursiveResult = originalDependency(
        'mix-a', 'not-present', {}, app.stateIngredientLookup,
      );
      api.ingredientDependsOn = apiOriginals.ingredientDependsOn;

      const alerts: string[] = [];
      app.alert = (message: unknown) => alerts.push(String(message));
      const explainResult = api.explainPublishedProductDelete({ name: 'Tea <A>' });

      return {
        statuses,
        html,
        liveHtml,
        liveTrace,
        modalOrdering,
        openState,
        progressState,
        closeState,
        missingLookup,
        missingContentError,
        nativeTrace,
        sync,
        dependencies,
        recursiveResult,
        recursiveTrace,
        explainResultType: typeof explainResult,
        alerts,
      };
    } finally {
      for (const [name, value] of Object.entries(originals)) {
        Reflect.set(app, name, value);
      }
      Object.assign(api, apiOriginals);
    }
  });
}

async function collectPublishFingerprint(page: Page): Promise<Record<string, any>> {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const api = (app.MatchaLunaApp?.domains?.publication || app) as Record<string, any>;
    const harness = app.__phase4fPublicationHarness;
    const dependencyNames = [
      'waitForCostingSync', 'posCanPublish', 'posRequestIsCurrent',
      'costingRequestIsCurrent', 'loadPosPublicationStatus',
      'refreshPosCatalogOnly', 'renderProducts', 'renderPos',
    ];
    const rootOriginals = Object.fromEntries(
      dependencyNames.map((name) => [name, app[name]]),
    );
    const apiOriginals = { waitForCostingSync: api.waitForCostingSync };
    const restore = () => {
      Object.assign(app, rootOriginals);
      Object.assign(api, apiOriginals);
    };
    const reset = () => {
      restore();
      const product = harness.reset();
      app.cloud.client = null;
      return product;
    };
    const rpcResult = (data: unknown, error: unknown = null) =>
      Promise.resolve({ data, error });
    const stateAndStorage = () => ({
      state: app.stableSerialize(app.state), storage: harness.storage(),
    });
    const sameSafetySnapshot = (before: any) => ({
      state: before.state === app.stableSerialize(app.state),
      storage: JSON.stringify(before.storage) === JSON.stringify(harness.storage()),
    });

    try {
      const successTrace: string[] = [];
      const successProduct = reset();
      const successRow = harness.record({ size_snapshot: '12 oz' });
      app.posContext.publications[successProduct.id] = harness.record({
        active_version_id: 'existing-version-id',
        version_id: 'existing-version-id',
      });
      const successBefore = stateAndStorage();
      api.waitForCostingSync = async () => { successTrace.push('wait'); };
      app.loadPosPublicationStatus = async () => {
        successTrace.push('status'); return true;
      };
      app.refreshPosCatalogOnly = async () => {
        successTrace.push('catalog'); return true;
      };
      app.renderProducts = () => { successTrace.push('renderProducts'); };
      app.renderPos = () => { successTrace.push('renderPos'); };
      let successRpcCalls = 0;
      let successPayload: Record<string, unknown> | null = null;
      app.cloud.client = {
        rpc(name: string, args: Record<string, unknown>) {
          successTrace.push(`rpc:${name}`);
          successRpcCalls += 1;
          successPayload = JSON.parse(JSON.stringify(args));
          return rpcResult([successRow]);
        },
      };
      const successOpened = api.openPublishProductModal(successProduct.id);
      app.publishSnapshot.categoryName = ' Matcha Drinks ';
      app.publishSnapshot.size = '12 oz';
      const successResult = await api.publishProductToPos();
      const success = {
        successOpened, successResult, successRpcCalls, successPayload,
        successTrace, modalOpen: app.publishModalOpen,
        submitting: app.publishSubmitting, notice: app.posCheckout.notice,
        publication: JSON.parse(JSON.stringify(
          app.posContext.publications[successProduct.id],
        )),
        safety: sameSafetySnapshot(successBefore),
      };

      const failureProduct = reset();
      const failureBefore = stateAndStorage();
      let failureRpcCalls = 0;
      api.waitForCostingSync = async () => {};
      app.cloud.client = {
        rpc() {
          failureRpcCalls += 1;
          return rpcResult(null, { message: 'network unavailable' });
        },
      };
      api.openPublishProductModal(failureProduct.id);
      const failureResult = await api.publishProductToPos();
      const failure = {
        failureResult, failureRpcCalls, modalOpen: app.publishModalOpen,
        submitting: app.publishSubmitting, error: app.publishError,
        hasPublication: Boolean(app.posContext.publications[failureProduct.id]),
        safety: sameSafetySnapshot(failureBefore),
      };

      const conflictProduct = reset();
      const conflictTrace: string[] = [];
      let conflictRpcCalls = 0;
      api.waitForCostingSync = async () => {};
      app.loadPosPublicationStatus = async () => {
        conflictTrace.push('status'); return true;
      };
      app.cloud.client = {
        rpc() {
          conflictTrace.push('publish');
          conflictRpcCalls += 1;
          return rpcResult(null, { code: '40001', message: 'serialization' });
        },
      };
      api.openPublishProductModal(conflictProduct.id);
      const conflictResult = await api.publishProductToPos();
      const conflict = {
        conflictResult, conflictRpcCalls, conflictTrace,
        error: app.publishError, modalOpen: app.publishModalOpen,
      };

      const permissionProduct = reset();
      let permissionRpcCalls = 0;
      api.waitForCostingSync = async () => {};
      app.cloud.client = {
        rpc() {
          permissionRpcCalls += 1;
          return rpcResult(null, {
            code: '42501', message: 'new row violates row-level security policy',
          });
        },
      };
      api.openPublishProductModal(permissionProduct.id);
      const permissionResult = await api.publishProductToPos();
      const permissionFailure = {
        permissionResult,
        permissionRpcCalls,
        error: app.publishError,
        modalOpen: app.publishModalOpen,
        submitting: app.publishSubmitting,
      };

      const preflight: Record<string, unknown> = {};
      const runPreflight = async (
        name: string,
        mutate: (product: Record<string, any>) => void,
        waitError?: Record<string, unknown>,
      ) => {
        const product = reset();
        let calls = 0;
        api.waitForCostingSync = waitError
          ? async () => { throw waitError; }
          : async () => {};
        app.cloud.client = {
          rpc() { calls += 1; return rpcResult([]); },
        };
        api.openPublishProductModal(product.id);
        mutate(product);
        const result = await api.publishProductToPos();
        preflight[name] = {
          result, calls, error: app.publishError,
          modalOpen: app.publishModalOpen,
        };
      };
      await runPreflight('blankCategory', () => {
        app.publishSnapshot.categoryName = '   ';
      });
      await runPreflight('longCategory', () => {
        app.publishSnapshot.categoryName = 'x'.repeat(81);
      });
      await runPreflight('longSize', () => {
        app.publishSnapshot.size = 'x'.repeat(41);
      });
      await runPreflight('fingerprint', (product) => { product.price = 180; });
      await runPreflight('partner', () => {}, {
        posMessage: 'A partner update is waiting.',
      });
      await runPreflight('dirty', () => {}, {
        posMessage: 'Your latest costing changes are not saved.',
      });
      await runPreflight('timeout', () => {}, {
        posMessage: 'Costing is still syncing.',
      });
      await runPreflight('permission', () => { app.posCanPublish = () => false; });

      const postWait: Record<string, unknown> = {};
      const runPostWaitMutation = async (
        name: string,
        mutate: (product: Record<string, any>) => void,
      ) => {
        const product = reset();
        let release!: () => void;
        api.waitForCostingSync = () => new Promise<void>((resolve) => {
          release = resolve;
        });
        let calls = 0;
        app.cloud.client = {
          rpc() { calls += 1; return rpcResult([]); },
        };
        api.openPublishProductModal(product.id);
        const pending = api.publishProductToPos();
        mutate(product);
        release();
        const result = await pending;
        postWait[name] = {
          result, calls, error: app.publishError,
          modalOpen: app.publishModalOpen,
          submitting: app.publishSubmitting,
        };
      };
      await runPostWaitMutation('invalid', () => {
        app.state.recipes[0].lines = [];
      });
      await runPostWaitMutation('fingerprint', (product) => {
        product.price = '180';
      });

      const duplicateProduct = reset();
      const duplicateRow = harness.record();
      api.waitForCostingSync = async () => {};
      app.loadPosPublicationStatus = async () => true;
      app.refreshPosCatalogOnly = async () => true;
      let duplicateRpcCalls = 0;
      let resolveDuplicate!: (value: unknown) => void;
      const duplicateRpc = new Promise((resolve) => { resolveDuplicate = resolve; });
      app.cloud.client = {
        rpc() { duplicateRpcCalls += 1; return duplicateRpc; },
      };
      api.openPublishProductModal(duplicateProduct.id);
      const duplicateBefore = stateAndStorage();
      const firstPublish = api.publishProductToPos();
      await Promise.resolve();
      await Promise.resolve();
      const pendingSnapshot = {
        safety: sameSafetySnapshot(duplicateBefore),
        hasPublication: Boolean(app.posContext.publications[duplicateProduct.id]),
        modalOpen: app.publishModalOpen,
        submitting: app.publishSubmitting,
        rpcCalls: duplicateRpcCalls,
      };
      const secondResult = await api.publishProductToPos();
      resolveDuplicate({ data: [duplicateRow], error: null });
      const firstResult = await firstPublish;
      const duplicate = {
        duplicateRpcCalls, firstResult, secondResult, pendingSnapshot,
      };

      const missingProduct = reset();
      api.waitForCostingSync = async () => {};
      app.cloud.client = { rpc: () => rpcResult([]) };
      api.openPublishProductModal(missingProduct.id);
      const missingResult = await api.publishProductToPos();
      const missing = {
        missingResult, error: app.publishError,
        modalOpen: app.publishModalOpen,
      };

      const refreshProduct = reset();
      const refreshRow = harness.record();
      const refreshTrace: string[] = [];
      api.waitForCostingSync = async () => {};
      app.loadPosPublicationStatus = async () => {
        refreshTrace.push('status-failed'); throw new Error('status offline');
      };
      app.refreshPosCatalogOnly = async () => {
        refreshTrace.push('catalog-failed'); throw new Error('catalog offline');
      };
      app.cloud.client = { rpc: () => rpcResult([refreshRow]) };
      api.openPublishProductModal(refreshProduct.id);
      const refreshResult = await api.publishProductToPos();
      const refreshFailure = {
        refreshResult, refreshTrace, modalOpen: app.publishModalOpen,
        notice: app.posCheckout.notice,
        hasPublication: Boolean(app.posContext.publications[refreshProduct.id]),
      };

      const stale: Record<string, unknown> = { beforeRpc: {} };
      const runBeforeRpcStale = async (
        name: string,
        mutate: () => void,
      ) => {
        const product = reset();
        let release!: () => void;
        api.waitForCostingSync = () => new Promise<void>((resolve) => {
          release = resolve;
        });
        let rpcCalls = 0;
        app.cloud.client = {
          rpc() { rpcCalls += 1; return rpcResult([]); },
        };
        api.openPublishProductModal(product.id);
        const pending = api.publishProductToPos();
        mutate();
        release();
        const result = await pending;
        (stale.beforeRpc as Record<string, unknown>)[name] = {
          result,
          rpcCalls,
          hasPublication: Boolean(app.posContext.publications[product.id]),
          modalOpen: app.publishModalOpen,
          submitting: app.publishSubmitting,
          error: app.publishError,
        };
      };
      await runBeforeRpcStale('user', () => {
        app.session = { user: { id: 'different-user' } };
      });
      await runBeforeRpcStale('business', () => {
        app.posContext.businessId = '99999999-9999-4999-8999-999999999999';
      });
      await runBeforeRpcStale('posGeneration', () => {
        app.posLoadGeneration += 1;
      });
      await runBeforeRpcStale('costingGeneration', () => {
        app.costingLoadGeneration += 1;
      });

      const afterRpcProduct = reset();
      const afterRpcRow = harness.record();
      api.waitForCostingSync = async () => {};
      let resolveAfterRpc!: (value: unknown) => void;
      const afterRpcDeferred = new Promise((resolve) => {
        resolveAfterRpc = resolve;
      });
      app.cloud.client = { rpc: () => afterRpcDeferred };
      api.openPublishProductModal(afterRpcProduct.id);
      const afterRpcPending = api.publishProductToPos();
      await Promise.resolve();
      await Promise.resolve();
      app.session = { user: { id: 'different-user' } };
      resolveAfterRpc({ data: [afterRpcRow], error: null });
      const afterRpcResult = await afterRpcPending;
      stale.afterRpcUser = {
        result: afterRpcResult,
        hasPublication: Boolean(app.posContext.publications[afterRpcProduct.id]),
        modalOpen: app.publishModalOpen,
        submitting: app.publishSubmitting,
      };

      const postStatusProduct = reset();
      const postStatusRow = harness.record();
      const postStatusTrace: string[] = [];
      api.waitForCostingSync = async () => {};
      let signalStatus!: () => void;
      const statusEntered = new Promise<void>((resolve) => { signalStatus = resolve; });
      let releaseStatus!: (value: boolean) => void;
      app.loadPosPublicationStatus = () => {
        postStatusTrace.push('status');
        signalStatus();
        return new Promise<boolean>((resolve) => { releaseStatus = resolve; });
      };
      app.refreshPosCatalogOnly = async () => {
        postStatusTrace.push('catalog');
        return true;
      };
      app.renderProducts = () => { postStatusTrace.push('renderProducts'); };
      app.renderPos = () => { postStatusTrace.push('renderPos'); };
      app.cloud.client = { rpc: () => rpcResult([postStatusRow]) };
      api.openPublishProductModal(postStatusProduct.id);
      const postStatusPending = api.publishProductToPos();
      await statusEntered;
      const postStatusBeforeRelease = {
        hasPublication: Boolean(app.posContext.publications[postStatusProduct.id]),
        notice: app.posCheckout.notice,
        modalOpen: app.publishModalOpen,
        submitting: app.publishSubmitting,
      };
      app.posLoadGeneration += 1;
      releaseStatus(true);
      const postStatusResult = await postStatusPending;
      stale.postStatus = {
        result: postStatusResult,
        trace: postStatusTrace,
        beforeRelease: postStatusBeforeRelease,
        notice: app.posCheckout.notice,
        modalOpen: app.publishModalOpen,
        submitting: app.publishSubmitting,
      };

      const postCatalogProduct = reset();
      const postCatalogRow = harness.record();
      const postCatalogTrace: string[] = [];
      api.waitForCostingSync = async () => {};
      app.loadPosPublicationStatus = async () => {
        postCatalogTrace.push('status');
        return true;
      };
      let signalCatalog!: () => void;
      const catalogEntered = new Promise<void>((resolve) => { signalCatalog = resolve; });
      let releaseCatalog!: (value: boolean) => void;
      app.refreshPosCatalogOnly = () => {
        postCatalogTrace.push('catalog');
        signalCatalog();
        return new Promise<boolean>((resolve) => { releaseCatalog = resolve; });
      };
      app.renderProducts = () => { postCatalogTrace.push('renderProducts'); };
      app.renderPos = () => { postCatalogTrace.push('renderPos'); };
      app.cloud.client = { rpc: () => rpcResult([postCatalogRow]) };
      api.openPublishProductModal(postCatalogProduct.id);
      const postCatalogPending = api.publishProductToPos();
      await catalogEntered;
      const postCatalogBeforeRelease = {
        hasPublication: Boolean(app.posContext.publications[postCatalogProduct.id]),
        notice: app.posCheckout.notice,
        modalOpen: app.publishModalOpen,
        submitting: app.publishSubmitting,
      };
      app.posLoadGeneration += 1;
      releaseCatalog(true);
      const postCatalogResult = await postCatalogPending;
      stale.postCatalog = {
        result: postCatalogResult,
        trace: postCatalogTrace,
        beforeRelease: postCatalogBeforeRelease,
        notice: app.posCheckout.notice,
        modalOpen: app.publishModalOpen,
        submitting: app.publishSubmitting,
      };

      return {
        success, failure, conflict, permissionFailure, preflight, postWait,
        duplicate, missing, refreshFailure, stale,
      };
    } finally {
      restore();
    }
  });
}

async function collectDeleteFingerprint(page: Page): Promise<Record<string, any>> {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const api = (app.MatchaLunaApp?.domains?.publication || app) as Record<string, any>;
    const harness = app.__phase4fPublicationHarness;
    const names = [
      'loadPosPublicationStatus', 'logChanges', 'save', 'renderAll',
      'renderProducts', 'alert', 'confirm', 'posClearCatalogCache',
      'resetPosContext', 'renderAccount',
    ];
    const rootOriginals = Object.fromEntries(names.map((name) => [name, app[name]]));
    const apiOriginals = Object.fromEntries([
      'posPublicationHtml', 'openPublishProductModal',
      'closePublishProductModal', 'publishProductToPos',
      'deleteCostingProduct', 'ingredientDependsOn',
    ].map((name) => [name, api[name]]));
    const originalTestMode = app.TEST_MODE;
    const restore = () => {
      Object.assign(app, rootOriginals);
      Object.assign(api, apiOriginals);
      app.TEST_MODE = originalTestMode;
    };
    const reset = () => {
      restore();
      const product = harness.reset();
      app.TEST_MODE = false;
      return product;
    };
    const run = async (
      configure: (
        product: Record<string, any>,
        trace: string[],
        notices: string[],
      ) => string | void,
    ) => {
      const product = reset();
      const trace: string[] = [];
      const notices: string[] = [];
      let targetId = product.id;
      app.alert = (message: unknown) => { notices.push(String(message)); };
      app.confirm = () => { trace.push('confirm'); return true; };
      app.loadPosPublicationStatus = async () => {
        trace.push('status'); return true;
      };
      app.logChanges = () => { trace.push('logChanges'); };
      app.save = () => { trace.push('save'); };
      app.renderAll = () => { trace.push('renderAll'); };
      app.renderProducts = () => { trace.push('renderProducts'); };
      const configuredId = configure(product, trace, notices);
      if (configuredId) targetId = configuredId;
      const before = {
        state: app.stableSerialize(app.state),
        storage: harness.storage(),
      };
      const result = await api.deleteCostingProduct(targetId);
      return {
        result,
        trace,
        notices,
        productExists: Boolean(app.getById(app.state.products, product.id)),
        stateUnchanged: before.state === app.stableSerialize(app.state),
        storageUnchanged:
          JSON.stringify(before.storage) === JSON.stringify(harness.storage()),
      };
    };

    try {
      const cases: Record<string, unknown> = {};
      cases.missing = await run(() => 'missing-product');
      cases.knownPublished = await run((product) => {
        app.posContext.publications[product.id] = harness.record();
        app.loadPosPublicationStatus = async () => {
          throw new Error('known publication must not refresh');
        };
      });
      cases.signedOut = await run(() => { app.session = null; });
      cases.disconnected = await run(() => { app.cloud.connected = false; });
      cases.role = await run(() => { app.posContext.role = 'cashier'; });
      cases.refreshError = await run(() => {
        app.loadPosPublicationStatus = async () => {
          throw new Error('status offline');
        };
      });
      cases.refreshFalse = await run(() => {
        app.loadPosPublicationStatus = async () => false;
      });
      cases.refreshedActive = await run((product, trace) => {
        app.loadPosPublicationStatus = async () => {
          trace.push('status');
          app.posContext.publications[product.id] = harness.record();
          return true;
        };
      });
      cases.disappeared = await run((_product, trace) => {
        app.loadPosPublicationStatus = async () => {
          trace.push('status');
          app.state.products = [];
          return true;
        };
      });
      cases.cancel = await run(() => {
        app.confirm = () => false;
      });
      cases.success = await run(() => {});

      const strictProduct = reset();
      strictProduct.id = '1';
      app.state.products.push(Object.assign({}, strictProduct, {
        id: 1,
        name: 'Numeric ID twin',
      }));
      const strictTrace: string[] = [];
      app.loadPosPublicationStatus = async () => {
        strictTrace.push('status');
        return true;
      };
      app.confirm = () => { strictTrace.push('confirm'); return true; };
      app.logChanges = () => { strictTrace.push('logChanges'); };
      app.save = () => { strictTrace.push('save'); };
      app.renderAll = () => { strictTrace.push('renderAll'); };
      let productsValue = app.state.products;
      let productsAssignments = 0;
      Object.defineProperty(app.state, 'products', {
        configurable: true,
        enumerable: true,
        get: () => productsValue,
        set: (value) => {
          productsAssignments += 1;
          productsValue = value;
        },
      });
      const strictResult = await api.deleteCostingProduct('1');
      const strictDeletion = {
        result: strictResult,
        assignments: productsAssignments,
        ids: productsValue.map((item: Record<string, unknown>) => ({
          id: item.id,
          type: typeof item.id,
        })),
        trace: strictTrace,
      };

      reset();
      const consumerTrace: string[] = [];
      const publicationReplacements = {
        posPublicationHtml: api.posPublicationHtml,
        openPublishProductModal: api.openPublishProductModal,
        closePublishProductModal: api.closePublishProductModal,
        publishProductToPos: api.publishProductToPos,
        deleteCostingProduct: api.deleteCostingProduct,
        ingredientDependsOn: api.ingredientDependsOn,
      };
      api.posPublicationHtml = (product: Record<string, unknown>) => {
        consumerTrace.push(`costing:${String(product.id)}`);
        return '<div id="publication-live-marker">live publication</div>';
      };
      app.renderProducts();
      const costingReached = Boolean(document.getElementById('publication-live-marker'));

      api.openPublishProductModal = (id: string) => {
        consumerTrace.push(`event:open:${id}`); return true;
      };
      api.closePublishProductModal = () => {
        consumerTrace.push('event:close'); return true;
      };
      api.publishProductToPos = async () => {
        consumerTrace.push('event:publish'); return true;
      };
      api.deleteCostingProduct = async (id: string) => {
        consumerTrace.push(`event:delete:${id}`); return true;
      };
      const host = document.createElement('div');
      host.innerHTML = [
        '<button data-act="openPublishModal" data-id="p1"></button>',
        '<button data-act="closePublishModal"></button>',
        '<button data-act="publishProductToPos"></button>',
        '<button data-act="delProduct" data-id="p2"></button>',
      ].join('');
      document.body.appendChild(host);
      Array.from(host.querySelectorAll('button')).forEach((button) => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await Promise.resolve();
      host.remove();

      app.state.ingredients.push({
        id: 'candidate-mixture', name: 'Candidate', kind: 'mixture',
        unit: 'ml', batchYield: 1, components: [],
      });
      app.mixtureDraft = {
        id: 'draft-mixture', kind: 'mixture', name: 'Draft', categoryId: '',
        unit: 'ml', batchYield: 1, components: [], pendingIngredients: [],
      };
      api.ingredientDependsOn = (...args: unknown[]) => {
        consumerTrace.push(`mixture:${String(args[0])}:${String(args[1])}`);
        return args[0] === 'candidate-mixture';
      };
      const candidates = app.mixtureCandidates().map((item: Record<string, unknown>) => item.id);

      app.posClearCatalogCache = () => { consumerTrace.push('logout:cache'); };
      app.resetPosContext = () => { consumerTrace.push('logout:reset'); };
      app.renderAccount = () => { consumerTrace.push('logout:account'); };
      app.renderAll = () => { consumerTrace.push('logout:render'); };
      api.closePublishProductModal = () => {
        consumerTrace.push('logout:close');
        app.publishModalOpen = false;
        return true;
      };
      app.publishModalOpen = true;
      app.publishSubmitting = true;
      app.currentUserId = null;
      await app.handleAuth(null);

      Object.assign(api, publicationReplacements);
      return {
        cases,
        strictDeletion,
        consumers: { costingReached, consumerTrace, candidates },
      };
    } finally {
      restore();
    }
  });
}

test('typed Publication keeps its registration boundary, slot, runtime, and fallback', async ({
  page,
  context,
}) => {
  await stubSupabase(page);
  await page.route(/\/assets\/js\/pos-operations\.js(?:\?|$)/, async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const probe = `\nwindow.__publicationBoundaryBefore={domain:Object.prototype.hasOwnProperty.call(window.MatchaLunaApp.domains,'publication'),root:${JSON.stringify(publicationNames)}.map(function(name){return typeof window[name];}),scripts:Array.from(document.querySelectorAll('script[data-matcha-luna-runtime]')).map(function(script){return script.dataset.matchaLunaRuntime;})};\n`;
    await route.fulfill({ response, body: source + probe });
  });
  await page.goto('index.html?test=1', { waitUntil: 'load' });
  await page.evaluate(() =>
    (window as typeof window & { MatchaLunaApp: { ready: Promise<void> } })
      .MatchaLunaApp.ready,
  );
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');

  const contract = await page.evaluate((names) => {
    const root = window as typeof window & Record<string, any>;
    const facade = root.MatchaLunaApp;
    const publication = facade.domains.publication as Record<string, any>;
    const originals = Object.fromEntries(names.map((name) => [name, publication[name]]));
    const descriptor = (owner: Record<string, any>, name: string) => {
      const value = Object.getOwnPropertyDescriptor(owner, name)!;
      return {
        configurable: value.configurable,
        enumerable: value.enumerable,
        writable: value.writable,
        hasGetter: typeof value.get === 'function',
        hasSetter: typeof value.set === 'function',
      };
    };
    const roundTrips = names.map((name, index) => {
      const domainValue = function domainReplacement() { return index; };
      publication[name] = domainValue;
      const domainReachedRoot = root[name] === domainValue;
      const domainReachedLegacy = facade.domains.legacy[name] === domainValue;
      const rootValue = function rootReplacement() { return index + 100; };
      root[name] = rootValue;
      const rootReachedDomain = publication[name] === rootValue;
      const rootReachedLegacy = facade.domains.legacy[name] === rootValue;
      publication[name] = originals[name];
      return {
        domainReachedRoot, domainReachedLegacy,
        rootReachedDomain, rootReachedLegacy,
      };
    });
    return {
      version: facade.contractVersion,
      contractLength: facade.contractNames.length,
      domainOrder: Object.keys(facade.domains),
      domainSizes: Object.fromEntries(
        Object.entries(facade.domains).map(([name, domain]) => [
          name, Object.keys(domain as Record<string, unknown>).length,
        ]),
      ),
      publicationOrder: Object.keys(publication),
      protectedNames: names.filter((name) => facade.contractNames.includes(name)),
      rootMatches: names.map((name) => root[name] === publication[name]),
      namespaceDescriptors: names.map((name) => descriptor(publication, name)),
      rootDescriptors: names.map((name) => descriptor(root, name)),
      roundTrips,
      activeRuntime: Array.from(
        document.querySelectorAll<HTMLScriptElement>('script[data-matcha-luna-runtime]'),
        (script) => script.dataset.matchaLunaRuntime,
      ),
      before: root.__publicationBoundaryBefore,
    };
  }, [...publicationNames]);

  const classicPage = await openClassic(context);
  const classicRuntime = await classicPage.evaluate(() => ({
    modules: document.querySelectorAll('script[type="module"]').length,
    scripts: Array.from(
      document.querySelectorAll<HTMLScriptElement>('script[src*="/assets/js/"]'),
      (script) => new URL(script.src).pathname.split('/').pop(),
    ),
    hasPublicationDomain: Boolean(
      (window as typeof window & Record<string, any>)
        .MatchaLunaApp?.domains?.publication,
    ),
  }));
  await classicPage.close();

  const fallback = await page.request.get(
    'http://127.0.0.1:4173/Scoopies/assets/js/publication.js',
  );
  const fallbackText = await fallback.text();
  const classicSource = readFileSync(
    resolve(process.cwd(), 'assets/js/publication.js'),
    'utf8',
  );
  const canonicalFallback = fallbackText.replace(/\r\n?/g, '\n');
  const canonicalClassic = classicSource.replace(/\r\n?/g, '\n');
  const bytes = Buffer.from(canonicalFallback, 'utf8');
  const sha256 = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  const gitBlob = createHash('sha1')
    .update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');
  const mainSource = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8');
  const readyIndex = mainSource.indexOf('const ready');
  const dependencySlot = mainSource.indexOf(
    'loadClassicScripts(AFTER_STOCKS_BEFORE_COSTING_VIEW)', readyIndex,
  );
  const publicationSlot = mainSource.indexOf(
    'registerPublicationModule(facade, window)', readyIndex,
  );
  const costingViewSlot = mainSource.indexOf(
    'registerCostingViewModule(facade, window)', readyIndex,
  );

  expect(contract).toMatchObject({
    version: 1,
    contractLength: 175,
    domainOrder: [
      'core', 'runtime', 'costing', 'stocks', 'publication',
      'modals', 'pos', 'support', 'events', 'legacy',
    ],
    domainSizes: {
      core: 15, runtime: 4, costing: 37, stocks: 63,
      publication: 10, modals: 46, pos: 19, support: 3, events: 1,
    },
    publicationOrder: publicationNames,
    protectedNames: protectedPublicationNames,
    activeRuntime: activeRuntimeFiles,
  });
  expect(contract.rootMatches).toEqual(publicationNames.map(() => true));
  expect(contract.namespaceDescriptors).toEqual(publicationNames.map(() => ({
    configurable: true, enumerable: true, writable: true,
    hasGetter: false, hasSetter: false,
  })));
  expect(contract.rootDescriptors).toEqual(publicationNames.map(() => ({
    configurable: true, enumerable: true,
    hasGetter: true, hasSetter: true,
  })));
  expect(contract.roundTrips).toEqual(publicationNames.map((name) => {
    const protectedName = (protectedPublicationNames as readonly string[])
      .includes(name);
    return {
      domainReachedRoot: true,
      domainReachedLegacy: protectedName,
      rootReachedDomain: true,
      rootReachedLegacy: protectedName,
    };
  }));
  expect(contract.before).toEqual({
    domain: false,
    root: publicationNames.map(() => 'undefined'),
    scripts: ['state.js', 'pos-catalog.js', 'workspace-sync.js', 'pos-operations.js'],
  });
  expect(classicRuntime).toEqual({
    modules: 0,
    scripts: transitionRuntimeFiles,
    hasPublicationDomain: false,
  });
  expect(fallback.status()).toBe(200);
  expect(canonicalFallback).toBe(canonicalClassic);
  expect(gitBlob).toBe('49d4ec24d9fecf986ce7d4f373acd339ac483ca7');
  expect(sha256).toBe('78BD373602F683259C1E5CF166B21084F21D2E19E83687CAF7C4C0307AFFE1B5');
  expect(dependencySlot).toBeGreaterThan(readyIndex);
  expect(publicationSlot).toBeGreaterThan(dependencySlot);
  expect(costingViewSlot).toBeGreaterThan(publicationSlot);
});

test('typed Publication status, modal, sync, and dependency behavior matches classic live bindings', async ({
  page,
  context,
}) => {
  await openPrimary(page);
  const typed = await collectPureFingerprint(page);
  const classicPage = await openClassic(context);
  const classic = await collectPureFingerprint(classicPage);
  await classicPage.close();

  expect(typed).toEqual(classic);
  expect(Object.fromEntries(
    Object.entries(typed.statuses).map(([name, value]: [string, any]) => [
      name, value.key,
    ]),
  )).toEqual({
    unpublished: 'unpublished', published: 'published',
    unavailable: 'unavailable', archivedInvalid: 'archived',
    invalid: 'invalid', changed: 'changes',
  });
  expect(typed.html.loading).toContain('Checking POS');
  expect(typed.html.signedOut).toContain('Sign in to publish');
  expect(typed.html.missingBusiness).toContain('Retry POS');
  expect(typed.html.error).toContain('POS offline &lt;retry&gt;');
  expect(typed.html.costingUnavailable).toContain('Costing cloud unavailable');
  expect(typed.html.readOnly).toContain('POS managed by owner');
  expect(typed.html.archived).toContain('Archived');
  expect(typed.liveTrace).toContain('publicationStatusFor');
  expect(typed.liveTrace.some((item: string) => item.startsWith('escape:'))).toBe(true);
  expect(typed.liveHtml).toContain('ESC(');
  expect(typed.modalOrdering).toEqual({
    denied: {
      result: false,
      trace: ['canPublish', 'alert'],
      pendingRemote: 'denied',
    },
    invalid: {
      result: false,
      trace: [
        'canPublish', 'consume', 'getById', 'validate',
        'alert:invalid fixture', 'renderProducts',
      ],
      pendingRemote: null,
    },
  });
  expect(typed.openState).toMatchObject({
    opened: true, visible: true, productId: 'matcha-product',
    stateUnchanged: true, storageUnchanged: true,
  });
  expect(typed.openState.html).toContain('Publish product to POS');
  expect(typed.progressState).toMatchObject({
    ariaBusy: 'true',
    progressText: 'Publishing the reviewed version...',
    focusTrace: ['#publishProgress'],
  });
  expect(typed.progressState.disabledCount).toBe(5);
  expect(typed.progressState.html).toContain('publish &lt;error&gt;');
  expect(typed.progressState.html).toContain('publish &lt;notice&gt;');
  expect(typed.closeState).toEqual({
    blockedClose: false,
    closeResult: true,
    callbacksAfterClose: 1,
    callbacksAfterFocus: 1,
    hidden: true,
    focusRestored: true,
    modalOpen: false,
  });
  expect(typed.missingLookup).toEqual({
    missingContentResultType: 'undefined',
    missingProductResultType: 'undefined',
    trace: ['getById', 'getById'],
    htmlUnchanged: true,
  });
  expect(typed.missingContentError).toBe('lookup exploded');
  expect(typed.nativeTrace).toEqual(expect.arrayContaining([
    'String', 'Number', 'Date:construct', 'Date:now',
    'Promise:construct', 'document:publishModal',
  ]));
  expect(typed.sync.clean).toEqual({ type: 'undefined' });
  expect(typed.sync.pendingThenClean).toEqual({ type: 'undefined' });
  expect(typed.sync.partner.posMessage).toMatch(/partner/i);
  expect(typed.sync.dirty.posMessage).toMatch(/not saved/i);
  expect(typed.sync.timeout.posMessage).toMatch(/still syncing/i);
  for (const name of ['timeoutZero', 'timeoutNaN']) {
    expect(typed.sync[name]).toMatchObject({
      initiallyScheduled: 1,
      beforeLimit: { settled: false, queued: 1 },
    });
    expect(typed.sync[name].error.posMessage).toMatch(/still syncing/i);
  }
  expect(typed.dependencies).toMatchObject({
    same: true, nested: true, missing: false, custom: true,
  });
  expect(Object.keys(typed.dependencies.seen)).toEqual(['mix-a', 'mix-b', 'matcha']);
  expect(typed.recursiveResult).toBe(false);
  expect(typed.recursiveTrace).toEqual(['mix-b']);
  expect(typed.explainResultType).toBe('undefined');
  expect(typed.alerts).toHaveLength(1);
});

test('typed Publication RPC state machine matches classic success, failure, and stale-request safety', async ({
  page,
  context,
}) => {
  await openPrimary(page);
  const typed = await collectPublishFingerprint(page);
  const classicPage = await openClassic(context);
  const classic = await collectPublishFingerprint(classicPage);
  await classicPage.close();

  expect(typed).toEqual(classic);
  expect(typed.success).toMatchObject({
    successOpened: true,
    successResult: true,
    successRpcCalls: 1,
    successTrace: [
      'wait', 'rpc:pos_publish_costing_product', 'status', 'catalog',
      'renderProducts', 'renderPos',
    ],
    modalOpen: false,
    submitting: false,
    safety: { state: true, storage: true },
  });
  expect(typed.success.successPayload).toMatchObject({
    p_business_id: '11111111-1111-4111-8111-111111111111',
    p_source_costing_product_id: 'matcha-product',
    p_source_costing_recipe_id: 'matcha-recipe',
    p_name: 'Matcha Latte 12oz',
    p_selling_price_centavos: 17001,
    p_ingredient_cost_centavos: 6243,
    p_packaging_cost_centavos: 1555,
    p_size: '12 oz',
    p_category_name: 'Matcha Drinks',
  });
  expect(typed.success.successPayload.p_expected_active_version_id)
    .toBe('existing-version-id');
  expect(typed.success.successPayload.p_costing_snapshot).toEqual(
    typed.success.publication.costing_snapshot,
  );
  expect(typed.failure).toMatchObject({
    failureResult: false, failureRpcCalls: 1, modalOpen: true,
    submitting: false, hasPublication: false,
    safety: { state: true, storage: true },
  });
  expect(typed.failure.error).toMatch(/could not|connection|database/i);
  expect(typed.conflict).toMatchObject({
    conflictResult: false, conflictRpcCalls: 1,
    conflictTrace: ['publish', 'status'], modalOpen: true,
  });
  expect(typed.conflict.error).toMatch(/partner|newer version/i);
  expect(typed.permissionFailure).toMatchObject({
    permissionResult: false,
    permissionRpcCalls: 1,
    modalOpen: true,
    submitting: false,
  });
  expect(typed.permissionFailure.error).toMatch(/permission.*publish/i);
  for (const result of Object.values(typed.preflight) as any[]) {
    expect(result.result).toBe(false);
    expect(result.calls).toBe(0);
    expect(result.modalOpen).toBe(true);
    expect(result.error).toBeTruthy();
  }
  expect(typed.postWait.invalid).toMatchObject({
    result: false, calls: 0, modalOpen: true, submitting: false,
  });
  expect(typed.postWait.invalid.error).toMatch(/at least one ingredient/i);
  expect(typed.postWait.fingerprint).toMatchObject({
    result: false, calls: 0, modalOpen: true, submitting: false,
  });
  expect(typed.postWait.fingerprint.error).toMatch(/changed while.*publishing/i);
  expect(typed.duplicate).toEqual({
    duplicateRpcCalls: 1,
    firstResult: true,
    secondResult: false,
    pendingSnapshot: {
      safety: { state: true, storage: true },
      hasPublication: false,
      modalOpen: true,
      submitting: true,
      rpcCalls: 1,
    },
  });
  expect(typed.missing).toMatchObject({ missingResult: false, modalOpen: true });
  expect(typed.missing.error).toBeTruthy();
  expect(typed.refreshFailure).toMatchObject({
    refreshResult: true,
    refreshTrace: ['status-failed', 'catalog-failed'],
    modalOpen: false,
    hasPublication: true,
  });
  expect(typed.refreshFailure.notice).toMatch(/published.*refresh/i);
  for (const name of ['user', 'business', 'posGeneration']) {
    expect(typed.stale.beforeRpc[name], name).toEqual({
      result: false,
      rpcCalls: 0,
      hasPublication: false,
      modalOpen: true,
      submitting: true,
      error: '',
    });
  }
  expect(typed.stale.beforeRpc.costingGeneration).toMatchObject({
    result: false,
    rpcCalls: 0,
    hasPublication: false,
    modalOpen: true,
    submitting: false,
  });
  expect(typed.stale.beforeRpc.costingGeneration.error)
    .toMatch(/costing data refreshed/i);
  expect(typed.stale.afterRpcUser).toEqual({
    result: false,
    hasPublication: false,
    modalOpen: true,
    submitting: true,
  });
  expect(typed.stale.postStatus).toEqual({
    result: false,
    trace: ['status'],
    beforeRelease: {
      hasPublication: true,
      notice: '',
      modalOpen: true,
      submitting: true,
    },
    notice: '',
    modalOpen: true,
    submitting: true,
  });
  expect(typed.stale.postCatalog).toEqual({
    result: false,
    trace: ['status', 'catalog'],
    beforeRelease: {
      hasPublication: true,
      notice: '',
      modalOpen: true,
      submitting: true,
    },
    notice: '',
    modalOpen: true,
    submitting: true,
  });
});

test('typed Publication deletion guards and downstream consumers remain safe and live', async ({
  page,
  context,
}) => {
  await openPrimary(page);
  const typed = await collectDeleteFingerprint(page);
  const classicPage = await openClassic(context);
  const classic = await collectDeleteFingerprint(classicPage);
  await classicPage.close();

  expect(typed).toEqual(classic);
  for (const name of [
    'missing', 'knownPublished', 'signedOut', 'disconnected', 'role',
    'refreshError', 'refreshFalse', 'refreshedActive', 'disappeared', 'cancel',
  ]) {
    expect(typed.cases[name].result, name).toBe(false);
    expect(typed.cases[name].trace, name).not.toContain('logChanges');
    expect(typed.cases[name].trace, name).not.toContain('save');
    expect(typed.cases[name].trace, name).not.toContain('renderAll');
    expect(typed.cases[name].storageUnchanged, name).toBe(true);
    if (name !== 'disappeared') {
      expect(typed.cases[name].stateUnchanged, name).toBe(true);
    }
  }
  expect(typed.cases.knownPublished.trace).toEqual([]);
  expect(typed.cases.refreshedActive.trace).toEqual(['status', 'renderProducts']);
  expect(typed.cases.disappeared.trace).toEqual(['status']);
  expect(typed.cases.success).toMatchObject({
    result: true,
    trace: ['status', 'confirm', 'logChanges', 'save', 'renderAll'],
    productExists: false,
    stateUnchanged: false,
    storageUnchanged: true,
  });
  expect(typed.strictDeletion).toEqual({
    result: true,
    assignments: 1,
    ids: [{ id: 1, type: 'number' }],
    trace: ['status', 'confirm', 'logChanges', 'save', 'renderAll'],
  });
  expect(typed.consumers.costingReached).toBe(true);
  expect(typed.consumers.consumerTrace).toEqual(expect.arrayContaining([
    'costing:matcha-product',
    'event:open:p1',
    'event:close',
    'event:publish',
    'event:delete:p2',
    'mixture:candidate-mixture:draft-mixture',
    'logout:close',
  ]));
  expect(typed.consumers.candidates).not.toContain('candidate-mixture');
});
