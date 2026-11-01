import { canonicalValue, getById, num, UNIT_TYPE } from '../core';
import {
  readCostingBinding,
  readCostingState,
  readRuntimeBinding,
} from './bindings';
import { ingredientCostInfo, isMixture } from './ingredients';
import {
  pkgCostPerPiece,
  productPackagingCost,
  recipePerServing,
} from './recipes-products';
import type {
  CostingIngredient,
  CostingProduct,
  CostingValidationResult,
  LegacyValue,
  ProductCostingSnapshotResult,
} from './types';

type GetById = typeof getById;
type Num = typeof num;
type CanonicalValue = typeof canonicalValue;
type PublicationMap = Record<PropertyKey, LegacyValue>;

interface PublicationPackagingRecord {
  id: string;
  name: string;
  qty: number | null;
  price: number | null;
}

function runtimeGetById(): GetById {
  return readRuntimeBinding('getById', getById);
}

function runtimeNum(): Num {
  return readRuntimeBinding('num', num);
}

function runtimeCanonicalValue(): CanonicalValue {
  return readRuntimeBinding('canonicalValue', canonicalValue);
}

function runtimeUnitType(): Record<string, string | undefined> {
  return readRuntimeBinding(
    'UNIT_TYPE',
    UNIT_TYPE as Record<string, string | undefined>,
  );
}

function legacyPropertyTarget(value: LegacyValue, key: PropertyKey): object {
  if (value == null) {
    // Preserve the classic script's nullish bracket-access failure.
    void value[key];
  }
  return Object(value);
}

function legacyPropertyGet(value: LegacyValue, key: PropertyKey): LegacyValue {
  return Reflect.get(legacyPropertyTarget(value, key), key);
}

function legacyPropertySet(
  value: LegacyValue,
  key: PropertyKey,
  next: LegacyValue,
): void {
  Reflect.set(legacyPropertyTarget(value, key), key, next);
}

function legacyPropertyDelete(value: LegacyValue, key: PropertyKey): void {
  Reflect.deleteProperty(legacyPropertyTarget(value, key), key);
}

export function moneyToCentavos(value: LegacyValue): number {
  const numberValue =
    typeof value === 'number' ? value : parseFloat(value as string);
  return isFinite(numberValue)
    ? Math.round(numberValue * 100 + 1e-7)
    : NaN;
}

export function snapshotNumber(value: LegacyValue): number | null {
  const numberValue =
    typeof value === 'number' ? value : parseFloat(value as string);
  return isFinite(numberValue) ? numberValue : null;
}

export function publicationIngredientRecord(
  ingredient: CostingIngredient,
): Record<string, unknown> {
  if (readCostingBinding('isMixture', isMixture)(ingredient)) {
    return {
      id: String(ingredient.id || ''),
      kind: 'mixture',
      name: String(ingredient.name || ''),
      batchYield: readCostingBinding(
        'snapshotNumber',
        snapshotNumber,
      )(ingredient.batchYield),
      unit: String(ingredient.unit || ''),
      components: (ingredient.components || []).map((component) => ({
        ingredientId: String(component.ingredientId || ''),
        qty: readCostingBinding('snapshotNumber', snapshotNumber)(
          component.qty,
        ),
        unit: String(component.unit || ''),
      })),
    };
  }
  return {
    id: String(ingredient.id || ''),
    kind: 'purchased',
    name: String(ingredient.name || ''),
    purchaseQty: readCostingBinding('snapshotNumber', snapshotNumber)(
      ingredient.purchaseQty != null ? ingredient.purchaseQty : 1,
    ),
    amountPerItem: readCostingBinding('snapshotNumber', snapshotNumber)(
      ingredient.amountPerItem != null
        ? ingredient.amountPerItem
        : ingredient.qty,
    ),
    unit: String(ingredient.unit || ''),
    price: readCostingBinding('snapshotNumber', snapshotNumber)(
      ingredient.price,
    ),
  };
}

export function collectPublicationIngredient(
  id: LegacyValue,
  found: LegacyValue,
  visiting: LegacyValue,
): void {
  const key = id as PropertyKey;
  if (legacyPropertyGet(found, key) || legacyPropertyGet(visiting, key)) return;
  const ingredient = runtimeGetById()(readCostingState().ingredients, id);
  if (!ingredient) return;
  legacyPropertySet(visiting, key, true);
  if (readCostingBinding('isMixture', isMixture)(ingredient)) {
    (ingredient.components || []).forEach((component) => {
      readCostingBinding(
        'collectPublicationIngredient',
        collectPublicationIngredient,
      )(component.ingredientId, found, visiting);
    });
  }
  legacyPropertyDelete(visiting, key);
  legacyPropertySet(
    found,
    key,
    readCostingBinding(
      'publicationIngredientRecord',
      publicationIngredientRecord,
    )(ingredient),
  );
}

