import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
];

async function stubSupabase(page: Page) {
  await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/, async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: 'window.supabase={createClient:function(){throw new Error("Supabase is disabled in browser tests");}};',
    });
  });
}

async function openPrimary(page: Page) {
  await stubSupabase(page);
  await page.goto('index.html?test=1', { waitUntil: 'load' });
  await page.evaluate(() =>
    (window as typeof window & { MatchaLunaApp: { ready: Promise<void> } }).MatchaLunaApp.ready,
  );
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
}

function collectCostingFingerprint() {
  const app = window as typeof window & Record<string, any>;
  const originalState = app.state;
  const numberValue = (value: number) => {
    if (Number.isNaN(value)) return 'NaN';
    if (value === Number.POSITIVE_INFINITY) return 'Infinity';
    if (value === Number.NEGATIVE_INFINITY) return '-Infinity';
    return value;
  };
  const fixture = {
    ingredientCategories: [],
    ingredients: [
      {
        id: 'milk',
        name: 'Milk',
        kind: 'purchased',
        purchaseQty: 2,
        amountPerItem: 1,
        unit: 'l',
        price: 240,
      },
      {
        id: 'matcha',
        name: 'Matcha',
        kind: 'purchased',
        purchaseQty: 1,
        amountPerItem: 100,
        unit: 'g',
        price: 500,
      },
      {
        id: 'whip',
        name: 'Whip',
        kind: 'mixture',
        batchYield: 500,
        unit: 'ml',
        components: [{ ingredientId: 'milk', qty: 250, unit: 'ml' }],
      },
      {
        id: 'cloud',
        name: 'Cloud',
        kind: 'mixture',
        batchYield: 200,
        unit: 'ml',
        components: [
          { ingredientId: 'whip', qty: 100, unit: 'ml' },
          { ingredientId: 'milk', qty: 50, unit: 'ml' },
        ],
      },
    ],
    packaging: [
      { id: 'cup', name: 'Cup', qty: 50, price: 125 },
      { id: 'straw', name: 'Straw', qty: 100, price: 90 },
    ],
    recipes: [
      {
        id: 'latte',
        name: 'Latte',
        yield: 2,
        lines: [
          { id: 'milk-line', ingredientId: 'milk', qty: 120, unit: 'ml' },
          { id: 'matcha-line', ingredientId: 'matcha', qty: 3, unit: 'g' },
          { id: 'cloud-line', ingredientId: 'cloud', qty: 40, unit: 'ml' },
        ],
      },
    ],
    products: [
      {
        id: 'latte-product',
        name: 'Latte 12oz',
        recipeId: 'latte',
        packLines: [
          { id: 'cup-line', packagingId: 'cup', qty: 1 },
          { id: 'straw-line', packagingId: 'straw', qty: 1 },
        ],
        targetMargin: 50,
        price: 170.01,
      },
    ],
    mixtureDrafts: [
      {
        id: 'draft',
        data: {
          name: 'Draft sweetener',
          components: [{ ingredientId: 'matcha', qty: 1, unit: 'g' }],
        },
      },
    ],
  };

  app.state = fixture;
  try {
    const milk = fixture.ingredients[0];
    const matcha = fixture.ingredients[1];
    const whip = fixture.ingredients[2];
    const cloud = fixture.ingredients[3];
    const cup = fixture.packaging[0];
    const recipe = fixture.recipes[0];
    const product = fixture.products[0];
    const found: Record<string, unknown> = {};
    app.collectPublicationIngredient('cloud', found, {});
    const built = app.buildProductCostingSnapshot(product, ' 12oz ');
    const circularA = {
      id: 'a',
      name: 'A',
      kind: 'mixture',
      batchYield: 100,
      unit: 'ml',
      components: [{ ingredientId: 'b', qty: 100, unit: 'ml' }],
    };
    const circularB = {
      id: 'b',
      name: 'B',
      kind: 'mixture',
      batchYield: 100,
      unit: 'ml',
      components: [{ ingredientId: 'a', qty: 100, unit: 'ml' }],
    };
    const circularIngredients: Record<string, typeof circularA | typeof circularB> = {
      a: circularA,
      b: circularB,
    };
    const circularLookup = (id: string) => circularIngredients[id] || null;
    const circularInfo = app.ingredientCostInfo(circularA, [], circularLookup);
    const missingInfo = app.ingredientCostInfo(null);

    return {
      isMixture: [app.isMixture(cloud), app.isMixture(milk), app.isMixture(null)],
      baseUnits: [
        app.ingredientBaseUnit(milk),
        app.ingredientBaseUnit(matcha),
        app.ingredientBaseUnit({}),
      ],
      ingredientTotals: [
        numberValue(app.ingredientTotalBase(milk)),
        numberValue(app.ingredientTotalBase(whip)),
        numberValue(app.ingredientTotalBase({ qty: 330, unit: 'ml', price: 1 })),
      ],
      lookupName: app.stateIngredientLookup('milk')?.name,
      milkInfo: app.ingredientCostInfo(milk),
      missingInfo,
      circularError: circularInfo.error,
      mixtureBatchCost: numberValue(app.mixtureBatchCost(whip)),
      mixtureCostPerBase: numberValue(app.ingCostPerBase(cloud)),
      packageCostPerPiece: numberValue(app.pkgCostPerPiece(cup)),
      packagingLineCost: numberValue(
        app.packagingLineCost({ packagingId: 'cup', qty: 1 }),
      ),
      lineCosts: [
        numberValue(app.lineCost(recipe.lines[0])),
        numberValue(app.lineCost(null)),
        numberValue(app.lineCost({ ingredientId: 'missing', qty: 1, unit: 'ml' })),
      ],
      recipeTotal: numberValue(app.recipeTotal(recipe)),
      recipePerServing: numberValue(app.recipePerServing(recipe)),
      productPackagingCost: numberValue(app.productPackagingCost(product)),
      productCost: numberValue(app.productCost(product)),
      suggestedPrices: [
        numberValue(app.suggestedPrice(app.productCost(product), 50)),
        numberValue(app.suggestedPrice(10, 100)),
      ],
      ingredientUsage: {
        milk: app.ingredientUsage('milk'),
        matcha: app.ingredientUsage('matcha'),
      },
      packagingUsage: app.packagingUsage('cup'),
      recipeUsage: app.recipeUsage('latte'),
      money: [
        numberValue(app.moneyToCentavos(10.045)),
        numberValue(app.moneyToCentavos('bad')),
      ],
      snapshotNumbers: [app.snapshotNumber('1.25g'), app.snapshotNumber('bad')],
      purchasedRecord: app.publicationIngredientRecord(milk),
      mixtureRecord: app.publicationIngredientRecord(cloud),
      collectedKeys: Object.keys(found).sort(),
      built,
      validation: app.validateProductForPublish(product),
    };
  } finally {
    app.state = originalState;
  }
}

