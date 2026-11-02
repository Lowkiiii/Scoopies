import type {
  CostingProduct,
  CostingState,
} from '../costing/types';
import { runtimeValue, writeRuntimeBinding } from './bindings';

type LegacyValue = any;

function nextId(): LegacyValue {
  return runtimeValue<() => LegacyValue>('uid')();
}

export function exampleData(): CostingState {
  const baking = { id: nextId(), name: 'Baking ingredients' };
  const flour = {
    id: nextId(),
    kind: 'purchased',
    categoryId: baking.id,
    name: 'Flour',
    qty: 1000,
    unit: 'g',
    price: 80,
  };
  const butter = {
    id: nextId(),
    kind: 'purchased',
    categoryId: baking.id,
    name: 'Butter',
    qty: 500,
    unit: 'g',
    price: 250,
  };
  const sugar = {
    id: nextId(),
    kind: 'purchased',
    categoryId: baking.id,
    name: 'Sugar',
    qty: 1000,
    unit: 'g',
    price: 60,
  };
  const chips = {
    id: nextId(),
    kind: 'purchased',
    categoryId: baking.id,
    name: 'Chocolate chips',
    qty: 250,
    unit: 'g',
    price: 120,
  };
  const cup = { id: nextId(), name: 'Container', qty: 50, price: 250 };
  const sticker = {
    id: nextId(),
    name: 'Sticker',
    qty: 100,
    price: 200,
  };
  const spoon = { id: nextId(), name: 'Spoon', qty: 100, price: 100 };
  const recipe = {
    id: nextId(),
    name: 'Chocolate Cookie',
    yield: 10,
    lines: [
      { id: nextId(), ingredientId: flour.id, qty: 300, unit: 'g' },
      { id: nextId(), ingredientId: butter.id, qty: 100, unit: 'g' },
      { id: nextId(), ingredientId: sugar.id, qty: 150, unit: 'g' },
      { id: nextId(), ingredientId: chips.id, qty: 100, unit: 'g' },
    ],
  };
  const product: CostingProduct = {
    id: nextId(),
    name: 'Chocolate Cookie',
    recipeId: recipe.id,
    targetMargin: 60,
    price: '',
    packLines: [
      { id: nextId(), packagingId: cup.id, qty: 1 },
      { id: nextId(), packagingId: sticker.id, qty: 1 },
      { id: nextId(), packagingId: spoon.id, qty: 1 },
    ],
  };
  const state: CostingState = {
    schemaVersion: 3,
    ingredientCategories: [baking],
    ingredients: [flour, butter, sugar, chips],
    mixtureDrafts: [],
    packaging: [cup, sticker, spoon],
    recipes: [recipe],
    products: [product],
  };
  writeRuntimeBinding('state', state);
  const cost = runtimeValue<(value: CostingProduct) => number>('productCost')(
    product,
  );
  const suggested = runtimeValue<
    (cost: number, marginPercentage: number) => number
  >('suggestedPrice')(cost, 60);
  product.price = runtimeValue<(value: LegacyValue) => boolean>('isFinite')(
    suggested,
  )
    ? runtimeValue<(value: number, step: number) => number>('ceilTo')(
        suggested,
        5,
      )
    : '';
  return state;
}