export function buildProductCostingSnapshot(
  product: CostingProduct | null | undefined,
  size: LegacyValue,
): ProductCostingSnapshotResult {
  const recipe = runtimeGetById()(
    readCostingState().recipes,
    product && product.recipeId,
  );
  const ingredientCost = recipe
    ? readCostingBinding('recipePerServing', recipePerServing)(recipe)
    : NaN;
  const packagingCost = readCostingBinding(
    'productPackagingCost',
    productPackagingCost,
  )((product || { packLines: [] }) as CostingProduct);
  const sellingPriceCentavos = readCostingBinding(
    'moneyToCentavos',
    moneyToCentavos,
  )(product && product.price);
  const ingredientCostCentavos = readCostingBinding(
    'moneyToCentavos',
    moneyToCentavos,
  )(ingredientCost);
  const packagingCostCentavos = readCostingBinding(
    'moneyToCentavos',
    moneyToCentavos,
  )(packagingCost);
  const found: PublicationMap = {};
  if (recipe) {
    (recipe.lines || []).forEach((line) => {
      readCostingBinding(
        'collectPublicationIngredient',
        collectPublicationIngredient,
      )(line.ingredientId, found, {});
    });
  }
  const packagingIds: PublicationMap = {};
  ((product && product.packLines) || []).forEach((line) => {
    if (line.packagingId) {
      Reflect.set(packagingIds, line.packagingId as PropertyKey, true);
    }
  });
  const ingredients = Object.keys(found)
    .sort()
    .map((id) => found[id]);
  const packages = Object.keys(packagingIds)
    .sort()
    .map((id): PublicationPackagingRecord | null => {
      const item = runtimeGetById()(readCostingState().packaging, id);
      return item
        ? {
            id: String(item.id || ''),
            name: String(item.name || ''),
            qty: readCostingBinding('snapshotNumber', snapshotNumber)(
              item.qty,
            ),
            price: readCostingBinding('snapshotNumber', snapshotNumber)(
              item.price,
            ),
          }
        : null;
    })
    .filter(Boolean) as PublicationPackagingRecord[];
  const normalizedSize = String(size || '').trim();
  const snapshotData = {
    schemaVersion: 1,
    sourceProductId: String((product && product.id) || ''),
    sourceRecipeId: String((product && product.recipeId) || ''),
    name: String((product && product.name) || '').trim(),
    size: normalizedSize || null,
    sellingPriceCentavos,
    ingredientCostCentavos,
    packagingCostCentavos,
    recipe: recipe
      ? {
          id: String(recipe.id || ''),
          name: String(recipe.name || ''),
          yield: readCostingBinding('snapshotNumber', snapshotNumber)(
            recipe.yield,
          ),
          lines: (recipe.lines || []).map((line) => ({
            id: String(line.id || ''),
            ingredientId: String(line.ingredientId || ''),
            qty: readCostingBinding('snapshotNumber', snapshotNumber)(
              line.qty,
            ),
            unit: String(line.unit || ''),
          })),
        }
      : null,
    ingredients,
    packaging: packages,
    packagingLines: ((product && product.packLines) || []).map(
      (line) => ({
        id: String(line.id || ''),
        packagingId: String(line.packagingId || ''),
        qty: readCostingBinding('snapshotNumber', snapshotNumber)(line.qty),
      }),
    ),
  };
  return {
    snapshot: runtimeCanonicalValue()(snapshotData),
    sellingPriceCentavos,
    ingredientCostCentavos,
    packagingCostCentavos,
  };
}

