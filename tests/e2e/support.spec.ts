import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const supportNames = ['exportData', 'handleFileImport', 'exampleData'] as const;

const activeRuntimeFiles = [
  'state.js',
  'pos-catalog.js',
  'workspace-sync.js',
  'pos-operations.js',
  'publication.js',
  'render-costing.js',
  'render-modals.js',
  'render-pos.js',
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

async function stubSupabase(page: Page) {
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

async function openPrimary(page: Page) {
  await stubSupabase(page);
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

async function openClassic(page: Page) {
  const builtHtml = readFileSync(
    resolve(process.cwd(), 'dist/index.html'),
    'utf8',
  );
  const classicScripts = transitionRuntimeFiles
    .map(
      (fileName) =>
        `<script src="/Scoopies/assets/js/${fileName}"></script>`,
    )
    .join('\n');
  const transitionHtml = builtHtml
    .replace(/\s*<script type="module"[^>]*><\/script>/, '')
    .replace('</body>', `${classicScripts}\n</body>`);

  await stubSupabase(page);
  await page.route(
    '**/index.html?test=1&support-transition=1',
    async (route) => {
      await route.fulfill({ contentType: 'text/html', body: transitionHtml });
    },
  );
  await page.goto('index.html?test=1&support-transition=1', {
    waitUntil: 'load',
  });
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
}

async function collectExportFingerprint(page: Page, typed: boolean) {
  return page.evaluate(async (useTypedDomain) => {
    const root = window as typeof window & Record<string, any>;
    const handler = useTypedDomain
      ? root.MatchaLunaApp.domains.support.exportData
      : root.exportData;
    const payload = {
      ingredients: [{ id: 'ingredient-1', name: 'Matcha' }],
      packaging: [],
      note: 'Phase 4C',
    };
    const trace: Array<Record<string, unknown>> = [];
    let capturedBlob: Blob | null = null;
    let clickedDownload = '';
    let clickedHref = '';
    let persistenceCalls = 0;
    const NativeBlob = root.Blob as typeof Blob;

    root.state = payload;
    root.APP_BRAND_SLUG = 'phase-4c-live';
    root.save = () => {
      persistenceCalls += 1;
    };
    root.cloudSave = () => {
      persistenceCalls += 1;
    };
    root.logCoarse = () => {
      persistenceCalls += 1;
    };
    const replacementUrl = {
      revokeObjectURL(url: string) {
        trace.push({ action: 'replacement-revoke', url });
      },
    };
    const anchor = {
      href: '',
      download: '',
      isConnected: false,
      click() {
        clickedDownload = this.download;
        clickedHref = this.href;
        trace.push({
          action: 'click',
          download: this.download,
          href: this.href,
          attached: this.isConnected,
        });
        Reflect.set(root, 'URL', replacementUrl);
      },
    };
    class SwitchingBlob extends NativeBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        trace.push({ action: 'blob', type: this.type });
        Object.defineProperty(root.document, 'createElement', {
          configurable: true,
          enumerable: true,
          value(tagName: string) {
            trace.push({ action: 'document', tagName });
            return anchor;
          },
          writable: true,
        });
      }
    }
    Reflect.set(root, 'Blob', SwitchingBlob);
    Reflect.set(root, 'URL', {
      createObjectURL(blob: Blob) {
        capturedBlob = blob;
        trace.push({ action: 'create', type: blob.type });
        return 'blob:phase-4c-export';
      },
      revokeObjectURL(url: string) {
        trace.push({ action: 'stale-revoke', url });
      },
    });

    const returned = handler();
    const blob = capturedBlob as Blob | null;
    return {
      returnedUndefined: returned === undefined,
      blobText: blob ? await blob.text() : null,
      blobType: blob ? blob.type : null,
      clickedDownload,
      clickedHref,
      trace,
      persistenceCalls,
      stateUnchanged: root.state === payload,
    };
  }, typed);
}

async function collectImportFingerprint(page: Page, typed: boolean) {
  return page.evaluate((useTypedDomain) => {
    const root = window as typeof window & Record<string, any>;
    const handler = useTypedDomain
      ? root.MatchaLunaApp.domains.support.handleFileImport
      : root.handleFileImport;
    const readers: any[] = [];
    const reads: string[] = [];
    const alerts: string[] = [];
    const replacements: Array<Record<string, unknown>> = [];
    const NativeJSON = root.JSON as JSON;
    let lastParsedValue: unknown;

    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      onload: ((event?: unknown) => void) | null = null;
      onerror: ((event?: unknown) => void) | null = null;
      onabort: ((event?: unknown) => void) | null = null;

      constructor() {
        readers.push(this);
      }

      readAsText(file: { marker: string }) {
        reads.push(file.marker);
        if (file.marker === 'sync-throw') {
          throw new Error('read failed synchronously');
        }
      }
    }

    Reflect.set(root, 'FileReader', MockFileReader);
    Reflect.set(root, 'JSON', {
      parse(text: string) {
        lastParsedValue = NativeJSON.parse(text);
        return lastParsedValue;
      },
      stringify: NativeJSON.stringify,
    });
    root.alert = (message: unknown) => alerts.push(String(message));

    const wrongTargetResult = handler({
      target: { id: 'notImportFile', files: [{ marker: 'wrong' }], value: 'keep' },
    });
    const noFileResult = handler({
      target: { id: 'importFile', files: [], value: 'keep' },
    });
    const noOpReaderCount = readers.length;

    let initialReplacementCalls = 0;
    root.replaceCostingStateSafely = () => {
      initialReplacementCalls += 1;
      return true;
    };
    const firstFile = { marker: 'first-file' };
    const ignoredSecondFile = { marker: 'second-file' };
    const successTarget = {
      id: 'importFile',
      files: [firstFile, ignoredSecondFile],
      value: 'chosen',
    };
    const successResult = handler({ target: successTarget });
    const successReader = readers.at(-1)!;
    root.replaceCostingStateSafely = (data: unknown, activity: unknown) => {
      replacements.push({
        source: 'late',
        data,
        activity,
        sameAsParsed: data === lastParsedValue,
      });
      return true;
    };
    successReader.result = JSON.stringify({
      ingredients: [{ id: 'imported-ingredient' }],
      recipes: [],
    });
    successReader.onload();
    const successAlerts = alerts.splice(0);

    root.replaceCostingStateSafely = (data: unknown, activity: unknown) => {
      replacements.push({
        source: 'blocked',
        data,
        activity,
        sameAsParsed: data === lastParsedValue,
      });
      return false;
    };
    const blockedTarget = {
      id: 'importFile',
      files: [{ marker: 'blocked-file' }],
      value: 'chosen',
    };
    handler({ target: blockedTarget });
    const blockedReader = readers.at(-1)!;
    blockedReader.result = JSON.stringify({ ingredients: [] });
    blockedReader.onload();
    const blockedAlerts = alerts.splice(0);

    root.APP_BRAND_NAME = 'Callback Brand';
    const invalidTarget = {
      id: 'importFile',
      files: [{ marker: 'invalid-shape' }],
      value: 'chosen',
    };
    handler({ target: invalidTarget });
    const invalidReader = readers.at(-1)!;
    invalidReader.result = JSON.stringify({ recipes: [] });
    invalidReader.onload();
    const invalidAlerts = alerts.splice(0);

    const malformedTarget = {
      id: 'importFile',
      files: [{ marker: 'malformed-json' }],
      value: 'chosen',
    };
    handler({ target: malformedTarget });
    const malformedReader = readers.at(-1)!;
    malformedReader.result = '{';
    malformedReader.onload();
    const malformedAlerts = alerts.splice(0);

    root.replaceCostingStateSafely = () => true;
    root.alert = (message: unknown) => {
      if (message === 'Backup imported successfully.') {
        throw new Error('success alert exploded');
      }
      alerts.push(String(message));
    };
    const successAlertThrowTarget = {
      id: 'importFile',
      files: [{ marker: 'success-alert-throw' }],
      value: 'chosen',
    };
    handler({ target: successAlertThrowTarget });
    const successAlertThrowReader = readers.at(-1)!;
    successAlertThrowReader.result = JSON.stringify({ ingredients: [] });
    successAlertThrowReader.onload();
    const successAlertThrowAlerts = alerts.splice(0);

    root.alert = (message: unknown) => alerts.push(String(message));
    root.replaceCostingStateSafely = () => {
      throw new Error('replacement exploded');
    };
    const throwingTarget = {
      id: 'importFile',
      files: [{ marker: 'throwing-replacement' }],
      value: 'chosen',
    };
    handler({ target: throwingTarget });
    const throwingReader = readers.at(-1)!;
    throwingReader.result = JSON.stringify({ ingredients: [] });
    throwingReader.onload();
    const throwingAlerts = alerts.splice(0);

    const syncTarget = {
      id: 'importFile',
      files: [{ marker: 'sync-throw' }],
      value: 'keep-after-sync-error',
    };
    let synchronousError = '';
    try {
      handler({ target: syncTarget });
    } catch (error) {
      synchronousError = (error as Error).message;
    }

    return {
      wrongTargetUndefined: wrongTargetResult === undefined,
      noFileUndefined: noFileResult === undefined,
      successUndefined: successResult === undefined,
      noOpReaderCount,
      reads,
      initialReplacementCalls,
      replacements,
      successAlerts,
      blockedAlerts,
      invalidAlerts,
      malformedAlerts,
      successAlertThrowAlerts,
      throwingAlerts,
      inputValues: {
        success: successTarget.value,
        blocked: blockedTarget.value,
        invalid: invalidTarget.value,
        malformed: malformedTarget.value,
        successAlertThrow: successAlertThrowTarget.value,
        throwing: throwingTarget.value,
        synchronous: syncTarget.value,
      },
      successReaderHandlers: {
        hasLoad: typeof successReader.onload === 'function',
        hasError: typeof successReader.onerror === 'function',
        hasAbort: typeof successReader.onabort === 'function',
      },
      synchronousError,
    };
  }, typed);
}

