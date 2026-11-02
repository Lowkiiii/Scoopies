import {
  TYPE_UNITS,
  UNIT_TYPE,
  ceilTo,
  getById,
  num,
  pct,
  peso,
} from '../core';
import { readCostingBinding, readRuntimeBinding } from './bindings';
import {
  ingredientBaseUnit,
  ingredientCostInfo,
  ingCostPerBase,
  isMixture,
} from './ingredients';
import {
  lineCost,
  packagingLineCost,
  pkgCostPerPiece,
  productCost,
  recipePerServing,
  recipeTotal,
  suggestedPrice,
} from './recipes-products';
import type {
  CostingIngredient,
  CostingProduct,
  CostingRecipe,
  CostingState,
  LegacyValue,
  PackagingItem,
  PackagingLine,
  RecipeLine,
} from './types';
import {
  categoryOptions,
  escapeHtml,
  ingredientMatchesView,
  ingredientOptions,
  optionList,
  selectedRealCategory,
  unitOptions,
} from './view-helpers';

type IngredientUi = {
  category: LegacyValue;
  search: LegacyValue;
};

type GetById = typeof getById;
type Num = typeof num;
type Peso = typeof peso;
type Pct = typeof pct;
type CeilTo = typeof ceilTo;
type IsFinite = typeof globalThis.isFinite;
type PublicationHtml = (product: CostingProduct) => string;

function runtimeState(): CostingState {
  return readRuntimeBinding('state', undefined as unknown as CostingState);
}

function runtimeIngredientUi(): IngredientUi {
  return readRuntimeBinding(
    'ingredientUi',
    undefined as unknown as IngredientUi,
  );
}

function runtimeDocument(): Document {
  return readRuntimeBinding('document', undefined as unknown as Document);
}

function runtimeGetById(): GetById {
  return readRuntimeBinding('getById', getById);
}

function runtimeNum(): Num {
  return readRuntimeBinding('num', num);
}

function runtimePeso(): Peso {
  return readRuntimeBinding('peso', peso);
}

function runtimePct(): Pct {
  return readRuntimeBinding('pct', pct);
}

function runtimeCeilTo(): CeilTo {
  return readRuntimeBinding('ceilTo', ceilTo);
}

function runtimeIsFinite(): IsFinite {
  return readRuntimeBinding(
    'isFinite',
    undefined as unknown as IsFinite,
  );
}

function runtimeUnitType(): Record<string, LegacyValue> {
  return readRuntimeBinding(
    'UNIT_TYPE',
    UNIT_TYPE as Record<string, LegacyValue>,
  );
}

function runtimeTypeUnits(): Record<string, LegacyValue> {
  return readRuntimeBinding(
    'TYPE_UNITS',
    TYPE_UNITS as Record<string, LegacyValue>,
  );
}

function runtimePublicationHtml(): PublicationHtml {
  return readRuntimeBinding(
    'posPublicationHtml',
    undefined as unknown as PublicationHtml,
  );
}

function liveUnitOptions(): LegacyValue[] {
  return readCostingBinding('unitOptions', unitOptions);
}

function liveOptionList(): typeof optionList {
  return readCostingBinding('optionList', optionList);
}

function liveEscapeHtml(): typeof escapeHtml {
  return readCostingBinding('escapeHtml', escapeHtml);
}

function liveCategoryOptions(): typeof categoryOptions {
  return readCostingBinding('categoryOptions', categoryOptions);
}

function liveIngredientOptions(): typeof ingredientOptions {
  return readCostingBinding('ingredientOptions', ingredientOptions);
}

function liveSelectedRealCategory(): typeof selectedRealCategory {
  return readCostingBinding('selectedRealCategory', selectedRealCategory);
}

function liveIngredientMatchesView(): typeof ingredientMatchesView {
  return readCostingBinding('ingredientMatchesView', ingredientMatchesView);
}

function liveRenderCategoryBar(): typeof renderCategoryBar {
  return readCostingBinding('renderCategoryBar', renderCategoryBar);
}

function liveIsMixture(): typeof isMixture {
  return readCostingBinding('isMixture', isMixture);
}

function liveIngredientBaseUnit(): typeof ingredientBaseUnit {
  return readCostingBinding('ingredientBaseUnit', ingredientBaseUnit);
}

