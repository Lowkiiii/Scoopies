export type LegacyValue = any;

export interface IdentifiedRecord {
  id: LegacyValue;
  [key: string]: LegacyValue;
}

export interface IngredientComponent {
  ingredientId: LegacyValue;
  qty: LegacyValue;
  unit: LegacyValue;
  [key: string]: LegacyValue;
}

export interface CostingIngredient extends IdentifiedRecord {
  kind?: LegacyValue;
  name?: LegacyValue;
  unit?: LegacyValue;
  qty?: LegacyValue;
  purchaseQty?: LegacyValue;
  amountPerItem?: LegacyValue;
  price?: LegacyValue;
  batchYield?: LegacyValue;
  components?: IngredientComponent[];
}

export interface PackagingItem extends IdentifiedRecord {
  name?: LegacyValue;
  qty?: LegacyValue;
  price?: LegacyValue;
}

export interface RecipeLine extends IdentifiedRecord {
  ingredientId: LegacyValue;
  qty: LegacyValue;
  unit: LegacyValue;
}

export interface CostingRecipe extends IdentifiedRecord {
  name?: LegacyValue;
  yield?: LegacyValue;
  lines?: RecipeLine[];
}

export interface PackagingLine extends IdentifiedRecord {
  packagingId: LegacyValue;
  qty: LegacyValue;
}

export interface CostingProduct extends IdentifiedRecord {
  name?: LegacyValue;
  recipeId?: LegacyValue;
  price?: LegacyValue;
  targetMargin?: LegacyValue;
  packLines?: PackagingLine[];
}

export interface MixtureDraft {
  data?: {
    name?: LegacyValue;
    components?: IngredientComponent[];
    [key: string]: LegacyValue;
  };
  [key: string]: LegacyValue;
}

export interface CostingState {
  ingredients: CostingIngredient[];
  packaging: PackagingItem[];
  recipes: CostingRecipe[];
  products: CostingProduct[];
  mixtureDrafts?: MixtureDraft[];
  [key: string]: LegacyValue;
}

export interface IngredientCostInfo {
  valid: boolean;
  costPerBase: number;
  batchCost: number;
  error: string;
}

export type IngredientLookup = (
  id: LegacyValue,
) => CostingIngredient | null | undefined;

export interface ProductCostingSnapshotResult {
  snapshot: unknown;
  sellingPriceCentavos: number;
  ingredientCostCentavos: number;
  packagingCostCentavos: number;
}

export interface CostingValidationResult {
  valid: boolean;
  error: string;
}