async function collectExampleFingerprint(page: Page, typed: boolean) {
  return page.evaluate((useTypedDomain) => {
    const root = window as typeof window & Record<string, any>;
    const handler = useTypedDomain
      ? root.MatchaLunaApp.domains.support.exampleData
      : root.exampleData;

    const real = handler();
    const realPrice = real.products[0].price;
    const realStateIdentity = root.state === real;

    let uidCount = 0;
    const pricingTrace: Array<Record<string, unknown>> = [];
    root.uid = () => {
      uidCount += 1;
      pricingTrace.push({ action: 'uid', value: `id-${uidCount}` });
      return `id-${uidCount}`;
    };
    root.productCost = (product: Record<string, unknown>) => {
      pricingTrace.push({
        action: 'productCost',
        productId: product.id,
        stateAlreadyAssigned:
          root.state.products[0] === product && root.state.products[0].id === 'id-14',
      });
      return 31;
    };
    root.suggestedPrice = (cost: number, margin: number) => {
      pricingTrace.push({ action: 'suggestedPrice', cost, margin });
      return 51;
    };
    root.isFinite = (value: number) => {
      pricingTrace.push({ action: 'isFinite', value });
      return true;
    };
    root.ceilTo = (value: number, step: number) => {
      pricingTrace.push({ action: 'ceilTo', value, step });
      return 55;
    };

    const first = handler();
    const firstTrace = pricingTrace.slice();
    const firstStateIdentity = root.state === first;
    const firstShape = {
      topKeys: Object.keys(first),
      categoryKeys: Object.keys(first.ingredientCategories[0]),
      ingredientKeys: Object.keys(first.ingredients[0]),
      packagingKeys: Object.keys(first.packaging[0]),
      recipeKeys: Object.keys(first.recipes[0]),
      recipeLineKeys: Object.keys(first.recipes[0].lines[0]),
      productKeys: Object.keys(first.products[0]),
      packagingLineKeys: Object.keys(first.products[0].packLines[0]),
      categoryId: first.ingredientCategories[0].id,
      ingredientIds: first.ingredients.map((item: Record<string, unknown>) => item.id),
      ingredientCategoryIds: first.ingredients.map(
        (item: Record<string, unknown>) => item.categoryId,
      ),
      packagingIds: first.packaging.map((item: Record<string, unknown>) => item.id),
      recipeId: first.recipes[0].id,
      recipeLineIds: first.recipes[0].lines.map(
        (item: Record<string, unknown>) => item.id,
      ),
      recipeIngredientIds: first.recipes[0].lines.map(
        (item: Record<string, unknown>) => item.ingredientId,
      ),
      productId: first.products[0].id,
      productRecipeId: first.products[0].recipeId,
      packagingLineIds: first.products[0].packLines.map(
        (item: Record<string, unknown>) => item.id,
      ),
      productPackagingIds: first.products[0].packLines.map(
        (item: Record<string, unknown>) => item.packagingId,
      ),
      names: {
        category: first.ingredientCategories[0].name,
        ingredients: first.ingredients.map(
          (item: Record<string, unknown>) => item.name,
        ),
        packaging: first.packaging.map(
          (item: Record<string, unknown>) => item.name,
        ),
        recipe: first.recipes[0].name,
        product: first.products[0].name,
      },
      counts: {
        ingredients: first.ingredients.length,
        packaging: first.packaging.length,
        recipeLines: first.recipes[0].lines.length,
        packagingLines: first.products[0].packLines.length,
        mixtureDrafts: first.mixtureDrafts.length,
      },
      price: first.products[0].price,
      raw: {
        schemaVersion: first.schemaVersion,
        ingredients: first.ingredients.map(
          (item: Record<string, unknown>) => ({
            id: item.id,
            kind: item.kind,
            categoryId: item.categoryId,
            name: item.name,
            qty: item.qty,
            unit: item.unit,
            price: item.price,
          }),
        ),
        packaging: first.packaging.map(
          (item: Record<string, unknown>) => ({
            id: item.id,
            name: item.name,
            qty: item.qty,
            price: item.price,
          }),
        ),
        recipe: {
          id: first.recipes[0].id,
          name: first.recipes[0].name,
          yield: first.recipes[0].yield,
          lines: first.recipes[0].lines.map(
            (item: Record<string, unknown>) => ({
              id: item.id,
              ingredientId: item.ingredientId,
              qty: item.qty,
              unit: item.unit,
            }),
          ),
        },
        product: {
          id: first.products[0].id,
          name: first.products[0].name,
          recipeId: first.products[0].recipeId,
          targetMargin: first.products[0].targetMargin,
          price: first.products[0].price,
          packLines: first.products[0].packLines.map(
            (item: Record<string, unknown>) => ({
              id: item.id,
              packagingId: item.packagingId,
              qty: item.qty,
            }),
          ),
        },
      },
    };

    const second = handler();
    const isolation = {
      state: first !== second,
      categories: first.ingredientCategories !== second.ingredientCategories,
      mixtureDrafts: first.mixtureDrafts !== second.mixtureDrafts,
      ingredients: first.ingredients !== second.ingredients,
      packaging: first.packaging !== second.packaging,
      recipes: first.recipes !== second.recipes,
      recipeLines: first.recipes[0].lines !== second.recipes[0].lines,
      products: first.products !== second.products,
      packagingLines: first.products[0].packLines !== second.products[0].packLines,
      categoryObjects: first.ingredientCategories.every(
        (item: unknown, index: number) => item !== second.ingredientCategories[index],
      ),
      ingredientObjects: first.ingredients.every(
        (item: unknown, index: number) => item !== second.ingredients[index],
      ),
      packagingObjects: first.packaging.every(
        (item: unknown, index: number) => item !== second.packaging[index],
      ),
      recipeObjects: first.recipes.every(
        (item: unknown, index: number) => item !== second.recipes[index],
      ),
      recipeLineObjects: first.recipes[0].lines.every(
        (item: unknown, index: number) => item !== second.recipes[0].lines[index],
      ),
      productObjects: first.products.every(
        (item: unknown, index: number) => item !== second.products[index],
      ),
      packagingLineObjects: first.products[0].packLines.every(
        (item: unknown, index: number) =>
          item !== second.products[0].packLines[index],
      ),
    };

    let nonFiniteCeilCalls = 0;
    root.suggestedPrice = () => Infinity;
    root.isFinite = () => false;
    root.ceilTo = () => {
      nonFiniteCeilCalls += 1;
      return 999;
    };
    const nonFinite = handler();

    const actionButton = document.querySelector(
      '[data-act="loadExample"]',
    ) as HTMLButtonElement;
    const click = () =>
      actionButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    let guardTrace: string[] = [];
    root.consumePendingRemoteForCommit = (force: unknown) => {
      guardTrace.push(`consume:${String(force)}`);
    };
    root.alert = (message: unknown) => {
      guardTrace.push(`alert:${String(message)}`);
    };
    root.confirm = (message: unknown) => {
      guardTrace.push(`confirm:${String(message)}`);
      return false;
    };
    root.exampleData = () => {
      guardTrace.push('example');
      return { source: 'guard-example' };
    };
    root.replaceCostingStateSafely = (data: unknown, activity: unknown) => {
      guardTrace.push(
        `replace:${String((data as { source?: string }).source)}:${String(activity)}`,
      );
      return true;
    };

    root.session = { user: { id: 'signed-in' } };
    click();
    const signedInGuard = guardTrace.slice();

    guardTrace = [];
    root.session = null;
    click();
    const offlineCancelGuard = guardTrace.slice();

    guardTrace = [];
    root.confirm = (message: unknown) => {
      guardTrace.push(`confirm:${String(message)}`);
      return true;
    };
    click();
    const offlineConfirmGuard = guardTrace.slice();

    return {
      realPrice,
      realStateIdentity,
      uidCountAfterFirst: firstTrace.filter((entry) => entry.action === 'uid').length,
      firstTrace,
      firstStateIdentity,
      firstShape,
      isolation,
      nonFinitePrice: nonFinite.products[0].price,
      nonFiniteCeilCalls,
      signedInGuard,
      offlineCancelGuard,
      offlineConfirmGuard,
    };
  }, typed);
}