function liveIngredientCostInfo(): typeof ingredientCostInfo {
  return readCostingBinding('ingredientCostInfo', ingredientCostInfo);
}

function liveIngCostPerBase(): typeof ingCostPerBase {
  return readCostingBinding('ingCostPerBase', ingCostPerBase);
}

function livePkgCostPerPiece(): typeof pkgCostPerPiece {
  return readCostingBinding('pkgCostPerPiece', pkgCostPerPiece);
}

function liveLineCost(): typeof lineCost {
  return readCostingBinding('lineCost', lineCost);
}

function liveRecipeTotal(): typeof recipeTotal {
  return readCostingBinding('recipeTotal', recipeTotal);
}

function liveRecipePerServing(): typeof recipePerServing {
  return readCostingBinding('recipePerServing', recipePerServing);
}

function liveProductCost(): typeof productCost {
  return readCostingBinding('productCost', productCost);
}

function liveSuggestedPrice(): typeof suggestedPrice {
  return readCostingBinding('suggestedPrice', suggestedPrice);
}

function livePackagingLineCost(): typeof packagingLineCost {
  return readCostingBinding('packagingLineCost', packagingLineCost);
}

function liveRecipeBreakdownHtml(): typeof recipeBreakdownHtml {
  return readCostingBinding('recipeBreakdownHtml', recipeBreakdownHtml);
}

export function renderCategoryBar(): void {
  if (
    runtimeIngredientUi().category !== 'all' &&
    runtimeIngredientUi().category !== 'uncategorized' &&
    !runtimeGetById()(
      runtimeState().ingredientCategories,
      runtimeIngredientUi().category,
    )
  ) {
    runtimeIngredientUi().category = 'all';
  }
  const bar = runtimeDocument().getElementById('categoryBar');
  if (!bar) return;

  function chip(id: LegacyValue, label: LegacyValue, count: LegacyValue): string {
    const active = runtimeIngredientUi().category === id;
    return (
      '<button class="category-chip' +
      (active ? ' active' : '') +
      '" data-act="setIngredientCategory" data-id="' +
      liveEscapeHtml()(id) +
      '" aria-pressed="' +
      (active ? 'true' : 'false') +
      '">' +
      liveEscapeHtml()(label) +
      ' (' +
      count +
      ')</button>'
    );
  }

  let html = chip('all', 'All', runtimeState().ingredients.length);
  runtimeState().ingredientCategories.forEach((category: LegacyValue) => {
    html += chip(
      category.id,
      category.name,
      runtimeState().ingredients.filter(
        (ingredient) => ingredient.categoryId === category.id,
      ).length,
    );
  });
  html += chip(
    'uncategorized',
    'Uncategorized',
    runtimeState().ingredients.filter((ingredient) => !ingredient.categoryId)
      .length,
  );
  const selected = liveSelectedRealCategory()();
  if (selected) {
    html +=
      '<span class="category-tools"><button class="btn small secondary" data-act="editCategory" data-id="' +
      liveEscapeHtml()(selected.id) +
      '">Rename</button><button class="btn small danger" data-act="deleteCategory" data-id="' +
      liveEscapeHtml()(selected.id) +
      '">Delete folder</button></span>';
  }
  bar.innerHTML = html;
}

