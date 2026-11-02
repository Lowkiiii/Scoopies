import { getById } from '../core';
import { readCostingBinding, readRuntimeBinding } from './bindings';
import { isMixture } from './ingredients';
import type { CostingIngredient, CostingState, LegacyValue } from './types';

type IngredientUi = {
  category: LegacyValue;
  search: LegacyValue;
};

type GetById = typeof getById;
type IsMixture = typeof isMixture;

function runtimeState(): CostingState {
  return readRuntimeBinding('state', undefined as unknown as CostingState);
}

function runtimeIngredientUi(): IngredientUi {
  return readRuntimeBinding(
    'ingredientUi',
    undefined as unknown as IngredientUi,
  );
}

function runtimeGetById(): GetById {
  return readRuntimeBinding('getById', getById);
}

function runtimeString(): StringConstructor {
  return readRuntimeBinding(
    'String',
    undefined as unknown as StringConstructor,
  );
}

function liveEscapeHtml(): typeof escapeHtml {
  return readCostingBinding('escapeHtml', escapeHtml);
}

function liveIsMixture(): IsMixture {
  return readCostingBinding('isMixture', isMixture);
}

export const unitOptions: LegacyValue[] = ['g', 'kg', 'ml', 'l', 'piece'];

export function optionList(
  arr: LegacyValue,
  selected: LegacyValue,
  useObj?: LegacyValue,
): string {
  return arr
    .map((option: LegacyValue) => {
      const value = useObj ? option.id : option;
      const label = useObj ? option.name : option;
      return (
        '<option value="' +
        liveEscapeHtml()(value) +
        '"' +
        (runtimeString()(value) === runtimeString()(selected)
          ? ' selected'
          : '') +
        '>' +
        liveEscapeHtml()(label || '(unnamed)') +
        '</option>'
      );
    })
    .join('');
}

export function escapeHtml(value: LegacyValue): string {
  return runtimeString()(value == null ? '' : value).replace(
    /[&<>"]/g,
    (character: string) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
      })[character] as string,
  );
}

export function categoryOptions(selected: LegacyValue): string {
  return (
    '<option value=""' +
    (!selected ? ' selected' : '') +
    '>Uncategorized</option>' +
    runtimeState()
      .ingredientCategories.map(
        (category: LegacyValue) =>
          '<option value="' +
          liveEscapeHtml()(category.id) +
          '"' +
          (category.id === selected ? ' selected' : '') +
          '>' +
          liveEscapeHtml()(category.name) +
          '</option>',
      )
      .join('')
  );
}

export function ingredientOptions(
  selected: LegacyValue,
  list?: LegacyValue,
): string {
  list = list || runtimeState().ingredients;
  const purchased = list.filter(
    (ingredient: CostingIngredient) => !liveIsMixture()(ingredient),
  );
  const mixtures = list.filter(liveIsMixture());

  function options(ingredients: CostingIngredient[]): string {
    return ingredients
      .map(
        (ingredient) =>
          '<option value="' +
          liveEscapeHtml()(ingredient.id) +
          '"' +
          (ingredient.id === selected ? ' selected' : '') +
          '>' +
          liveEscapeHtml()(ingredient.name || '(unnamed)') +
          '</option>',
      )
      .join('');
  }

  return (
    (purchased.length
      ? '<optgroup label="Purchased ingredients">' +
        options(purchased) +
        '</optgroup>'
      : '') +
    (mixtures.length
      ? '<optgroup label="Prepared mixtures">' +
        options(mixtures) +
        '</optgroup>'
      : '')
  );
}

export function selectedRealCategory(): LegacyValue {
  return runtimeGetById()(
    runtimeState().ingredientCategories,
    runtimeIngredientUi().category,
  );
}

export function ingredientMatchesView(ingredient: CostingIngredient): boolean {
  if (
    runtimeIngredientUi().category === 'uncategorized' &&
    ingredient.categoryId
  ) {
    return false;
  }
  if (
    runtimeIngredientUi().category !== 'all' &&
    runtimeIngredientUi().category !== 'uncategorized' &&
    ingredient.categoryId !== runtimeIngredientUi().category
  ) {
    return false;
  }
  const query = runtimeIngredientUi().search.trim().toLowerCase();
  if (!query) return true;
  const category = runtimeGetById()(
    runtimeState().ingredientCategories,
    ingredient.categoryId,
  );
  let haystack =
    (ingredient.name || '') +
    ' ' +
    (category ? (category as LegacyValue).name : 'Uncategorized');
  if (liveIsMixture()(ingredient)) {
    (ingredient.components || []).forEach((component) => {
      const source = runtimeGetById()(
        runtimeState().ingredients,
        component.ingredientId,
      );
      if (source) {
        haystack += ' ' + ((source as CostingIngredient).name || '');
      }
    });
  }
  return haystack.toLowerCase().indexOf(query) >= 0;
}
