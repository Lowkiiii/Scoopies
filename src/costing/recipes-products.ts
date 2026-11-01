import { getById, num, toBase, UNIT_TYPE } from '../core';
import {
  readCostingBinding,
  readCostingState,
  readRuntimeBinding,
} from './bindings';
import { ingCostPerBase } from './ingredients';
import type {
  CostingProduct,
  CostingRecipe,
  LegacyValue,
  PackagingItem,
  PackagingLine,
  RecipeLine,
} from './types';

type Num = typeof num;
type ToBase = typeof toBase;
type GetById = typeof getById;

function runtimeNum(): Num {
  return readRuntimeBinding('num', num);
}

function runtimeToBase(): ToBase {
  return readRuntimeBinding('toBase', toBase);
}

function runtimeGetById(): GetById {
  return readRuntimeBinding('getById', getById);
}

function runtimeUnitType(): Record<string, string | undefined> {
  return readRuntimeBinding(
    'UNIT_TYPE',
    UNIT_TYPE as Record<string, string | undefined>,
  );
}

export function pkgCostPerPiece(
  packaging: PackagingItem | null | undefined,
): number {
  if (!packaging) return NaN;
  const quantity = runtimeNum()(packaging.qty);
  const hasPrice = packaging.price !== '' && packaging.price != null;
  const price = runtimeNum()(packaging.price);
  return quantity > 0 && hasPrice && isFinite(price) && price >= 0
    ? price / quantity
    : NaN;
}

export function packagingLineCost(
  line: PackagingLine | null | undefined,
): number {
  if (!line || !line.packagingId) return NaN;
  const packaging = runtimeGetById()(
    readCostingState().packaging,
    line.packagingId,
  );
  const quantity = runtimeNum()(line.qty);
  const each = readCostingBinding('pkgCostPerPiece', pkgCostPerPiece)(
    packaging,
  );
  return packaging && quantity > 0 && isFinite(each)
    ? quantity * each
    : NaN;
}

export function lineCost(line: RecipeLine | null | undefined): number {
  if (!line || !line.ingredientId) return 0;
  const ingredient = runtimeGetById()(
    readCostingState().ingredients,
    line.ingredientId,
  );
  if (!ingredient) return NaN;
  if (
    runtimeUnitType()[line.unit as string] !==
    runtimeUnitType()[ingredient.unit as string]
  ) {
    return NaN;
  }
  const used = runtimeToBase()(line.qty, line.unit as string);
  return used > 0
    ? used *
        readCostingBinding('ingCostPerBase', ingCostPerBase)(ingredient)
    : NaN;
}

export function recipeTotal(recipe: CostingRecipe): number {
  let total = 0;
  (recipe.lines || []).forEach((line) => {
    total += readCostingBinding('lineCost', lineCost)(line);
  });
  return total;
}

export function recipePerServing(
  recipe: CostingRecipe | null | undefined,
): number {
  const yieldCount = runtimeNum()(recipe && recipe.yield);
  return yieldCount > 0
    ? readCostingBinding('recipeTotal', recipeTotal)(recipe as CostingRecipe) /
        yieldCount
    : NaN;
}

export function productPackagingCost(product: CostingProduct): number {
  let total = 0;
  (product.packLines || []).forEach((line) => {
    total += readCostingBinding('packagingLineCost', packagingLineCost)(line);
  });
  return total;
}

export function productCost(product: CostingProduct): number {
  const recipe = runtimeGetById()(
    readCostingState().recipes,
    product.recipeId,
  );
  return recipe
    ? readCostingBinding('recipePerServing', recipePerServing)(recipe) +
        readCostingBinding('productPackagingCost', productPackagingCost)(
          product,
        )
    : NaN;
}

export function suggestedPrice(
  cost: LegacyValue,
  marginPercentage: LegacyValue,
): number {
  const margin = runtimeNum()(marginPercentage) / 100;
  if (margin >= 1) return Infinity;
  return cost / (1 - margin);
}