export function renderIngredients(): void {
  liveRenderCategoryBar()();
  const searchInput = runtimeDocument().getElementById(
    'ingredientSearch',
  ) as HTMLInputElement | null;
  if (
    searchInput &&
    searchInput.value !== runtimeIngredientUi().search
  ) {
    searchInput.value = runtimeIngredientUi().search;
  }
  const table = runtimeDocument().getElementById('ingTable') as HTMLElement;
  const visible = runtimeState().ingredients.filter(
    liveIngredientMatchesView(),
  );
  const status = runtimeDocument().getElementById('ingredientSearchStatus');
  if (status) {
    status.textContent =
      runtimeIngredientUi().search || runtimeIngredientUi().category !== 'all'
        ? 'Showing ' +
          visible.length +
          ' of ' +
          runtimeState().ingredients.length +
          ' ingredient' +
          (runtimeState().ingredients.length === 1 ? '' : 's')
        : ' ' +
          runtimeState().ingredients.length +
          ' ingredient' +
          (runtimeState().ingredients.length === 1 ? '' : 's');
  }
  const rows = visible
    .map((ingredient: CostingIngredient) => {
      const costPerBase = liveIngCostPerBase()(ingredient);
      const baseUnit = liveIngredientBaseUnit()(ingredient);
      const id = liveEscapeHtml()(ingredient.id);
      if (liveIsMixture()(ingredient)) {
        const info = liveIngredientCostInfo()(ingredient);
        const count = (ingredient.components || []).length;
        return (
          '<tr data-entity="ingredient" data-id="' +
          id +
          '">' +
          '<td><div class="ingredient-name-text">' +
          liveEscapeHtml()(ingredient.name || '(unnamed mixture)') +
          '</div><span class="type-badge">Prepared mixture</span><div class="mixture-meta">' +
          count +
          ' component' +
          (count === 1 ? '' : 's') +
          (info.valid ? '' : ' · Needs attention') +
          '</div></td>' +
          '<td><select data-field="categoryId" aria-label="Category for ' +
          liveEscapeHtml()(ingredient.name || 'mixture') +
          '">' +
          liveCategoryOptions()(ingredient.categoryId) +
          '</select></td>' +
          '<td><span class="pill">Combined</span></td>' +
          '<td class="calc">' +
          liveEscapeHtml()(ingredient.batchYield || '—') +
          '</td>' +
          '<td>' +
          liveEscapeHtml()(ingredient.unit) +
          '</td>' +
          '<td class="calc">' +
          runtimePeso()(info.batchCost) +
          '</td>' +
          '<td class="calc">' +
          runtimePeso()(costPerBase) +
          ' / ' +
          baseUnit +
          '</td>' +
          '<td><div class="row"><button class="btn small secondary" data-act="editMixture" data-id="' +
          id +
          '">View / Edit</button><button class="btn danger" data-act="delIngredient" data-id="' +
          id +
          '">Delete</button></div></td></tr>'
        );
      }
      const purchaseQty =
        ingredient.purchaseQty != null ? ingredient.purchaseQty : 1;
      const amountPerItem =
        ingredient.amountPerItem != null
          ? ingredient.amountPerItem
          : ingredient.qty;
      return (
        '<tr data-entity="ingredient" data-id="' +
        id +
        '">' +
        '<td><input data-field="name" value="' +
        liveEscapeHtml()(ingredient.name) +
        '" placeholder="e.g. Flour"><span class="type-badge purchased">Purchased</span></td>' +
        '<td><select data-field="categoryId" aria-label="Ingredient category">' +
        liveCategoryOptions()(ingredient.categoryId) +
        '</select></td>' +
        '<td><input data-field="purchaseQty" type="number" min="0" step="any" value="' +
        liveEscapeHtml()(purchaseQty) +
        '" placeholder="e.g. 3"></td>' +
        '<td><input data-field="amountPerItem" type="number" min="0" step="any" value="' +
        liveEscapeHtml()(amountPerItem) +
        '" placeholder="e.g. 330"></td>' +
        '<td><select data-field="unit">' +
        liveOptionList()(liveUnitOptions(), ingredient.unit) +
        '</select></td>' +
        '<td><input data-field="price" type="number" min="0" step="any" value="' +
        liveEscapeHtml()(ingredient.price) +
        '"></td>' +
        '<td class="calc">' +
        runtimePeso()(costPerBase) +
        ' / ' +
        baseUnit +
        '</td>' +
        '<td><button class="btn danger" data-act="delIngredient" data-id="' +
        id +
        '">Delete</button></td></tr>'
      );
    })
    .join('');
  const empty = runtimeState().ingredients.length
    ? 'No ingredients match this search or folder.'
    : 'No ingredients yet. Click "Add ingredient" or "Add combined cost".';
  table.innerHTML =
    '<tr><th>Ingredient</th><th>Category</th><th>Qty bought</th><th>Amount each / yield</th><th>Unit</th><th>Total / batch cost</th><th>Cost per unit</th><th></th></tr>' +
    (rows || '<tr><td colspan="8" class="empty">' + empty + '</td></tr>');
}

