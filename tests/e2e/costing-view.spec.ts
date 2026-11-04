import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const costingViewNames = [
  'unitOptions',
  'optionList',
  'escapeHtml',
  'categoryOptions',
  'ingredientOptions',
  'selectedRealCategory',
  'ingredientMatchesView',
  'renderCategoryBar',
  'renderIngredients',
  'renderPackaging',
  'renderRecipes',
  'recipeBreakdownHtml',
  'renderProducts',
] as const;

const activeRuntimeFiles = [
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

async function openClassic(context: BrowserContext) {
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
  const page = await context.newPage();
  await stubSupabase(page);
  await page.route(
    '**/index.html?test=1&costing-view-transition=1',
    async (route) => {
      await route.fulfill({ contentType: 'text/html', body: transitionHtml });
    },
  );
  await page.goto('index.html?test=1&costing-view-transition=1', {
    waitUntil: 'load',
  });
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
  return page;
}

function collectHelperFingerprint() {
  const app = window as unknown as Record<string, any>;
  const originals = {
    state: app.state,
    ingredientUi: app.ingredientUi,
    String: app.String,
    getById: app.getById,
    isMixture: app.isMixture,
    escapeHtml: app.escapeHtml,
    unitOptions: app.unitOptions,
  };
  const fixture = {
    ingredientCategories: [
      { id: 'main', name: 'Main & "Milk"' },
      { id: 7, name: '' },
    ],
    ingredients: [
      {
        id: 'milk',
        name: 'Milk & cream',
        kind: 'purchased',
        categoryId: 'main',
      },
      {
        id: 'salt',
        name: 'Sea Salt',
        kind: 'purchased',
        categoryId: '',
      },
      {
        id: 'whip',
        name: 'Cloud Whip',
        kind: 'mixture',
        categoryId: 7,
        components: [{ ingredientId: 'salt' }],
      },
    ],
  };

  try {
    app.state = fixture;
    app.ingredientUi = { category: 'all', search: '' };
    const primitiveOptions = app.optionList(
      [1, '2', null],
      '1',
      false,
    );
    const objectOptions = app.optionList(
      [
        { id: 'a&', name: '' },
        { id: 2, name: '<Two>' },
      ],
      '2',
      true,
    );
    const escaped = [
      app.escapeHtml(null),
      app.escapeHtml(undefined),
      app.escapeHtml('&<>"\''),
      app.escapeHtml(0),
      app.escapeHtml(false),
    ];
    const categoryStrict = [
      app.categoryOptions('main'),
      app.categoryOptions('7'),
      app.categoryOptions(7),
    ];
    const grouped = [
      app.ingredientOptions('whip'),
      app.ingredientOptions('milk', []),
      app.ingredientOptions('milk', null),
    ];
    app.ingredientUi.category = 'main';
    const selectedCategory = app.selectedRealCategory();
    const matches: Record<string, boolean[]> = {};
    const runMatches = (category: unknown, search: string) => {
      app.ingredientUi = { category, search };
      return fixture.ingredients.map((ingredient) =>
        app.ingredientMatchesView(ingredient),
      );
    };
    matches.all = runMatches('all', '');
    matches.category = runMatches('main', '');
    matches.uncategorized = runMatches('uncategorized', '');
    matches.categoryName = runMatches('all', 'milk');
    matches.componentName = runMatches('all', 'sea salt');
    matches.trimmedCase = runMatches('all', '  CLOUD  ');

    const trace: string[] = [];
    const nativeString = originals.String;
    app.String = (value: unknown) => {
      trace.push(`String:${nativeString(value)}`);
      return nativeString(value);
    };
    app.escapeHtml = (value: unknown) => {
      trace.push(`escape:${nativeString(value)}`);
      return originals.escapeHtml(value);
    };
    const lookupOption = app.optionList(
      [{ id: 'live', name: 'Live' }],
      'live',
      true,
    );
    app.escapeHtml = originals.escapeHtml;
    app.String = originals.String;

    const callbackArgCounts: number[] = [];
    app.isMixture = (...args: unknown[]) => {
      callbackArgCounts.push(args.length);
      return originals.isMixture(...args);
    };
    const callbackGrouping = app.ingredientOptions('', fixture.ingredients);
    app.isMixture = originals.isMixture;

    const lookupTrace: string[] = [];
    app.getById = (list: unknown, id: unknown) => {
      lookupTrace.push(nativeString(id));
      return originals.getById(list, id);
    };
    app.ingredientUi = { category: 'main', search: 'salt' };
    const liveSelected = app.selectedRealCategory()?.id ?? null;
    const liveMatch = app.ingredientMatchesView(fixture.ingredients[1]);
    app.getById = originals.getById;

    app.unitOptions = ['ml', 'piece', 'oz'];
    const replacementUnits = app.unitOptions.slice();

    return {
      primitiveOptions,
      objectOptions,
      escaped,
      categoryStrict,
      grouped,
      selectedCategory: selectedCategory
        ? { id: selectedCategory.id, name: selectedCategory.name }
        : null,
      matches,
      lookupOption,
      trace,
      callbackArgCounts,
      callbackGrouping,
      lookupTrace,
      liveSelected,
      liveMatch,
      replacementUnits,
    };
  } finally {
    app.state = originals.state;
    app.ingredientUi = originals.ingredientUi;
    app.String = originals.String;
    app.getById = originals.getById;
    app.isMixture = originals.isMixture;
    app.escapeHtml = originals.escapeHtml;
    app.unitOptions = originals.unitOptions;
  }
}

function collectDomFingerprint() {
  const app = window as unknown as Record<string, any>;
  const originals = {
    state: app.state,
    ingredientUi: app.ingredientUi,
    posPublicationHtml: app.posPublicationHtml,
  };
  const richState = {
    schemaVersion: 3,
    ingredientCategories: [
      { id: 'main', name: 'Main & "Milk"' },
      { id: 'prepared', name: 'Prepared' },
    ],
    ingredients: [
      {
        id: 'milk',
        name: 'Milk & cream',
        kind: 'purchased',
        categoryId: 'main',
        purchaseQty: 0,
        amountPerItem: 1000,
        qty: 999,
        unit: 'ml',
        price: 120,
      },
      {
        id: 'salt',
        name: 'Sea <Salt>',
        kind: 'purchased',
        categoryId: '',
        purchaseQty: 1,
        amountPerItem: 100,
        unit: 'g',
        price: 100,
      },
      {
        id: 'whip',
        name: 'Cloud "Whip"',
        kind: 'mixture',
        categoryId: 'prepared',
        batchYield: 100,
        unit: 'ml',
        components: [
          { ingredientId: 'milk', qty: 20, unit: 'ml' },
          { ingredientId: 'salt', qty: 2, unit: 'g' },
        ],
      },
      {
        id: 'broken',
        name: '',
        kind: 'mixture',
        categoryId: 'prepared',
        batchYield: 0,
        unit: 'ml',
        components: [{ ingredientId: 'missing', qty: 2, unit: 'ml' }],
      },
    ],
    mixtureDrafts: [],
    packaging: [
      { id: 'cup', name: 'Cup & lid', qty: 50, price: 100 },
      { id: 'invalid-pack', name: 'Invalid pack', qty: 0, price: 10 },
    ],
    recipes: [
      {
        id: 'latte',
        name: 'Matcha <Latte>',
        yield: 2,
        lines: [
          {
            id: 'milk-line',
            ingredientId: 'milk',
            qty: 120,
            unit: 'ml',
          },
          {
            id: 'whip-line',
            ingredientId: 'whip',
            qty: 10,
            unit: 'ml',
          },
        ],
      },
      {
        id: 'mystery',
        name: 'Mystery',
        yield: 0,
        lines: [
          {
            id: 'missing-line',
            ingredientId: 'missing',
            qty: '',
            unit: 'g',
          },
        ],
      },
      { id: 'empty-recipe', name: 'Empty', yield: 1, lines: [] },
    ],
    products: [
      {
        id: 'latte-product',
        name: 'Matcha Latte 12oz',
        recipeId: 'latte',
        packLines: [
          { id: 'cup-line', packagingId: 'cup', qty: 1 },
        ],
        targetMargin: 60,
        price: 170,
      },
      {
        id: 'missing-product',
        name: '',
        recipeId: 'missing-recipe',
        packLines: [
          { id: 'missing-pack-line', packagingId: 'missing-pack', qty: 1 },
        ],
        targetMargin: 53,
        price: 50,
      },
      {
        id: 'loss-product',
        name: 'Loss',
        recipeId: 'latte',
        packLines: [],
        targetMargin: '',
        price: 1,
      },
    ],
  };
  const emptyState = {
    schemaVersion: 3,
    ingredientCategories: [],
    ingredients: [],
    mixtureDrafts: [],
    packaging: [],
    recipes: [],
    products: [],
  };

  const normalizeReturn = (value: unknown) =>
    value === undefined ? 'undefined' : value;
  const html = (id: string) => document.getElementById(id)?.innerHTML ?? null;
  const text = (id: string) => document.getElementById(id)?.textContent ?? null;
  const renderSnapshot = (state: Record<string, any>, ingredientUi: Record<string, any>) => {
    app.state = structuredClone(state);
    app.ingredientUi = { ...ingredientUi };
    const stateBefore = JSON.stringify(app.state);
    const storageBefore = localStorage.getItem(app.KEY);
    const returns = [
      app.renderIngredients(),
      app.renderPackaging(),
      app.renderRecipes(),
      app.renderProducts(),
    ].map(normalizeReturn);
    return {
      returns,
      stateBefore,
      stateAfter: JSON.stringify(app.state),
      storageUnchanged: storageBefore === localStorage.getItem(app.KEY),
      category: app.ingredientUi.category,
      categoryBar: html('categoryBar'),
      searchValue: (document.getElementById('ingredientSearch') as HTMLInputElement | null)?.value,
      searchStatus: text('ingredientSearchStatus'),
      ingredients: html('ingTable'),
      packaging: html('pkgTable'),
      recipes: html('recipeList'),
      breakdown: app.recipeBreakdownHtml(app.state.recipes[0]),
      missingBreakdown: app.recipeBreakdownHtml(null),
      products: html('productList'),
    };
  };
  const removeTemporarily = <T>(id: string, callback: () => T): T => {
    const node = document.getElementById(id);
    if (!node || !node.parentNode) throw new Error(`Missing fixture node ${id}`);
    const parent = node.parentNode;
    const next = node.nextSibling;
    node.remove();
    try {
      return callback();
    } finally {
      parent.insertBefore(node, next);
    }
  };
  const thrown = (callback: () => unknown) => {
    try {
      callback();
      return null;
    } catch (error) {
      return {
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const rendererDependencyTrace = () => {
    const trace: string[] = [];
    const counts: Record<string, number> = {};
    const record = (kind: string, name: string, detail = '') => {
      trace.push(`${kind}:${name}${detail}`);
      counts[name] = (counts[name] || 0) + 1;
    };
    const dependencyNames = [
      'getById',
      'num',
      'peso',
      'pct',
      'ceilTo',
      'isFinite',
      'optionList',
      'escapeHtml',
      'categoryOptions',
      'ingredientOptions',
      'selectedRealCategory',
      'ingredientMatchesView',
      'renderCategoryBar',
      'isMixture',
      'ingredientBaseUnit',
      'ingredientCostInfo',
      'ingCostPerBase',
      'pkgCostPerPiece',
      'lineCost',
      'recipeTotal',
      'recipePerServing',
      'productCost',
      'suggestedPrice',
      'packagingLineCost',
      'recipeBreakdownHtml',
      'posPublicationHtml',
    ];
    const originalDependencies = Object.fromEntries(
      dependencyNames.map((name) => [name, app[name]]),
    );
    const originalState = app.state;
    const originalIngredientUi = app.ingredientUi;
    const originalUnitOptions = app.unitOptions;
    const originalUnitType = app.UNIT_TYPE;
    const originalTypeUnits = app.TYPE_UNITS;
    const nativeDocument = document;
    const documentGetByIdDescriptor = Object.getOwnPropertyDescriptor(
      nativeDocument,
      'getElementById',
    );
    const nativeGetElementById = nativeDocument.getElementById;
    let replacementUsed = false;
    const replacementUnitOptions = new Proxy(['trace-unit'], {
      get(target, property, receiver) {
        record('get', 'unitOptions', `.${String(property)}`);
        return Reflect.get(target, property, receiver);
      },
    });

    try {
      dependencyNames.forEach((name) => {
        const original = originalDependencies[name];
        app[name] = function tracedDependency(
          this: unknown,
          ...args: unknown[]
        ) {
          if (name === 'optionList' && args[0] === replacementUnitOptions) {
            replacementUsed = true;
            record('arg', 'unitOptions', '.optionList');
          }
          record('call', name);
          return Reflect.apply(original, this, args);
        };
      });
      app.unitOptions = replacementUnitOptions;
      app.UNIT_TYPE = new Proxy(originalUnitType, {
        get(target, property, receiver) {
          record('get', 'UNIT_TYPE', `.${String(property)}`);
          return Reflect.get(target, property, receiver);
        },
      });
      app.TYPE_UNITS = new Proxy(originalTypeUnits, {
        get(target, property, receiver) {
          record('get', 'TYPE_UNITS', `.${String(property)}`);
          return Reflect.get(target, property, receiver);
        },
      });
      Object.defineProperty(nativeDocument, 'getElementById', {
        configurable: true,
        value(id: string) {
          record('call', 'document', `.getElementById(${id})`);
          return Reflect.apply(nativeGetElementById, nativeDocument, [id]);
        },
      });

      const tracedStateTarget = structuredClone(richState);
      tracedStateTarget.ingredients[0].purchaseQty = 1;
      app.state = new Proxy(tracedStateTarget, {
        get(target, property, receiver) {
          record('get', 'state', `.${String(property)}`);
          return Reflect.get(target, property, receiver);
        },
        set(target, property, value, receiver) {
          record('set', 'state', `.${String(property)}`);
          return Reflect.set(target, property, value, receiver);
        },
      });
      app.ingredientUi = new Proxy(
        { category: 'missing-category', search: '' },
        {
          get(target, property, receiver) {
            record('get', 'ingredientUi', `.${String(property)}`);
            return Reflect.get(target, property, receiver);
          },
          set(target, property, value, receiver) {
            record('set', 'ingredientUi', `.${String(property)}`);
            return Reflect.set(target, property, value, receiver);
          },
        },
      );
      trace.push('phase:renderIngredients');
      app.renderIngredients();
      const ingredientHtml = html('ingTable');
      trace.push('phase:renderPackaging');
      app.renderPackaging();
      trace.push('phase:renderRecipes');
      app.renderRecipes();
      trace.push('phase:recipeBreakdownHtml');
      app.recipeBreakdownHtml(app.state.recipes[0]);
      trace.push('phase:renderProducts');
      app.renderProducts();
      const finalCategory = app.ingredientUi.category;

      return {
        trace,
        counts,
        finalCategory,
        replacementUsed,
        replacementRendered:
          ingredientHtml?.includes('<option value="trace-unit">') ?? false,
      };
    } finally {
      dependencyNames.forEach((name) => {
        app[name] = originalDependencies[name];
      });
      app.unitOptions = originalUnitOptions;
      app.UNIT_TYPE = originalUnitType;
      app.TYPE_UNITS = originalTypeUnits;
      app.state = originalState;
      app.ingredientUi = originalIngredientUi;
      if (documentGetByIdDescriptor) {
        Object.defineProperty(
          nativeDocument,
          'getElementById',
          documentGetByIdDescriptor,
        );
      } else {
        delete (nativeDocument as unknown as Record<string, unknown>)
          .getElementById;
      }
    }
  };

  try {
    app.posPublicationHtml = (product: Record<string, unknown>) =>
      `<aside data-publication="${app.escapeHtml(product.id)}">Published &amp; safe</aside>`;
    const empty = renderSnapshot(emptyState, { category: 'all', search: '' });
    const rich = renderSnapshot(richState, { category: 'all', search: '' });
    const filtered = renderSnapshot(richState, {
      category: 'prepared',
      search: 'sea salt',
    });

    app.state = structuredClone(richState);
    app.ingredientUi = { category: 'missing-category', search: '' };
    const invalidWithoutBar = removeTemporarily('categoryBar', () => ({
      returnValue: normalizeReturn(app.renderCategoryBar()),
      category: app.ingredientUi.category,
    }));

    app.state = structuredClone(richState);
    app.ingredientUi = { category: 'all', search: 'cloud' };
    const optionalNodes = removeTemporarily('ingredientSearch', () =>
      removeTemporarily('ingredientSearchStatus', () => ({
        returnValue: normalizeReturn(app.renderIngredients()),
        ingredients: html('ingTable'),
      })),
    );

    const dependencyTrace = rendererDependencyTrace();

    app.state = structuredClone(richState);
    app.ingredientUi = { category: 'all', search: '' };
    const missingRequired = {
      ingredients: removeTemporarily('ingTable', () =>
        thrown(() => app.renderIngredients()),
      ),
      packaging: removeTemporarily('pkgTable', () =>
        thrown(() => app.renderPackaging()),
      ),
      recipes: removeTemporarily('recipeList', () =>
        thrown(() => app.renderRecipes()),
      ),
      products: removeTemporarily('productList', () =>
        thrown(() => app.renderProducts()),
      ),
    };

    return {
      empty,
      rich,
      filtered,
      invalidWithoutBar,
      optionalNodes,
      dependencyTrace,
      missingRequired,
    };
  } finally {
    app.state = originals.state;
    app.ingredientUi = originals.ingredientUi;
    app.posPublicationHtml = originals.posPublicationHtml;
  }
}

test('typed Costing view exposes the exact API and retained fallback', async ({
  page,
}) => {
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

  const contract = await page.evaluate((names) => {
    const root = window as typeof window & Record<string, any>;
    const facade = root.MatchaLunaApp;
    const costing = facade.domains.costing as Record<string, any>;
    const originals = Object.fromEntries(names.map((name) => [name, costing[name]]));
    const roundTrips = names.map((name, index) => {
      const fromNamespace = name === 'unitOptions'
        ? [`domain-${index}`]
        : function domainReplacement() { return index; };
      costing[name] = fromNamespace;
      const namespaceReachedRoot = root[name] === fromNamespace;
      const fromRoot = name === 'unitOptions'
        ? [`root-${index}`]
        : function rootReplacement() { return index + 100; };
      root[name] = fromRoot;
      const rootReachedNamespace = costing[name] === fromRoot;
      costing[name] = originals[name];
      return { namespaceReachedRoot, rootReachedNamespace };
    });
    return {
      domainOrder: Object.keys(facade.domains),
      costingOrder: Object.keys(costing),
      costingLength: Object.keys(costing).length,
      contractLength: facade.contractNames.length,
      protectedViewNames: names.filter((name) =>
        facade.contractNames.includes(name),
      ),
      namespaceDescriptors: names.map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(costing, name)!;
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
      rootMatches: names.map((name) => root[name] === costing[name]),
      roundTrips,
      units: costing.unitOptions.slice(),
      activeRuntime: Array.from(
        document.querySelectorAll<HTMLScriptElement>(
          'script[data-matcha-luna-runtime]',
        ),
        (script) => script.dataset.matchaLunaRuntime,
      ),
    };
  }, [...costingViewNames]);

  const fallback = await page.request.get(
    'http://127.0.0.1:4173/Scoopies/assets/js/render-costing.js',
  );
  const fallbackText = await fallback.text();
  const classicSource = readFileSync(
    resolve(process.cwd(), 'assets/js/render-costing.js'),
    'utf8',
  );
  const canonicalFallback = fallbackText.replace(/\r\n?/g, '\n');
  const canonicalClassicSource = classicSource.replace(/\r\n?/g, '\n');
  const fallbackSha256 = createHash('sha256')
    .update(canonicalFallback, 'utf8')
    .digest('hex')
    .toUpperCase();
  const helperModuleSource = readFileSync(
    resolve(process.cwd(), 'src/costing/view-helpers.ts'),
    'utf8',
  );
  const rendererModuleSource = readFileSync(
    resolve(process.cwd(), 'src/costing/view-renderers.ts'),
    'utf8',
  );

  expect(contract.domainOrder).toEqual([
    'core',
    'runtime',
    'state',
    'costing',
    'catalog',
    'stocks',
    'workspace',
    'pos',
    'publication',
    'modals',
    'support',
    'events',
    'bootstrap',
    'legacy',
  ]);
  expect(contract.costingLength).toBe(37);
  expect(contract.costingOrder.slice(-costingViewNames.length)).toEqual(
    costingViewNames,
  );
  expect(contract.contractLength).toBe(175);
  expect(contract.protectedViewNames).toEqual([
    'renderIngredients',
    'renderProducts',
  ]);
  expect(contract.namespaceDescriptors).toEqual(
    costingViewNames.map(() => ({
      configurable: true,
      enumerable: true,
      writable: true,
      hasGetter: false,
      hasSetter: false,
    })),
  );
  expect(contract.rootDescriptors).toEqual(
    costingViewNames.map(() => ({
      configurable: true,
      enumerable: true,
      hasGetter: true,
      hasSetter: true,
    })),
  );
  expect(contract.rootMatches).toEqual(costingViewNames.map(() => true));
  expect(contract.roundTrips).toEqual(
    costingViewNames.map(() => ({
      namespaceReachedRoot: true,
      rootReachedNamespace: true,
    })),
  );
  expect(contract.units).toEqual(['g', 'kg', 'ml', 'l', 'piece']);
  expect(contract.activeRuntime).toEqual(activeRuntimeFiles);
  expect(fallback.status()).toBe(200);
  expect(canonicalFallback).toBe(canonicalClassicSource);
  expect(fallbackSha256).toBe(
    'FA9B4020D890BCD0AE5D9C4249213A182C2B3563D23C40BCD0B33440DBE2E04E',
  );
  expect(helperModuleSource).toMatch(
    /function runtimeString\(\): StringConstructor \{\s*return readRuntimeBinding\(\s*'String'/,
  );
  expect(rendererModuleSource).toMatch(
    /function runtimeDocument\(\): Document \{\s*return readRuntimeBinding\('document'/,
  );
  expect(rendererModuleSource).toMatch(
    /function runtimeIsFinite\(\): IsFinite \{\s*return readRuntimeBinding\(\s*'isFinite'/,
  );
  expect(`${helperModuleSource}\n${rendererModuleSource}`).not.toMatch(
    /\b(?:const|let|var)\s+\w+\s*=\s*(?:globalThis\.)?(?:String|document|isFinite)\s*;/,
  );
});

test('typed Costing view helpers match the retained classic asset and live bindings', async ({
  page,
  context,
}) => {
  await openPrimary(page);
  const typedFingerprint = await page.evaluate(collectHelperFingerprint);
  const classicPage = await openClassic(context);
  const classicFingerprint = await classicPage.evaluate(collectHelperFingerprint);
  const classicPath = await classicPage.evaluate(() => ({
    moduleScripts: document.querySelectorAll('script[type="module"]').length,
    scriptOrder: Array.from(
      document.querySelectorAll<HTMLScriptElement>('script[src*="/assets/js/"]'),
      (script) => new URL(script.src).pathname.split('/').pop(),
    ),
    hasTypedCostingDomain: Boolean(
      (window as typeof window & Record<string, any>).MatchaLunaApp.domains
        .costing,
    ),
  }));
  await classicPage.close();

  expect(typedFingerprint).toEqual(classicFingerprint);
  expect(classicPath).toEqual({
    moduleScripts: 0,
    scriptOrder: transitionRuntimeFiles,
    hasTypedCostingDomain: false,
  });
  expect(typedFingerprint.escaped).toEqual([
    '',
    '',
    '&amp;&lt;&gt;&quot;\'',
    '0',
    'false',
  ]);
  expect(typedFingerprint.selectedCategory).toEqual({
    id: 'main',
    name: 'Main & "Milk"',
  });
  expect(typedFingerprint.matches).toEqual({
    all: [true, true, true],
    category: [true, false, false],
    uncategorized: [false, true, false],
    categoryName: [true, false, false],
    componentName: [false, true, true],
    trimmedCase: [false, false, true],
  });
  expect(typedFingerprint.callbackArgCounts).toEqual([1, 1, 1, 3, 3, 3]);
  expect(typedFingerprint.liveSelected).toBe('main');
  expect(typedFingerprint.liveMatch).toBe(false);
  expect(typedFingerprint.replacementUnits).toEqual(['ml', 'piece', 'oz']);
});

test('typed Costing renderers preserve exact empty, rich, filtered, and failure DOM behavior', async ({
  page,
  context,
}) => {
  await openPrimary(page);
  const typedFingerprint = await page.evaluate(collectDomFingerprint);
  const classicPage = await openClassic(context);
  const classicFingerprint = await classicPage.evaluate(collectDomFingerprint);
  await classicPage.close();

  expect(typedFingerprint).toEqual(classicFingerprint);
  expect(typedFingerprint.empty.returns).toEqual([
    'undefined',
    'undefined',
    'undefined',
    'undefined',
  ]);
  expect(typedFingerprint.empty.stateAfter).toBe(
    typedFingerprint.empty.stateBefore,
  );
  expect(typedFingerprint.rich.stateAfter).toBe(
    typedFingerprint.rich.stateBefore,
  );
  expect(typedFingerprint.filtered.stateAfter).toBe(
    typedFingerprint.filtered.stateBefore,
  );
  expect(typedFingerprint.empty.storageUnchanged).toBe(true);
  expect(typedFingerprint.rich.storageUnchanged).toBe(true);
  expect(typedFingerprint.filtered.storageUnchanged).toBe(true);
  expect(typedFingerprint.invalidWithoutBar).toEqual({
    returnValue: 'undefined',
    category: 'all',
  });
  expect(typedFingerprint.empty.missingBreakdown).toBe('');
  expect(typedFingerprint.rich.ingredients).toContain(
    'data-entity="ingredient"',
  );
  expect(typedFingerprint.rich.packaging).toContain(
    'data-entity="packaging"',
  );
  expect(typedFingerprint.rich.recipes).toContain('data-entity="recipe"');
  expect(typedFingerprint.rich.products).toContain('data-entity="product"');
  expect(typedFingerprint.rich.products).toContain(
    'data-publication="latte-product"',
  );
  expect(typedFingerprint.optionalNodes.returnValue).toBe('undefined');
  expect(typedFingerprint.dependencyTrace.replacementUsed).toBe(true);
  expect(typedFingerprint.dependencyTrace.replacementRendered).toBe(true);
  expect(
    typedFingerprint.dependencyTrace.trace.filter((event: string) =>
      event.startsWith('phase:'),
    ),
  ).toEqual([
    'phase:renderIngredients',
    'phase:renderPackaging',
    'phase:renderRecipes',
    'phase:recipeBreakdownHtml',
    'phase:renderProducts',
  ]);
  const tracedDependencies = [
    'state',
    'ingredientUi',
    'document',
    'isFinite',
    'UNIT_TYPE',
    'TYPE_UNITS',
    'unitOptions',
    'num',
    'peso',
    'pct',
    'ceilTo',
    'getById',
    'optionList',
    'escapeHtml',
    'categoryOptions',
    'ingredientOptions',
    'selectedRealCategory',
    'ingredientMatchesView',
    'renderCategoryBar',
    'isMixture',
    'ingredientBaseUnit',
    'ingredientCostInfo',
    'ingCostPerBase',
    'pkgCostPerPiece',
    'lineCost',
    'recipeTotal',
    'recipePerServing',
    'productCost',
    'suggestedPrice',
    'packagingLineCost',
    'recipeBreakdownHtml',
    'posPublicationHtml',
  ];
  expect(
    tracedDependencies.filter(
      (name) => !typedFingerprint.dependencyTrace.counts[name],
    ),
  ).toEqual([]);
  expect(typedFingerprint.dependencyTrace.finalCategory).toBe('all');
  expect(
    typedFingerprint.dependencyTrace.trace.filter((event: string) =>
      /^(?:get|set):(state|ingredientUi)\./.test(event),
    ),
  ).toEqual(
    classicFingerprint.dependencyTrace.trace.filter((event: string) =>
      /^(?:get|set):(state|ingredientUi)\./.test(event),
    ),
  );
  expect(typedFingerprint.dependencyTrace.trace).toContain(
    'set:ingredientUi.category',
  );
  expect(typedFingerprint.missingRequired.ingredients?.name).toBe('TypeError');
  expect(typedFingerprint.missingRequired.packaging?.name).toBe('TypeError');
  expect(typedFingerprint.missingRequired.recipes?.name).toBe('TypeError');
  expect(typedFingerprint.missingRequired.products?.name).toBe('TypeError');
});