test.beforeEach(async ({ page }) => {
  await openPrimary(page);
});

test('typed Costing preserves the complete costing and publication fingerprint', async ({ page }) => {
  const result = await page.evaluate(collectCostingFingerprint);

  expect(result.isMixture).toEqual([true, false, false]);
  expect(result.baseUnits).toEqual(['ml', 'g', 'g']);
  expect(result.ingredientTotals).toEqual([2000, 500, 330]);
  expect(result.lookupName).toBe('Milk');
  expect(result.milkInfo).toEqual({ valid: true, costPerBase: 0.12, batchCost: 240, error: '' });
  expect(result.missingInfo.error).toBe('Missing ingredient');
  expect(result.circularError).toContain('Circular mixture reference');
  expect(result.mixtureBatchCost).toBeCloseTo(30, 10);
  expect(result.mixtureCostPerBase).toBeCloseTo(0.06, 10);
  expect(result.packageCostPerPiece).toBeCloseTo(2.5, 10);
  expect(result.packagingLineCost).toBeCloseTo(2.5, 10);
  expect(result.lineCosts[0]).toBeCloseTo(14.4, 10);
  expect(result.lineCosts.slice(1)).toEqual([0, 'NaN']);
  expect(result.recipeTotal).toBeCloseTo(31.8, 10);
  expect(result.recipePerServing).toBeCloseTo(15.9, 10);
  expect(result.productPackagingCost).toBeCloseTo(3.4, 10);
  expect(result.productCost).toBeCloseTo(19.3, 10);
  expect(result.suggestedPrices[0]).toBeCloseTo(38.6, 10);
  expect(result.suggestedPrices[1]).toBe('Infinity');
  expect(result.ingredientUsage.milk).toEqual([
    'recipe "Latte"',
    'mixture "Whip"',
    'mixture "Cloud"',
  ]);
  expect(result.ingredientUsage.matcha).toEqual([
    'recipe "Latte"',
    'draft "Draft sweetener"',
  ]);
  expect(result.packagingUsage).toEqual(['product "Latte 12oz"']);
  expect(result.recipeUsage).toEqual(['product "Latte 12oz"']);
  expect(result.money).toEqual([1005, 'NaN']);
  expect(result.snapshotNumbers).toEqual([1.25, null]);
  expect(result.purchasedRecord).toEqual({
    id: 'milk',
    kind: 'purchased',
    name: 'Milk',
    purchaseQty: 2,
    amountPerItem: 1,
    unit: 'l',
    price: 240,
  });
  expect(result.collectedKeys).toEqual(['cloud', 'milk', 'whip']);
  expect(result.built.sellingPriceCentavos).toBe(17001);
  expect(result.built.ingredientCostCentavos).toBe(1590);
  expect(result.built.packagingCostCentavos).toBe(340);
  expect(result.built.snapshot.size).toBe('12oz');
  expect(result.built.snapshot.ingredients.map((item: { id: string }) => item.id)).toEqual([
    'cloud',
    'matcha',
    'milk',
    'whip',
  ]);
  expect(result.validation).toEqual({ valid: true, error: '' });
});