export function renderPackaging(): void {
  const table = runtimeDocument().getElementById('pkgTable') as HTMLElement;
  const rows = runtimeState()
    .packaging.map(
      (packaging: PackagingItem) =>
        '<tr data-entity="packaging" data-id="' +
        packaging.id +
        '">' +
        '<td><input data-field="name" value="' +
        liveEscapeHtml()(packaging.name) +
        '" placeholder="e.g. Container"></td>' +
        '<td><input data-field="qty" type="number" min="0" step="any" value="' +
        liveEscapeHtml()(packaging.qty) +
        '" placeholder="per pack"></td>' +
        '<td><input data-field="price" type="number" min="0" step="any" value="' +
        liveEscapeHtml()(packaging.price) +
        '" placeholder="pack price"></td>' +
        '<td class="calc">' +
        runtimePeso()(livePkgCostPerPiece()(packaging)) +
        ' / piece</td>' +
        '<td><button class="btn danger" data-act="delPackaging" data-id="' +
        packaging.id +
        '">Delete</button></td></tr>',
    )
    .join('');
  table.innerHTML =
    '<tr><th>Item</th><th>Pieces per pack</th><th>Pack price (₱)</th><th>Cost per piece</th><th></th></tr>' +
    (rows ||
      '<tr><td colspan="5" class="empty">No packaging yet. Tip: if you buy 1 piece at a time, put 1 as the pack quantity.</td></tr>');
}

export function renderRecipes(): void {
  const wrapper = runtimeDocument().getElementById('recipeList') as HTMLElement;
  if (!runtimeState().recipes.length) {
    wrapper.innerHTML =
      '<div class="card"><p class="empty">No recipes yet. Click "Add recipe" to build one from your ingredients.</p></div>';
    return;
  }
  wrapper.innerHTML = runtimeState()
    .recipes.map((recipe: CostingRecipe) => {
      const lineRows = (recipe.lines || [])
        .map((line: RecipeLine, index: number) => {
          const ingredient = runtimeGetById()(
            runtimeState().ingredients,
            line.ingredientId,
          );
          const type = ingredient
            ? runtimeUnitType()[ingredient.unit as string]
            : 'weight';
          const allowed =
            runtimeTypeUnits()[type as string] || liveUnitOptions();
          return (
            '<tr class="lines" data-entity="recipeLine" data-id="' +
            recipe.id +
            '" data-idx="' +
            index +
            '" data-line-id="' +
            liveEscapeHtml()(line.id) +
            '">' +
            '<td><div class="row"><select data-field="ingredientId" style="flex:1;min-width:180px"><option value="">— pick ingredient —</option>' +
            liveIngredientOptions()(line.ingredientId) +
            '</select>' +
            (liveIsMixture()(ingredient)
              ? '<button class="btn small secondary" data-act="viewMixture" data-id="' +
                liveEscapeHtml()((ingredient as CostingIngredient).id) +
                '">View mixture</button>'
              : '') +
            '</div></td>' +
            '<td><input data-field="qty" type="number" min="0" step="any" value="' +
            liveEscapeHtml()(line.qty) +
            '"></td>' +
            '<td><select data-field="unit">' +
            liveOptionList()(allowed, line.unit) +
            '</select></td>' +
            '<td class="calc">' +
            runtimePeso()(liveLineCost()(line)) +
            '</td>' +
            '<td><button class="btn danger" data-act="delLine" data-id="' +
            recipe.id +
            '" data-idx="' +
            index +
            '" data-line-id="' +
            liveEscapeHtml()(line.id) +
            '">✕</button></td></tr>'
          );
        })
        .join('');
      return (
        '<div class="card" data-entity="recipe" data-id="' +
        recipe.id +
        '">' +
        '<div class="grid2">' +
        '<div><label class="fld">Recipe name</label><input data-field="name" value="' +
        liveEscapeHtml()(recipe.name) +
        '" placeholder="e.g. Chocolate Cookie"></div>' +
        '<div><label class="fld">Yield — how many servings/cups one batch makes</label><input data-field="yield" type="number" min="0" step="any" value="' +
        liveEscapeHtml()(recipe.yield) +
        '"></div>' +
        '</div>' +
        '<div class="scroll" style="margin-top:12px"><table><tr><th>Ingredient</th><th>Qty used</th><th>Unit</th><th>Cost</th><th></th></tr>' +
        (lineRows ||
          '<tr><td colspan="5" class="empty">No ingredients added.</td></tr>') +
        '</table></div>' +
        '<div class="row" style="margin-top:10px">' +
        '<button class="btn small secondary" data-act="addLine" data-id="' +
        recipe.id +
        '">+ Add ingredient</button>' +
        '<div class="spacer"></div>' +
        '<button class="btn danger" data-act="delRecipe" data-id="' +
        recipe.id +
        '">Delete recipe</button></div>' +
        '<div class="metrics">' +
        '<div class="metric"><div class="lbl">Total recipe cost</div><div class="val">' +
        runtimePeso()(liveRecipeTotal()(recipe)) +
        '</div></div>' +
        '<div class="metric"><div class="lbl">Cost per serving</div><div class="val">' +
        runtimePeso()(liveRecipePerServing()(recipe)) +
        '</div></div>' +
        '</div></div>'
      );
    })
    .join('');
}

