import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RESET_CONFIRMATION,
  assertCostingReset,
  prepareCostingReset,
  resetProductionMenu,
  selectManagedBusiness,
  validateConfirmation,
} from '../../scripts/reset-production-menu.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createFixtureApi(options = {}) {
  let version = 1;
  let stateRow = {
    updated_at: `version-${version}`,
    data: {
      ingredients: [{ id: 'ingredient-1', name: 'Oatside' }],
      packaging: [{ id: 'packaging-1', name: 'Cup' }],
      ingredientCategories: [{ id: 'category-1', name: 'Milk' }],
      mixtureDrafts: [{ id: 'draft-1', name: 'Cloud' }],
      recipes: [{ id: 'recipe-1', name: 'Old Latte' }],
      products: [{ id: 'pricing-1', name: 'Old Latte 12oz' }],
      futureField: { must: 'survive' },
    },
  };
  const availability = new Map([
    ['pos-1', true],
    ['pos-2', false],
  ]);
  const calls = [];

  const api = {
    calls,
    state: () => clone(stateRow),
    availability: () => new Map(availability),
    getBusinesses: async () => [{
      business_id: 'business-1',
      business_name: 'Matcha Luna',
      member_role: 'owner',
    }],
    getCostingState: async () => clone(stateRow),
    getPublicationStatus: async () => [
      { product_id: 'pos-1', catalog_name: 'Old Latte', available: availability.get('pos-1'), archived_at: null },
      { product_id: 'pos-2', catalog_name: 'Already hidden', available: availability.get('pos-2'), archived_at: null },
      { product_id: 'archived', catalog_name: 'Archived', available: true, archived_at: '2026-01-01T00:00:00Z' },
    ],
    getProductMedia: async () => [
      { product_id: 'pos-1', product_name: 'Old Latte', available: availability.get('pos-1') },
      { product_id: 'pos-2', product_name: 'Already hidden', available: availability.get('pos-2') },
    ],
    getCatalog: async () => options.catalogAlwaysVisible
      ? [{ product_id: 'pos-1' }]
      : [...availability].filter(([, available]) => available).map(([product_id]) => ({ product_id })),
    setProductAvailability: async (_businessId, productId, available) => {
      calls.push(['availability', productId, available]);
      availability.set(productId, available);
      return available;
    },
    updateCostingState: async (expected, data) => {
      calls.push(['costing', expected, clone(data)]);
      if (options.conflictOnFirstUpdate && calls.filter(([kind]) => kind === 'costing').length === 1) {
        return null;
      }
      if (expected !== stateRow.updated_at) return null;
      version += 1;
      stateRow = { updated_at: `version-${version}`, data: clone(data) };
      return clone(stateRow);
    },
    insertActivity: async (summary) => {
      calls.push(['activity', summary]);
    },
  };

  return api;
}

test('confirmation gate requires the exact destructive reset phrase', () => {
  assert.doesNotThrow(() => validateConfirmation(RESET_CONFIRMATION));
  assert.throws(() => validateConfirmation('clear recipes'), /Reset blocked/);
});

test('business selection accepts only one owner or manager by default', () => {
  assert.equal(selectManagedBusiness([
    { business_id: 'cashier', member_role: 'cashier' },
    { business_id: 'owner', member_role: 'owner' },
  ]).business_id, 'owner');

  assert.throws(() => selectManagedBusiness([
    { business_id: 'one', member_role: 'owner' },
    { business_id: 'two', member_role: 'manager' },
  ]), /exactly one/);
});

test('costing reset changes only recipes and pricing products', () => {
  const original = {
    ingredients: [{ id: 'ingredient' }],
    recipes: [{ id: 'recipe' }],
    products: [{ id: 'product' }],
    unknownFutureData: { nested: [3, 2, 1] },
  };
  const { nextData } = prepareCostingReset(original);
  assert.deepEqual(nextData.recipes, []);
  assert.deepEqual(nextData.products, []);
  assert.deepEqual(nextData.ingredients, original.ingredients);
  assert.deepEqual(nextData.unknownFutureData, original.unknownFutureData);
  assert.doesNotThrow(() => assertCostingReset(original, nextData));
});

test('successful reset preserves all non-menu costing data and hides only available POS drinks', async () => {
  const api = createFixtureApi();
  const before = api.state();
  let backup = null;

  const result = await resetProductionMenu({
    api,
    backupPath: 'unused-in-test.json',
    reason: 'New brand menu',
    confirmation: RESET_CONFIRMATION,
    now: () => '2026-11-11T00:00:00.000Z',
    backupWriter: async (_path, value) => { backup = clone(value); },
    logger: { log() {}, warn() {} },
  });

  assert.deepEqual(result, {
    completedAt: '2026-11-11T00:00:00.000Z',
    businessId: 'business-1',
    businessName: 'Matcha Luna',
    recipesCleared: 1,
    pricingProductsCleared: 1,
    posDrinksHidden: 1,
    backupPath: 'unused-in-test.json',
  });
  assert.equal(backup.costing.recipes[0].id, 'recipe-1');
  assert.equal(backup.costing.products[0].id, 'pricing-1');
  assert.equal(backup.pos.products.find((row) => row.productId === 'pos-1').available, true);
  assertCostingReset(before.data, api.state().data);
  assert.deepEqual(api.availability(), new Map([['pos-1', false], ['pos-2', false]]));
  assert.deepEqual(
    api.calls.filter(([kind]) => kind === 'availability'),
    [['availability', 'pos-1', false]],
  );
});

test('a costing concurrency conflict restores POS availability', async () => {
  const api = createFixtureApi({ conflictOnFirstUpdate: true });
  const before = api.state();

  await assert.rejects(() => resetProductionMenu({
    api,
    backupPath: 'unused-in-test.json',
    reason: 'New brand menu',
    confirmation: RESET_CONFIRMATION,
    backupWriter: async () => {},
    logger: { log() {}, warn() {} },
  }), /All partial reset changes were rolled back/);

  assert.deepEqual(api.state(), before);
  assert.equal(api.availability().get('pos-1'), true);
  assert.deepEqual(
    api.calls.filter(([kind]) => kind === 'availability'),
    [
      ['availability', 'pos-1', false],
      ['availability', 'pos-1', true],
    ],
  );
});

test('a verification failure restores costing and POS availability', async () => {
  const api = createFixtureApi({ catalogAlwaysVisible: true });
  const before = api.state();

  await assert.rejects(() => resetProductionMenu({
    api,
    backupPath: 'unused-in-test.json',
    reason: 'New brand menu',
    confirmation: RESET_CONFIRMATION,
    backupWriter: async () => {},
    logger: { log() {}, warn() {} },
  }), /All partial reset changes were rolled back/);

  assert.deepEqual(api.state().data, before.data);
  assert.equal(api.availability().get('pos-1'), true);
  assert.equal(api.calls.filter(([kind]) => kind === 'costing').length, 2);
});