test('typed Costing matches the retained classic costing asset', async ({ page, context }) => {
  const typedFingerprint = await page.evaluate(collectCostingFingerprint);
  const builtHtml = readFileSync(resolve(process.cwd(), 'dist/index.html'), 'utf8');
  const classicScripts = transitionRuntimeFiles
    .map((fileName) => `<script src="/Scoopies/assets/js/${fileName}"></script>`)
    .join('\n');
  const transitionHtml = builtHtml
    .replace(/\s*<script type="module"[^>]*><\/script>/, '')
    .replace('</body>', `${classicScripts}\n</body>`);
  const legacyPage = await context.newPage();
  await stubSupabase(legacyPage);
  await legacyPage.route('**/index.html?test=1&costing-transition=1', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: transitionHtml });
  });
  await legacyPage.goto('index.html?test=1&costing-transition=1', { waitUntil: 'load' });
  await expect(legacyPage.locator('#syncStatus')).toHaveText('Test mode');
  const transitionProvenance = await legacyPage.evaluate(() => {
    const appWindow = window as typeof window & Record<string, any>;
    return {
      moduleScripts: document.querySelectorAll('script[type="module"]').length,
      hasTypedCostingDomain: Boolean(appWindow.MatchaLunaApp.domains.costing),
    };
  });
  const classicFingerprint = await legacyPage.evaluate(collectCostingFingerprint);
  await legacyPage.close();

  expect(transitionProvenance).toEqual({ moduleScripts: 0, hasTypedCostingDomain: false });
  expect(typedFingerprint).toEqual(classicFingerprint);
});