export function recipeBreakdownHtml(
  recipe: CostingRecipe | null | undefined,
): string {
  if (!recipe) return '';
  const yieldCount = runtimeNum()(recipe.yield);
  const rows = (recipe.lines || [])
    .map((line: RecipeLine) => {
      const ingredient = runtimeGetById()(
        runtimeState().ingredients,
        line.ingredientId,
      );
      const cost =
        yieldCount > 0 ? liveLineCost()(line) / yieldCount : NaN;
      return (
        '<tr><td>' +
        liveEscapeHtml()(
          ingredient ? ingredient.name : 'Missing ingredient',
        ) +
        (liveIsMixture()(ingredient)
          ? ' <span class="type-badge">Mixture</span>'
          : '') +
        '</td><td>' +
        liveEscapeHtml()(line.qty) +
        ' ' +
        liveEscapeHtml()(line.unit) +
        '</td><td class="calc">' +
        runtimePeso()(cost) +
        '</td><td>' +
        (liveIsMixture()(ingredient)
          ? '<button class="btn small secondary" data-act="viewMixture" data-id="' +
            liveEscapeHtml()((ingredient as CostingIngredient).id) +
            '">View</button>'
          : '') +
        '</td></tr>'
      );
    })
    .join('');
  return (
    '<details class="cost-breakdown"><summary>View food-cost breakdown</summary><div class="scroll" style="margin-top:8px"><table><tr><th>Ingredient</th><th>Recipe quantity</th><th>Cost / serving</th><th></th></tr>' +
    (rows ||
      '<tr><td colspan="4" class="empty">No recipe ingredients.</td></tr>') +
    '</table></div></details>'
  );
}

