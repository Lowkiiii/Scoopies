import { getById, num, toBase, TYPE_BASE, UNIT_TYPE } from '../core';
import {
  readCostingBinding,
  readCostingState,
  readRuntimeBinding,
} from './bindings';
import type {
  CostingIngredient,
  IngredientCostInfo,
  IngredientLookup,
  LegacyValue,
} from './types';

type ToBase = typeof toBase;
type Num = typeof num;
type GetById = typeof getById;

function runtimeToBase(): ToBase {
  return readRuntimeBinding('toBase', toBase);
}

function runtimeNum(): Num {
  return readRuntimeBinding('num', num);
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

export function isMixture(
  ingredient: CostingIngredient | null | undefined,
): boolean {
  return !!(ingredient && ingredient.kind === 'mixture');
}

export function ingredientBaseUnit(
  ingredient: CostingIngredient | null | undefined,
): string | undefined {
  const baseUnits = readRuntimeBinding(
    'TYPE_BASE',
    TYPE_BASE as Record<string, string | undefined>,
  );
  const unitTypes = runtimeUnitType();
  return baseUnits[unitTypes[(ingredient && ingredient.unit) as string] || 'weight'];
}

/**
 * Old records stored the total amount in qty. New records store the number of
 * packs and the amount inside each pack; retaining the old path prevents data
 * loss.
 */
export function ingredientTotalBase(ingredient: CostingIngredient): number {
  if (readCostingBinding('isMixture', isMixture)(ingredient)) {
    return runtimeToBase()(ingredient.batchYield, ingredient.unit as string);
  }
  const hasPackFields =
    ingredient.purchaseQty != null || ingredient.amountPerItem != null;
  if (hasPackFields) {
    const purchaseQty =
      ingredient.purchaseQty != null ? ingredient.purchaseQty : 1;
    const amountPerItem =
      ingredient.amountPerItem != null
        ? ingredient.amountPerItem
        : ingredient.qty;
    return (
      runtimeNum()(purchaseQty) *
      runtimeToBase()(amountPerItem, ingredient.unit as string)
    );
  }
  return runtimeToBase()(ingredient.qty, ingredient.unit as string);
}

export function stateIngredientLookup(
  id: LegacyValue,
): CostingIngredient | null {
  return runtimeGetById()(readCostingState().ingredients, id);
}

export function ingredientCostInfo(
  ingredient: CostingIngredient | null | undefined,
  trail?: LegacyValue[],
  lookup?: IngredientLookup,
): IngredientCostInfo {
  const activeLookup =
    lookup || readCostingBinding('stateIngredientLookup', stateIngredientLookup);
  const activeTrail = trail || [];
  if (!ingredient) {
    return {
      valid: false,
      costPerBase: NaN,
      batchCost: NaN,
      error: 'Missing ingredient',
    };
  }
  if (activeTrail.indexOf(ingredient.id) >= 0) {
    return {
      valid: false,
      costPerBase: NaN,
      batchCost: NaN,
      error: 'Circular mixture reference',
    };
  }
  if (!readCostingBinding('isMixture', isMixture)(ingredient)) {
    const base = readCostingBinding(
      'ingredientTotalBase',
      ingredientTotalBase,
    )(ingredient);
    const hasPrice = ingredient.price !== '' && ingredient.price != null;
    const price = runtimeNum()(ingredient.price);
    if (!(base > 0) || !hasPrice || !isFinite(price) || price < 0) {
      return {
        valid: false,
        costPerBase: NaN,
        batchCost: NaN,
        error: 'Complete the purchase amount and enter a non-negative price',
      };
    }
    return {
      valid: true,
      costPerBase: price / base,
      batchCost: price,
      error: '',
    };
  }
  const yieldBase = runtimeToBase()(
    ingredient.batchYield,
    ingredient.unit as string,
  );
  const components = ingredient.components || [];
  if (!(yieldBase > 0)) {
    return {
      valid: false,
      costPerBase: NaN,
      batchCost: NaN,
      error: 'Finished batch yield must be greater than zero',
    };
  }
  if (!components.length) {
    return {
      valid: false,
      costPerBase: NaN,
      batchCost: NaN,
      error: 'Add at least one component',
    };
  }
  let total = 0;
  const nextTrail = activeTrail.concat([ingredient.id]);
  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    const source = activeLookup(component.ingredientId);
    if (!source) {
      return {
        valid: false,
        costPerBase: NaN,
        batchCost: NaN,
        error: 'A component ingredient is missing',
      };
    }
    if (
      runtimeUnitType()[component.unit as string] !==
      runtimeUnitType()[source.unit as string]
    ) {
      return {
        valid: false,
        costPerBase: NaN,
        batchCost: NaN,
        error: 'A component uses an incompatible unit',
      };
    }
    const used = runtimeToBase()(component.qty, component.unit as string);
    if (!(used > 0)) {
      return {
        valid: false,
        costPerBase: NaN,
        batchCost: NaN,
        error: 'Every component needs a quantity greater than zero',
      };
    }
    const info = readCostingBinding(
      'ingredientCostInfo',
      ingredientCostInfo,
    )(source, nextTrail, activeLookup);
    if (!info.valid) {
      return {
        valid: false,
        costPerBase: NaN,
        batchCost: NaN,
        error: (source.name || 'Component') + ': ' + info.error,
      };
    }
    total += used * info.costPerBase;
  }
  return {
    valid: true,
    costPerBase: total / yieldBase,
    batchCost: total,
    error: '',
  };
}

export function mixtureBatchCost(
  ingredient: CostingIngredient | null | undefined,
  trail?: LegacyValue[],
  lookup?: IngredientLookup,
): number {
  const info = readCostingBinding(
    'ingredientCostInfo',
    ingredientCostInfo,
  )(ingredient, trail, lookup);
  return info.valid ? info.batchCost : NaN;
}

export function ingCostPerBase(
  ingredient: CostingIngredient | null | undefined,
  trail?: LegacyValue[],
  lookup?: IngredientLookup,
): number {
  const info = readCostingBinding(
    'ingredientCostInfo',
    ingredientCostInfo,
  )(ingredient, trail, lookup);
  return info.valid ? info.costPerBase : NaN;
}