test('typed Costing preserves exact validation failures', async ({ page }) => {
  const errors = await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const originalState = app.state;
    const baseState = {
      ingredients: [
        {
          id: 'milk',
          name: 'Milk',
          kind: 'purchased',
          purchaseQty: 1,
          amountPerItem: 1,
          unit: 'l',
          price: 120,
        },
      ],
      packaging: [{ id: 'cup', name: 'Cup', qty: 50, price: 100 }],
      recipes: [
        {
          id: 'latte',
          name: 'Latte',
          yield: 1,
          lines: [{ id: 'line', ingredientId: 'milk', qty: 120, unit: 'ml' }],
        },
      ],
      products: [],
      mixtureDrafts: [],
    };
    const baseProduct = {
      id: 'product',
      name: 'Latte 12oz',
      recipeId: 'latte',
      price: 170,
      packLines: [{ id: 'pack-line', packagingId: 'cup', qty: 1 }],
    };
    const run = (
      mutate: (product: Record<string, any>, state: Record<string, any>) => void,
    ) => {
      const state = structuredClone(baseState);
      const product = structuredClone(baseProduct);
      app.state = state;
      mutate(product, state);
      return app.validateProductForPublish(product).error;
    };

    try {
      app.state = structuredClone(baseState);
      return {
        missingProduct: app.validateProductForPublish(null).error,
        missingName: run((product) => { product.name = ''; }),
        longName: run((product) => { product.name = 'x'.repeat(121); }),
        invalidProductId: run((product) => { product.id = ''; }),
        blankPrice: run((product) => { product.price = ''; }),
        missingRecipe: run((product) => { product.recipeId = 'missing'; }),
        invalidRecipeId: run((product, state) => {
          product.recipeId = '';
          state.recipes[0].id = '';
        }),
        zeroYield: run((_product, state) => { state.recipes[0].yield = 0; }),
        emptyRecipe: run((_product, state) => { state.recipes[0].lines = []; }),
        missingIngredient: run((_product, state) => {
          state.recipes[0].lines[0].ingredientId = 'missing';
        }),
        zeroLineQuantity: run((_product, state) => { state.recipes[0].lines[0].qty = 0; }),
        incompatibleUnit: run((_product, state) => { state.recipes[0].lines[0].unit = 'g'; }),
        invalidIngredientPrice: run((_product, state) => { state.ingredients[0].price = ''; }),
        missingPackaging: run((_product, state) => { state.packaging = []; }),
        zeroPackagingQuantity: run((product) => { product.packLines[0].qty = 0; }),
        invalidPackagingCost: run((_product, state) => { state.packaging[0].qty = ''; }),
        excessiveSellingPrice: run((product) => { product.price = 1_000_000_000.01; }),
      };
    } finally {
      app.state = originalState;
    }
  });

  expect(errors).toEqual({
    missingProduct: 'That costing product no longer exists.',
    missingName: 'Add a product name first.',
    longName: 'Keep the product name under 120 characters.',
    invalidProductId: 'This product has an invalid source ID.',
    blankPrice: 'Enter a selling price greater than zero.',
    missingRecipe: 'Select a recipe first.',
    invalidRecipeId: 'This recipe has an invalid source ID.',
    zeroYield: 'The recipe yield must be greater than zero.',
    emptyRecipe: 'Add at least one ingredient to the recipe.',
    missingIngredient: 'A recipe ingredient is missing.',
    zeroLineQuantity: 'Every recipe ingredient needs a quantity greater than zero.',
    incompatibleUnit: 'A recipe ingredient uses an incompatible unit.',
    invalidIngredientPrice:
      'Milk: Complete the purchase amount and enter a non-negative price.',
    missingPackaging: 'A packaging item is missing.',
    zeroPackagingQuantity: 'Every packaging item needs a quantity greater than zero.',
    invalidPackagingCost: 'Cup needs a valid pack quantity and price.',
    excessiveSellingPrice: 'The selling price is outside the supported range.',
  });
});