test('typed Support registers at the exact boundary and preserves fallback paths', async ({
  page,
  context,
}) => {
  const startupSupportRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/assets/js/support.js')) {
      startupSupportRequests.push(request.url());
    }
  });
  await openPrimary(page);
  const startupRequests = startupSupportRequests.slice();

  const contract = await page.evaluate((names) => {
    const root = window as typeof window & Record<string, any>;
    const support = root.MatchaLunaApp.domains.support as Record<string, unknown>;
    const originals = Object.fromEntries(names.map((name) => [name, support[name]]));
    const roundTrips = names.map((name) => {
      const fromNamespace = () => `${name}-namespace`;
      support[name] = fromNamespace;
      const namespaceReachedRoot = root[name] === fromNamespace;
      const fromRoot = () => `${name}-root`;
      root[name] = fromRoot;
      const rootReachedNamespace = support[name] === fromRoot;
      root[name] = originals[name];
      return { namespaceReachedRoot, rootReachedNamespace };
    });
    return {
      order: Object.keys(support),
      domainOrder: Object.keys(root.MatchaLunaApp.domains),
      contractVersion: root.MatchaLunaApp.contractVersion,
      contractLength: root.MatchaLunaApp.contractNames.length,
      protectedSupportNames: names.filter((name) =>
        root.MatchaLunaApp.contractNames.includes(name),
      ),
      namespaceDescriptors: names.map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(support, name)!;
        return {
          configurable: descriptor.configurable,
          enumerable: descriptor.enumerable,
          writable: descriptor.writable,
          hasGetter: typeof descriptor.get === 'function',
          hasSetter: typeof descriptor.set === 'function',
        };
      }),
      rootDescriptors: names.map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(root, name)!;
        return {
          configurable: descriptor.configurable,
          enumerable: descriptor.enumerable,
          hasGetter: typeof descriptor.get === 'function',
          hasSetter: typeof descriptor.set === 'function',
        };
      }),
      rootMatches: names.map((name) => root[name] === support[name]),
      roundTrips,
      activeRuntime: Array.from(
        document.querySelectorAll('script[data-matcha-luna-runtime]'),
        (script) => (script as HTMLScriptElement).dataset.matchaLunaRuntime,
      ),
    };
  }, supportNames);

  const fallback = await page.evaluate(async () => {
    const response = await fetch('assets/js/support.js?phase4c-fallback=1', {
      cache: 'no-store',
    });
    return { status: response.status, text: await response.text() };
  });
  const classicSource = readFileSync(
    resolve(process.cwd(), 'assets/js/support.js'),
    'utf8',
  );

  const classicPage = await context.newPage();
  await openClassic(classicPage);
  const classicPath = await classicPage.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    return {
      moduleScripts: document.querySelectorAll('script[type="module"]').length,
      scriptOrder: Array.from(document.scripts)
        .map((script) => script.src)
        .filter((source) => source.includes('/assets/js/'))
        .map((source) => source.split('/').at(-1)),
      hasSupportDomain: Boolean(root.MatchaLunaApp.domains.support),
    };
  });
  await classicPage.close();

  expect(startupRequests).toEqual([]);
  expect(contract.order).toEqual(supportNames);
  expect(contract.domainOrder.indexOf('support')).toBeGreaterThan(
    contract.domainOrder.indexOf('stocks'),
  );
  expect(contract.domainOrder.indexOf('support')).toBeLessThan(
    contract.domainOrder.indexOf('events'),
  );
  expect(contract.contractVersion).toBe(1);
  expect(contract.contractLength).toBe(175);
  expect(contract.protectedSupportNames).toEqual([]);
  expect(contract.namespaceDescriptors).toEqual(
    supportNames.map(() => ({
      configurable: true,
      enumerable: true,
      writable: true,
      hasGetter: false,
      hasSetter: false,
    })),
  );
  expect(contract.rootDescriptors).toEqual(
    supportNames.map(() => ({
      configurable: true,
      enumerable: true,
      hasGetter: true,
      hasSetter: true,
    })),
  );
  expect(contract.rootMatches).toEqual([true, true, true]);
  expect(contract.roundTrips).toEqual(
    supportNames.map(() => ({
      namespaceReachedRoot: true,
      rootReachedNamespace: true,
    })),
  );
  expect(contract.activeRuntime).toEqual(activeRuntimeFiles);
  expect(fallback.status).toBe(200);
  expect(fallback.text.replace(/\r\n/g, '\n')).toBe(
    classicSource.replace(/\r\n/g, '\n'),
  );
  expect(classicPath).toEqual({
    moduleScripts: 0,
    scriptOrder: transitionRuntimeFiles,
    hasSupportDomain: false,
  });
});

