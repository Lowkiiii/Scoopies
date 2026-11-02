import {
  categoryOptions,
  escapeHtml,
  ingredientMatchesView,
  ingredientOptions,
  optionList,
  selectedRealCategory,
  unitOptions,
} from './view-helpers';
import {
  recipeBreakdownHtml,
  renderCategoryBar,
  renderIngredients,
  renderPackaging,
  renderProducts,
  renderRecipes,
} from './view-renderers';

export const COSTING_VIEW_API = {
  unitOptions,
  optionList,
  escapeHtml,
  categoryOptions,
  ingredientOptions,
  selectedRealCategory,
  ingredientMatchesView,
  renderCategoryBar,
  renderIngredients,
  renderPackaging,
  renderRecipes,
  recipeBreakdownHtml,
  renderProducts,
};