export function validateProductForPublish(
  product: CostingProduct | null | undefined,
): CostingValidationResult {
  if (!product) {
    return {
      valid: false,
      error: 'That costing product no longer exists.',
    };
  }
  const name = String(product.name || '').trim();
  if (!name) return { valid: false, error: 'Add a product name first.' };
  if (name.length > 120) {
    return {
      valid: false,
      error: 'Keep the product name under 120 characters.',
    };
  }
  if (
    String(product.id || '').length < 1 ||
    String(product.id || '').length > 200
  ) {
    return {
      valid: false,
      error: 'This product has an invalid source ID.',
    };
  }
  if (
    product.price === '' ||
    product.price == null ||
    !isFinite(parseFloat(product.price as string)) ||
    parseFloat(product.price as string) <= 0
  ) {
    return {
      valid: false,
      error: 'Enter a selling price greater than zero.',
    };
  }
  const recipe = runtimeGetById()(
    readCostingState().recipes,
    product.recipeId,
  );
  if (!recipe) return { valid: false, error: 'Select a recipe first.' };
  if (
    String(recipe.id || '').length < 1 ||
    String(recipe.id || '').length > 200
  ) {
    return {
      valid: false,
      error: 'This recipe has an invalid source ID.',
    };
  }
  if (!(runtimeNum()(recipe.yield) > 0)) {
    return {
      valid: false,
      error: 'The recipe yield must be greater than zero.',
    };
  }
  if (!(recipe.lines || []).length) {
    return {
      valid: false,
      error: 'Add at least one ingredient to the recipe.',
    };
  }
  for (let index = 0; index < (recipe.lines as NonNullable<typeof recipe.lines>).length; index += 1) {
    const line = (recipe.lines as NonNullable<typeof recipe.lines>)[index];
    const ingredient = runtimeGetById()(
      readCostingState().ingredients,
      line.ingredientId,
    );
    if (!ingredient) {
      return {
        valid: false,
        error: 'A recipe ingredient is missing.',
      };
    }
    if (!(runtimeNum()(line.qty) > 0)) {
      return {
        valid: false,
        error: 'Every recipe ingredient needs a quantity greater than zero.',
      };
    }
    if (
      runtimeUnitType()[line.unit as string] !==
      runtimeUnitType()[ingredient.unit as string]
    ) {
      return {
        valid: false,
        error: 'A recipe ingredient uses an incompatible unit.',
      };
    }
    const info = readCostingBinding(
      'ingredientCostInfo',
      ingredientCostInfo,
    )(ingredient);
    if (!info.valid) {
      return {
        valid: false,
        error:
          (ingredient.name || 'Ingredient') + ': ' + info.error + '.',
      };
    }
  }
  for (
    let index = 0;
    index < (product.packLines || []).length;
    index += 1
  ) {
    const packLine = (product.packLines || [])[index];
    const packaging = runtimeGetById()(
      readCostingState().packaging,
      packLine.packagingId,
    );
    if (!packaging) {
      return { valid: false, error: 'A packaging item is missing.' };
    }
    if (!(runtimeNum()(packLine.qty) > 0)) {
      return {
        valid: false,
        error: 'Every packaging item needs a quantity greater than zero.',
      };
    }
    if (
      !isFinite(
        readCostingBinding('pkgCostPerPiece', pkgCostPerPiece)(packaging),
      )
    ) {
      return {
        valid: false,
        error:
          (packaging.name || 'Packaging') +
          ' needs a valid pack quantity and price.',
      };
    }
  }
  const built = readCostingBinding(
    'buildProductCostingSnapshot',
    buildProductCostingSnapshot,
  )(product, '');
  const maxCentavos = 100000000000;
  if (
    !Number.isSafeInteger(built.sellingPriceCentavos) ||
    built.sellingPriceCentavos <= 0 ||
    built.sellingPriceCentavos > maxCentavos
  ) {
    return {
      valid: false,
      error: 'The selling price is outside the supported range.',
    };
  }
  if (
    !Number.isSafeInteger(built.ingredientCostCentavos) ||
    built.ingredientCostCentavos < 0 ||
    built.ingredientCostCentavos > maxCentavos
  ) {
    return {
      valid: false,
      error: 'The ingredient cost is incomplete or invalid.',
    };
  }
  if (
    !Number.isSafeInteger(built.packagingCostCentavos) ||
    built.packagingCostCentavos < 0 ||
    built.packagingCostCentavos > maxCentavos
  ) {
    return {
      valid: false,
      error: 'The packaging cost is incomplete or invalid.',
    };
  }
  if (
    built.ingredientCostCentavos + built.packagingCostCentavos >
    maxCentavos
  ) {
    return {
      valid: false,
      error: 'The total cost is outside the supported range.',
    };
  }
  const serialized = JSON.stringify(built.snapshot) as string;
  const hasTextEncoder = readRuntimeBinding<typeof TextEncoder | undefined>(
    'TextEncoder',
    undefined,
  );
  const bytes = hasTextEncoder
    ? new (readRuntimeBinding<typeof TextEncoder>(
        'TextEncoder',
        undefined as unknown as typeof TextEncoder,
      ))()
        .encode(serialized).length
    : serialized.length * 2;
  if (bytes > 262144) {
    return {
      valid: false,
      error: 'This costing snapshot is too large to publish safely.',
    };
  }
  return { valid: true, error: '' };
}