test('typed Costing preserves live sibling, state, and Core bindings', async ({ page }) => {
  const result = await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const costing = app.MatchaLunaApp.domains.costing as Record<string, any>;
    const core = app.MatchaLunaApp.domains.core as Record<string, any>;
    const originalState = app.state;
    const originals = {
      isMixture: costing.isMixture,
      ingredientCostInfo: costing.ingredientCostInfo,
      pkgCostPerPiece: costing.pkgCostPerPiece,
      lineCost: costing.lineCost,
      recipeTotal: costing.recipeTotal,
      recipePerServing: costing.recipePerServing,
      productPackagingCost: costing.productPackagingCost,
      canonicalValue: core.canonicalValue,
      num: core.num,
    };
    const saved = {
      ingredientTotalBase: costing.ingredientTotalBase,
      mixtureBatchCost: costing.mixtureBatchCost,
      ingCostPerBase: costing.ingCostPerBase,
      packagingLineCost: costing.packagingLineCost,
      recipeTotal: costing.recipeTotal,
      recipePerServing: costing.recipePerServing,
      productCost: costing.productCost,
      suggestedPrice: costing.suggestedPrice,
      stateIngredientLookup: costing.stateIngredientLookup,
      buildProductCostingSnapshot: costing.buildProductCostingSnapshot,
    };

    try {
      app.state = {
        ingredients: [{ id: 'live', name: 'Live ingredient' }],
        packaging: [{ id: 'pack' }],
        recipes: [{ id: 'recipe', yield: 1, lines: [] }],
        products: [],
        mixtureDrafts: [],
      };
      costing.isMixture = () => true;
      const dynamicMixture = saved.ingredientTotalBase({ batchYield: 2, unit: 'kg' });

      costing.ingredientCostInfo = () => ({
        valid: true,
        batchCost: 9,
        costPerBase: 3,
        error: '',
      });
      const dynamicCostInfo = [saved.mixtureBatchCost({}), saved.ingCostPerBase({})];

      costing.pkgCostPerPiece = () => 7;
      const dynamicPackaging = saved.packagingLineCost({ packagingId: 'pack', qty: 2 });

      costing.lineCost = () => 4;
      const dynamicRecipeTotal = saved.recipeTotal({ lines: [{}, {}, {}] });

      costing.recipeTotal = () => 20;
      const dynamicPerServing = saved.recipePerServing({ yield: 4 });

      costing.recipePerServing = () => 2;
      costing.productPackagingCost = () => 8;
      const dynamicProductCost = saved.productCost({ recipeId: 'recipe' });

      core.num = () => 50;
      const dynamicCoreNumber = saved.suggestedPrice(10, 1);

      core.canonicalValue = (value: unknown) => ({ wrapped: value });
      const dynamicCanonical = saved.buildProductCostingSnapshot(
        { id: 'p', name: 'P', recipeId: '', price: 1, packLines: [] },
        '',
      ).snapshot;

      return {
        dynamicMixture,
        dynamicCostInfo,
        dynamicPackaging,
        dynamicRecipeTotal,
        dynamicPerServing,
        dynamicProductCost,
        dynamicCoreNumber,
        dynamicCanonicalWrapped: Object.prototype.hasOwnProperty.call(dynamicCanonical, 'wrapped'),
        dynamicStateLookup: saved.stateIngredientLookup('live')?.name,
      };
    } finally {
      app.state = originalState;
      costing.isMixture = originals.isMixture;
      costing.ingredientCostInfo = originals.ingredientCostInfo;
      costing.pkgCostPerPiece = originals.pkgCostPerPiece;
      costing.lineCost = originals.lineCost;
      costing.recipeTotal = originals.recipeTotal;
      costing.recipePerServing = originals.recipePerServing;
      costing.productPackagingCost = originals.productPackagingCost;
      core.canonicalValue = originals.canonicalValue;
      core.num = originals.num;
    }
  });

  expect(result).toEqual({
    dynamicMixture: 2000,
    dynamicCostInfo: [9, 3],
    dynamicPackaging: 14,
    dynamicRecipeTotal: 12,
    dynamicPerServing: 5,
    dynamicProductCost: 10,
    dynamicCoreNumber: 20,
    dynamicCanonicalWrapped: true,
    dynamicStateLookup: 'Live ingredient',
  });
});