export function renderProducts(): void {
  const wrapper = runtimeDocument().getElementById(
    'productList',
  ) as HTMLElement;
  if (!runtimeState().products.length) {
    wrapper.innerHTML =
      '<div class="card"><p class="empty">No products yet. A product = a recipe + its packaging + your target margin. Click "Add product".</p></div>';
    return;
  }
  wrapper.innerHTML = runtimeState()
    .products.map((product: CostingProduct) => {
      const recipe = runtimeGetById()(
        runtimeState().recipes,
        product.recipeId,
      );
      const foodCost = recipe ? liveRecipePerServing()(recipe) : NaN;
      const cost = liveProductCost()(product);
      const suggested = liveSuggestedPrice()(cost, product.targetMargin);
      const price = runtimeNum()(product.price);
      const profit = price - cost;
      const marginPercentage = price > 0 ? (profit / price) * 100 : 0;
      const markupPercentage =
        runtimeIsFinite()(cost) && cost > 0
          ? (profit / cost) * 100
          : runtimeIsFinite()(cost)
            ? 0
            : NaN;
      const foodPercentage = price > 0 ? (foodCost / price) * 100 : 0;
      const totalPercentage = price > 0 ? (cost / price) * 100 : 0;
      const packagingRows = (product.packLines || [])
        .map((line: PackagingLine, index: number) => {
          runtimeGetById()(runtimeState().packaging, line.packagingId);
          return (
            '<tr class="lines" data-entity="packLine" data-id="' +
            product.id +
            '" data-idx="' +
            index +
            '" data-line-id="' +
            liveEscapeHtml()(line.id) +
            '">' +
            '<td><select data-field="packagingId"><option value="">— pick packaging —</option>' +
            liveOptionList()(
              runtimeState().packaging,
              line.packagingId,
              true,
            ) +
            '</select></td>' +
            '<td><input data-field="qty" type="number" min="0" step="any" value="' +
            liveEscapeHtml()(line.qty) +
            '"></td>' +
            '<td class="calc">' +
            runtimePeso()(livePackagingLineCost()(line)) +
            '</td>' +
            '<td><button class="btn danger" data-act="delPkgLine" data-id="' +
            product.id +
            '" data-idx="' +
            index +
            '" data-line-id="' +
            liveEscapeHtml()(line.id) +
            '">✕</button></td></tr>'
          );
        })
        .join('');
      return (
        '<div class="card" data-entity="product" data-id="' +
        product.id +
        '">' +
        '<div class="grid2">' +
        '<div><label class="fld">Product name (auto-filled, editable)</label><input data-field="name" value="' +
        liveEscapeHtml()(product.name) +
        '" placeholder="e.g. Coconut Matcha Cloud 16 oz"></div>' +
        '<div><label class="fld">Recipe</label><select data-field="recipeId"><option value="">— pick recipe —</option>' +
        liveOptionList()(runtimeState().recipes, product.recipeId, true) +
        '</select></div>' +
        '</div>' +
        '<p class="hint" style="margin:10px 0 4px">Food cost per serving from recipe: <span class="pill">' +
        (recipe ? runtimePeso()(liveRecipePerServing()(recipe)) : '—') +
        '</span></p>' +
        liveRecipeBreakdownHtml()(recipe) +
        '<div class="scroll"><table><tr><th>Packaging used</th><th>Qty</th><th>Cost</th><th></th></tr>' +
        (packagingRows ||
          '<tr><td colspan="4" class="empty">No packaging added.</td></tr>') +
        '</table></div>' +
        '<button class="btn small secondary" data-act="addPkgLine" data-id="' +
        product.id +
        '" style="margin-top:8px">+ Add packaging</button>' +
        '<div class="grid2" style="margin-top:14px">' +
        '<div><label class="fld">Target profit margin (%)</label><input data-field="targetMargin" type="number" min="0" max="95" step="any" value="' +
        liveEscapeHtml()(product.targetMargin) +
        '"></div>' +
        '<div><label class="fld">Your selling price (₱)</label><div class="row"><input data-field="price" type="number" min="0" step="any" value="' +
        liveEscapeHtml()(product.price) +
        '">' +
        '<button class="btn small" data-act="useSuggested" data-id="' +
        product.id +
        '">Use ₱' +
        (runtimeIsFinite()(suggested)
          ? runtimeCeilTo()(suggested, 5)
          : '—') +
        '</button></div></div>' +
        '</div>' +
        '<div class="metrics">' +
        '<div class="metric"><div class="lbl">Total cost</div><div class="val">' +
        runtimePeso()(cost) +
        '</div></div>' +
        '<div class="metric"><div class="lbl">Suggested price (' +
        runtimePct()(runtimeNum()(product.targetMargin)) +
        ' margin)</div><div class="val">' +
        runtimePeso()(suggested) +
        '</div></div>' +
        '<div class="metric"><div class="lbl">Gross profit</div><div class="val ' +
        (profit >= 0 ? 'good' : 'bad') +
        '">' +
        runtimePeso()(profit) +
        '</div></div>' +
        '<div class="metric"><div class="lbl">Profit margin</div><div class="val ' +
        (marginPercentage >= 0 ? 'good' : 'bad') +
        '">' +
        runtimePct()(marginPercentage) +
        '</div></div>' +
        '<div class="metric"><div class="lbl">Markup</div><div class="val">' +
        runtimePct()(markupPercentage) +
        '</div></div>' +
        '<div class="metric"><div class="lbl">Food cost % (ingredients)</div><div class="val">' +
        runtimePct()(foodPercentage) +
        '</div></div>' +
        '<div class="metric"><div class="lbl">Total cost % (food + packaging)</div><div class="val">' +
        runtimePct()(totalPercentage) +
        '</div></div>' +
        '</div>' +
        runtimePublicationHtml()(product) +
        '<div class="row" style="margin-top:12px"><div class="spacer"></div><button class="btn danger" data-act="delProduct" data-id="' +
        product.id +
        '">Delete product</button></div></div>'
      );
    })
    .join('');
}
