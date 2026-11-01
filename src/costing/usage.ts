import { readCostingBinding, readCostingState } from './bindings';
import { isMixture } from './ingredients';
import type { LegacyValue } from './types';

export function ingredientUsage(id: LegacyValue): string[] {
  const uses: string[] = [];
  readCostingState().recipes.forEach((recipe) => {
    if (
      (recipe.lines || []).some((line) => line.ingredientId === id)
    ) {
      uses.push('recipe "' + (recipe.name || 'untitled') + '"');
    }
  });
  readCostingState().ingredients.forEach((ingredient) => {
    if (
      readCostingBinding('isMixture', isMixture)(ingredient) &&
      (ingredient.components || []).some(
        (component) => component.ingredientId === id,
      )
    ) {
      uses.push('mixture "' + (ingredient.name || 'untitled') + '"');
    }
  });
  (readCostingState().mixtureDrafts || []).forEach((draft) => {
    const data = draft.data || {};
    if (
      (data.components || []).some(
        (component) => component.ingredientId === id,
      )
    ) {
      uses.push(
        'draft "' + (data.name || 'untitled combined cost') + '"',
      );
    }
  });
  return uses;
}

export function packagingUsage(id: LegacyValue): string[] {
  return readCostingState()
    .products.filter((product) =>
      (product.packLines || []).some(
        (line) => line.packagingId === id,
      ),
    )
    .map((product) => 'product "' + (product.name || 'untitled') + '"');
}

export function recipeUsage(id: LegacyValue): string[] {
  return readCostingState()
    .products.filter((product) => product.recipeId === id)
    .map((product) => 'product "' + (product.name || 'untitled') + '"');
}