test('typed Support export matches the retained classic trace', async ({
  page,
  context,
}) => {
  await openPrimary(page);
  const typed = await collectExportFingerprint(page, true);
  const classicPage = await context.newPage();
  await openClassic(classicPage);
  const classic = await collectExportFingerprint(classicPage, false);
  await classicPage.close();

  expect(typed).toEqual(classic);
  expect(typed).toEqual({
    returnedUndefined: true,
    blobText: JSON.stringify(
      {
        ingredients: [{ id: 'ingredient-1', name: 'Matcha' }],
        packaging: [],
        note: 'Phase 4C',
      },
      null,
      2,
    ),
    blobType: 'application/json',
    clickedDownload: 'phase-4c-live-backup.json',
    clickedHref: 'blob:phase-4c-export',
    trace: [
      { action: 'blob', type: 'application/json' },
      { action: 'document', tagName: 'a' },
      { action: 'create', type: 'application/json' },
      {
        action: 'click',
        download: 'phase-4c-live-backup.json',
        href: 'blob:phase-4c-export',
        attached: false,
      },
      { action: 'replacement-revoke', url: 'blob:phase-4c-export' },
    ],
    persistenceCalls: 0,
    stateUnchanged: true,
  });
});

test('typed Support import matches classic success and failure boundaries', async ({
  page,
  context,
}) => {
  await openPrimary(page);
  const typed = await collectImportFingerprint(page, true);
  const classicPage = await context.newPage();
  await openClassic(classicPage);
  const classic = await collectImportFingerprint(classicPage, false);
  await classicPage.close();

  expect(typed).toEqual(classic);
  expect(typed.wrongTargetUndefined).toBe(true);
  expect(typed.noFileUndefined).toBe(true);
  expect(typed.successUndefined).toBe(true);
  expect(typed.noOpReaderCount).toBe(0);
  expect(typed.reads).toEqual([
    'first-file',
    'blocked-file',
    'invalid-shape',
    'malformed-json',
    'success-alert-throw',
    'throwing-replacement',
    'sync-throw',
  ]);
  expect(typed.initialReplacementCalls).toBe(0);
  expect(typed.replacements).toEqual([
    {
      source: 'late',
      data: {
        ingredients: [{ id: 'imported-ingredient' }],
        recipes: [],
      },
      activity: 'Imported a backup file',
      sameAsParsed: true,
    },
    {
      source: 'blocked',
      data: { ingredients: [] },
      activity: 'Imported a backup file',
      sameAsParsed: true,
    },
  ]);
  expect(typed.successAlerts).toEqual(['Backup imported successfully.']);
  expect(typed.blockedAlerts).toEqual([]);
  expect(typed.invalidAlerts).toEqual([
    'Could not read that file: not a Callback Brand backup',
  ]);
  expect(typed.malformedAlerts).toHaveLength(1);
  expect(typed.malformedAlerts[0]).toMatch(/^Could not read that file: /);
  expect(typed.successAlertThrowAlerts).toEqual([
    'Could not read that file: success alert exploded',
  ]);
  expect(typed.throwingAlerts).toEqual([
    'Could not read that file: replacement exploded',
  ]);
  expect(typed.inputValues).toEqual({
    success: '',
    blocked: '',
    invalid: '',
    malformed: '',
    successAlertThrow: '',
    throwing: '',
    synchronous: 'keep-after-sync-error',
  });
  expect(typed.successReaderHandlers).toEqual({
    hasLoad: true,
    hasError: false,
    hasAbort: false,
  });
  expect(typed.synchronousError).toBe('read failed synchronously');
});