test('typed Costing preserves classic accessor, boxing, and coercion edges', async ({ page }) => {
  const result = await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const costing = app.MatchaLunaApp.domains.costing as Record<string, any>;
    const core = app.MatchaLunaApp.domains.core as Record<string, any>;
    const originalState = app.state;
    const originalUnitType = core.UNIT_TYPE;
    const typeBaseDescriptor = Object.getOwnPropertyDescriptor(core, 'TYPE_BASE');
    const booleanDescriptor = Object.getOwnPropertyDescriptor(app, 'Boolean');
    const textEncoderDescriptor = Object.getOwnPropertyDescriptor(app, 'TextEncoder');
    const nativeBoolean = app.Boolean;
    const saved = {
      ingredientBaseUnit: costing.ingredientBaseUnit,
      ingredientCostInfo: costing.ingredientCostInfo,
      collectPublicationIngredient: costing.collectPublicationIngredient,
      buildProductCostingSnapshot: costing.buildProductCostingSnapshot,
      validateProductForPublish: costing.validateProductForPublish,
    };

    const restoreDescriptor = (
      target: Record<string, any>,
      name: string,
      descriptor: PropertyDescriptor | undefined,
    ) => {
      if (descriptor) Object.defineProperty(target, name, descriptor);
      else delete target[name];
    };

    try {
      core.UNIT_TYPE = { ml: 'weight' };
      let typeBaseReads = 0;
      Object.defineProperty(core, 'TYPE_BASE', {
        configurable: true,
        enumerable: true,
        get() {
          typeBaseReads += 1;
          core.UNIT_TYPE = { ml: 'volume' };
          return { weight: 'g', volume: 'ml' };
        },
      });
      const orderedBaseUnit = saved.ingredientBaseUnit({ unit: 'ml' });
      restoreDescriptor(core, 'TYPE_BASE', typeBaseDescriptor);
      core.UNIT_TYPE = originalUnitType;

      const coerciveName = {
        [Symbol.toPrimitive](hint: string) {
          return hint === 'default' ? 'DEFAULT' : 'STRING';
        },
      };
      app.state = {
        ingredients: [
          {
            id: 'source',
            name: coerciveName,
            kind: 'purchased',
            purchaseQty: 1,
            amountPerItem: 100,
            unit: 'ml',
            price: '',
          },
          {
            id: 'mixture',
            name: 'Mixture',
            kind: 'mixture',
            batchYield: 100,
            unit: 'ml',
            components: [{ ingredientId: 'source', qty: 10, unit: 'ml' }],
          },
        ],
        packaging: [],
        recipes: [],
        products: [],
        mixtureDrafts: [],
      };
      const defaultHintError = saved.ingredientCostInfo(app.state.ingredients[1]).error;
      let primitiveMapsSucceeded = true;
      try {
        saved.collectPublicationIngredient('source', 5, 6);
      } catch {
        primitiveMapsSucceeded = false;
      }

      app.state = {
        ingredients: [
          {
            id: 'milk',
            name: 'Milk',
            kind: 'purchased',
            purchaseQty: 1,
            amountPerItem: 1000,
            unit: 'ml',
            price: 100,
          },
        ],
        packaging: [{ id: 'cup', name: 'Cup', qty: 10, price: 10 }],
        recipes: [
          {
            id: 'recipe',
            name: 'Recipe',
            yield: 1,
            lines: [{ id: 'line', ingredientId: 'milk', qty: 100, unit: 'ml' }],
          },
        ],
        products: [],
        mixtureDrafts: [],
      };
      const product = {
        id: 'product',
        name: 'Product',
        recipeId: 'recipe',
        price: 100,
        packLines: [{ id: 'pack-line', packagingId: 'cup', qty: 1 }],
      };

      let booleanReads = 0;
      const booleanArgumentCounts: number[] = [];
      Object.defineProperty(app, 'Boolean', {
        configurable: true,
        get() {
          booleanReads += 1;
          return (...args: unknown[]) => {
            booleanArgumentCounts.push(args.length);
            return nativeBoolean(args[0]);
          };
        },
      });
      saved.buildProductCostingSnapshot(product, '');
      restoreDescriptor(app, 'Boolean', booleanDescriptor);

      let textEncoderReads = 0;
      class CountingTextEncoder {
        encode() {
          return { length: 1 };
        }
      }
      Object.defineProperty(app, 'TextEncoder', {
        configurable: true,
        get() {
          textEncoderReads += 1;
          return CountingTextEncoder;
        },
      });
      const validation = saved.validateProductForPublish(product);
      restoreDescriptor(app, 'TextEncoder', textEncoderDescriptor);

      return {
        orderedBaseUnit,
        typeBaseReads,
        defaultHintError,
        primitiveMapsSucceeded,
        booleanReads,
        booleanArgumentCounts,
        textEncoderReads,
        validation,
      };
    } finally {
      app.state = originalState;
      core.UNIT_TYPE = originalUnitType;
      restoreDescriptor(core, 'TYPE_BASE', typeBaseDescriptor);
      restoreDescriptor(app, 'Boolean', booleanDescriptor);
      restoreDescriptor(app, 'TextEncoder', textEncoderDescriptor);
    }
  });

  expect(result).toEqual({
    orderedBaseUnit: 'ml',
    typeBaseReads: 1,
    defaultHintError:
      'DEFAULT: Complete the purchase amount and enter a non-negative price',
    primitiveMapsSucceeded: true,
    booleanReads: 1,
    booleanArgumentCounts: [3],
    textEncoderReads: 2,
    validation: { valid: true, error: '' },
  });
});