test('typed Support example graph and Events guards match classic behavior', async ({
  page,
  context,
}) => {
  await openPrimary(page);
  const typed = await collectExampleFingerprint(page, true);
  const classicPage = await context.newPage();
  await openClassic(classicPage);
  const classic = await collectExampleFingerprint(classicPage, false);
  await classicPage.close();

  expect(typed).toEqual(classic);
  expect(typed.realPrice).toBe(55);
  expect(typed.realStateIdentity).toBe(true);
  expect(typed.uidCountAfterFirst).toBe(17);
  expect(typed.firstStateIdentity).toBe(true);
  expect(typed.firstShape).toEqual({
    topKeys: [
      'schemaVersion',
      'ingredientCategories',
      'ingredients',
      'mixtureDrafts',
      'packaging',
      'recipes',
      'products',
    ],
    categoryKeys: ['id', 'name'],
    ingredientKeys: ['id', 'kind', 'categoryId', 'name', 'qty', 'unit', 'price'],
    packagingKeys: ['id', 'name', 'qty', 'price'],
    recipeKeys: ['id', 'name', 'yield', 'lines'],
    recipeLineKeys: ['id', 'ingredientId', 'qty', 'unit'],
    productKeys: ['id', 'name', 'recipeId', 'targetMargin', 'price', 'packLines'],
    packagingLineKeys: ['id', 'packagingId', 'qty'],
    categoryId: 'id-1',
    ingredientIds: ['id-2', 'id-3', 'id-4', 'id-5'],
    ingredientCategoryIds: ['id-1', 'id-1', 'id-1', 'id-1'],
    packagingIds: ['id-6', 'id-7', 'id-8'],
    recipeId: 'id-9',
    recipeLineIds: ['id-10', 'id-11', 'id-12', 'id-13'],
    recipeIngredientIds: ['id-2', 'id-3', 'id-4', 'id-5'],
    productId: 'id-14',
    productRecipeId: 'id-9',
    packagingLineIds: ['id-15', 'id-16', 'id-17'],
    productPackagingIds: ['id-6', 'id-7', 'id-8'],
    names: {
      category: 'Baking ingredients',
      ingredients: ['Flour', 'Butter', 'Sugar', 'Chocolate chips'],
      packaging: ['Container', 'Sticker', 'Spoon'],
      recipe: 'Chocolate Cookie',
      product: 'Chocolate Cookie',
    },
    counts: {
      ingredients: 4,
      packaging: 3,
      recipeLines: 4,
      packagingLines: 3,
      mixtureDrafts: 0,
    },
    price: 55,
    raw: {
      schemaVersion: 3,
      ingredients: [
        {
          id: 'id-2',
          kind: 'purchased',
          categoryId: 'id-1',
          name: 'Flour',
          qty: 1000,
          unit: 'g',
          price: 80,
        },
        {
          id: 'id-3',
          kind: 'purchased',
          categoryId: 'id-1',
          name: 'Butter',
          qty: 500,
          unit: 'g',
          price: 250,
        },
        {
          id: 'id-4',
          kind: 'purchased',
          categoryId: 'id-1',
          name: 'Sugar',
          qty: 1000,
          unit: 'g',
          price: 60,
        },
        {
          id: 'id-5',
          kind: 'purchased',
          categoryId: 'id-1',
          name: 'Chocolate chips',
          qty: 250,
          unit: 'g',
          price: 120,
        },
      ],
      packaging: [
        { id: 'id-6', name: 'Container', qty: 50, price: 250 },
        { id: 'id-7', name: 'Sticker', qty: 100, price: 200 },
        { id: 'id-8', name: 'Spoon', qty: 100, price: 100 },
      ],
      recipe: {
        id: 'id-9',
        name: 'Chocolate Cookie',
        yield: 10,
        lines: [
          { id: 'id-10', ingredientId: 'id-2', qty: 300, unit: 'g' },
          { id: 'id-11', ingredientId: 'id-3', qty: 100, unit: 'g' },
          { id: 'id-12', ingredientId: 'id-4', qty: 150, unit: 'g' },
          { id: 'id-13', ingredientId: 'id-5', qty: 100, unit: 'g' },
        ],
      },
      product: {
        id: 'id-14',
        name: 'Chocolate Cookie',
        recipeId: 'id-9',
        targetMargin: 60,
        price: 55,
        packLines: [
          { id: 'id-15', packagingId: 'id-6', qty: 1 },
          { id: 'id-16', packagingId: 'id-7', qty: 1 },
          { id: 'id-17', packagingId: 'id-8', qty: 1 },
        ],
      },
    },
  });
  expect(typed.firstTrace.slice(0, 17)).toEqual(
    Array.from({ length: 17 }, (_, index) => ({
      action: 'uid',
      value: `id-${index + 1}`,
    })),
  );
  expect(typed.firstTrace.slice(17)).toEqual([
    { action: 'productCost', productId: 'id-14', stateAlreadyAssigned: true },
    { action: 'suggestedPrice', cost: 31, margin: 60 },
    { action: 'isFinite', value: 51 },
    { action: 'ceilTo', value: 51, step: 5 },
  ]);
  expect(typed.isolation).toEqual({
    state: true,
    categories: true,
    mixtureDrafts: true,
    ingredients: true,
    packaging: true,
    recipes: true,
    recipeLines: true,
    products: true,
    packagingLines: true,
    categoryObjects: true,
    ingredientObjects: true,
    packagingObjects: true,
    recipeObjects: true,
    recipeLineObjects: true,
    productObjects: true,
    packagingLineObjects: true,
  });
  expect(typed.nonFinitePrice).toBe('');
  expect(typed.nonFiniteCeilCalls).toBe(0);
  expect(typed.signedInGuard).toEqual([
    'consume:false',
    'alert:Example data is disabled in the shared cloud workspace because replacing ingredient IDs would detach their stock history. Use a separate offline copy for examples.',
  ]);
  expect(typed.offlineCancelGuard).toEqual([
    'consume:false',
    'confirm:Load example data? This replaces what you have now.',
  ]);
  expect(typed.offlineConfirmGuard).toEqual([
    'consume:false',
    'confirm:Load example data? This replaces what you have now.',
    'example',
    'replace:guard-example:Loaded example data',
  ]);
});
