import { readEventsBinding, runtimeValue } from './bindings';
import { activateAppTab } from './navigation';
import {
  stockInlineCommitElement,
  stockInlineHandleInput,
} from '../stocks/inline-edit';
import type { LegacyValue } from './types';

export function handleNavigationClick(event: LegacyValue): void {
  if (runtimeValue('costingSourceCommitInFlight')) return;
  const button = event.target.closest('button[data-tab]');
  if (!button) return;
  readEventsBinding('activateAppTab', activateAppTab)(
    button.dataset.tab,
    true,
  );
}

export function handleImageError(event: LegacyValue): void {
  const image = event.target;
  if (
    !image ||
    !image.classList ||
    !image.classList.contains('pos-drink-image')
  ) {
    return;
  }
  image.hidden = true;
  const fallback =
    image.parentElement &&
    image.parentElement.querySelector('.pos-drink-image-fallback');
  if (fallback) fallback.hidden = false;
}

export function handleBodyInput(event: LegacyValue): void {
  if (runtimeValue('costingSourceCommitInFlight')) return;
  const element = event.target;
  if (stockInlineHandleInput(element)) return;
  if (element.id === 'stockSearch') {
    runtimeValue('stockState').search = element.value || '';
    runtimeValue('renderStockResults')();
    return;
  }
  if (runtimeValue('stockModal').open && element.dataset.stockField) {
    if (
      ['quantity', 'reason', 'note'].indexOf(element.dataset.stockField) >= 0
    ) {
      runtimeValue('stockModal')[element.dataset.stockField] = element.value;
      runtimeValue('updateStockModalPreview')();
    }
    return;
  }
  if (runtimeValue('posOpsModal').open) {
    if (element.id === 'posPhotoZoom') {
      runtimeValue('setPosDrinkImageZoom')(element.value);
      return;
    }
    if (element.id === 'posOpeningCash') {
      runtimeValue('posOpsModal').openingCash = element.value || '';
      runtimeValue('posOpsModal').error = '';
      return;
    }
    if (element.id === 'posCountedCash') {
      runtimeValue('posOpsModal').countedCash = element.value || '';
      runtimeValue('posOpsModal').error = '';
      return;
    }
    if (element.id === 'posVerifiedGcash') {
      runtimeValue('posOpsModal').verifiedGcash = element.value || '';
      runtimeValue('posOpsModal').error = '';
      return;
    }
    if (element.id === 'posVerifiedGotyme') {
      runtimeValue('posOpsModal').verifiedGotyme = element.value || '';
      runtimeValue('posOpsModal').error = '';
      return;
    }
    if (element.id === 'posCloseNotes') {
      runtimeValue('posOpsModal').notes = element.value || '';
      runtimeValue('posOpsModal').error = '';
      return;
    }
    if (element.id === 'posVoidReason') {
      runtimeValue('posOpsModal').reason = element.value || '';
      runtimeValue('posOpsModal').error = '';
      return;
    }
    if (
      runtimeValue('posOpsModal').type === 'salesHistory' &&
      element.id === 'posHistoryDateFilter'
    ) {
      runtimeValue('posSalesHistory').filterDateInput = element.value || '';
      return;
    }
  }
  if (element.id === 'posCashReceived') {
    runtimeValue('posCheckout').cashReceived = element.value || '';
    runtimeValue('posCheckout').error = '';
    runtimeValue('updatePosPaymentPreview')();
    return;
  }
  if (element.id === 'posReference') {
    runtimeValue('posCheckout').referenceNumber = element.value || '';
    runtimeValue('posCheckout').error = '';
    return;
  }
  if (element.id === 'ingredientSearch') {
    runtimeValue('ingredientUi').search = element.value || '';
    runtimeValue('renderIngredients')();
    return;
  }
  if (
    runtimeValue('publishModalOpen') &&
    runtimeValue('publishSnapshot') &&
    element.dataset.publishField
  ) {
    runtimeValue('publishSnapshot')[element.dataset.publishField] = element.value;
    return;
  }
  const mixtureDraft = runtimeValue('mixtureDraft');
  if (!mixtureDraft) return;
  if (element.dataset.mixRoot) {
    if (element.dataset.mixRoot === 'unit') return;
    mixtureDraft[element.dataset.mixRoot] = element.value;
    runtimeValue('refreshMixtureTotals')();
    return;
  }
  if (element.dataset.mixField) {
    const row = element.closest('[data-mix-index]');
    const component =
      row && mixtureDraft.components[parseInt(row.dataset.mixIndex, 10)];
    if (component) {
      if (
        element.dataset.mixField === 'unit' ||
        element.dataset.mixField === 'ingredientId'
      ) {
        return;
      }
      component[element.dataset.mixField] = element.value;
      runtimeValue('refreshMixtureTotals')();
    }
    return;
  }
  if (element.dataset.quickField && runtimeValue('quickIngredientDraft')) {
    runtimeValue('quickIngredientDraft')[element.dataset.quickField] =
      element.value;
  }
}

export function handleBodyChange(event: LegacyValue): void {
  if (runtimeValue('costingSourceCommitInFlight')) return;
  const element = event.target;
  if (element && element.dataset.stockInlineField) {
    stockInlineCommitElement(element, false).catch(function () {});
    return;
  }
  if (element.dataset.posImageProduct) {
    const selectedFile = element.files && element.files[0];
    if (selectedFile) {
      runtimeValue('openPosDrinkImageEditor')(
        element.dataset.posImageProduct,
        selectedFile,
      ).catch(function () {});
    }
    element.value = '';
    return;
  }
  if (
    runtimeValue('posOpsModal').open &&
    runtimeValue('posOpsModal').type === 'productOptions' &&
    element.name === 'posMatchaOption'
  ) {
    runtimeValue('posOpsModal').selectedMatchaOptionId = element.value || '';
    runtimeValue('posOpsModal').error = '';
    runtimeValue('renderPosOpsModal')();
    runtimeValue('focusSoon')(
      '#posOpsModal input[name="posMatchaOption"]:checked',
    );
    return;
  }
  if (element.id === 'stockKindFilter') {
    runtimeValue('stockState').kind = element.value || 'all';
    runtimeValue('renderStockResults')();
    return;
  }
  if (runtimeValue('stockModal').open && element.dataset.stockField) {
    if (element.dataset.stockField === 'action') {
      runtimeValue('setStockModalAction')(element.value);
      return;
    }
    if (element.dataset.stockField === 'unit') {
      runtimeValue('stockModal').unit = element.value;
      runtimeValue('stockModal').pendingRpc = null;
      runtimeValue('updateStockModalPreview')();
      return;
    }
  }
  if (element.id === 'histDate') {
    runtimeValue('loadHistory')();
    return;
  }
  if (
    runtimeValue('posOpsModal').open &&
    runtimeValue('posOpsModal').type === 'salesHistory' &&
    element.id === 'posHistoryShiftFilter'
  ) {
    runtimeValue('setPosHistoryShiftFilter')(element.value).catch(
      function () {},
    );
    return;
  }
  if (
    runtimeValue('publishModalOpen') &&
    runtimeValue('publishSnapshot') &&
    element.dataset.publishField
  ) {
    runtimeValue('publishSnapshot')[element.dataset.publishField] = element.value;
    return;
  }
  const mixtureDraft = runtimeValue('mixtureDraft');
  if (mixtureDraft && element.dataset.mixRoot) {
    if (
      element.dataset.mixRoot === 'unit' &&
      runtimeValue('UNIT_TYPE')[mixtureDraft.unit] ===
        runtimeValue('UNIT_TYPE')[element.value]
    ) {
      mixtureDraft.batchYield = runtimeValue('convertUnitQuantity')(
        mixtureDraft.batchYield,
        mixtureDraft.unit,
        element.value,
      );
    }
    mixtureDraft[element.dataset.mixRoot] = element.value;
    if (element.dataset.mixRoot === 'unit') {
      runtimeValue('renderMixtureModal')();
      runtimeValue('focusSoon')('#mixtureModal [data-mix-root="unit"]');
    } else {
      runtimeValue('refreshMixtureTotals')();
    }
    return;
  }
  if (mixtureDraft && element.dataset.mixField) {
    const mixRow = element.closest('[data-mix-index]');
    const mixLine =
      mixRow &&
      mixtureDraft.components[parseInt(mixRow.dataset.mixIndex, 10)];
    if (mixLine) {
      if (element.dataset.mixField === 'ingredientId') {
        const previousMixSource = runtimeValue('draftIngredientLookup')(
          mixLine.ingredientId,
        );
        const picked = runtimeValue('draftIngredientLookup')(element.value);
        const mixIndex = mixRow.dataset.mixIndex;
        mixLine.ingredientId = element.value;
        if (picked) {
          const nextMixUnit =
            runtimeValue('TYPE_UNITS')[
              runtimeValue('UNIT_TYPE')[picked.unit]
            ][0];
          mixLine.qty =
            previousMixSource &&
            runtimeValue('UNIT_TYPE')[previousMixSource.unit] ===
              runtimeValue('UNIT_TYPE')[picked.unit]
              ? runtimeValue('convertUnitQuantity')(
                  mixLine.qty,
                  mixLine.unit,
                  nextMixUnit,
                )
              : '';
          mixLine.unit = nextMixUnit;
        } else {
          mixLine.qty = '';
        }
        runtimeValue('renderMixtureModal')();
        runtimeValue('focusSoon')(
          '#mixtureModal [data-mix-index="' +
            mixIndex +
            '"] [data-mix-field="qty"]',
        );
      } else {
        if (
          element.dataset.mixField === 'unit' &&
          runtimeValue('UNIT_TYPE')[mixLine.unit] ===
            runtimeValue('UNIT_TYPE')[element.value]
        ) {
          mixLine.qty = runtimeValue('convertUnitQuantity')(
            mixLine.qty,
            mixLine.unit,
            element.value,
          );
        }
        mixLine[element.dataset.mixField] = element.value;
        runtimeValue('refreshMixtureTotals')();
      }
    }
    return;
  }
  if (runtimeValue('quickIngredientDraft') && element.dataset.quickField) {
    runtimeValue('quickIngredientDraft')[element.dataset.quickField] =
      element.value;
    return;
  }
  if (!element.dataset.field) {
    runtimeValue('handleFileImport')(event);
    return;
  }
  const row = element.closest('[data-entity]');
  if (!row) return;
  const entity = row.dataset.entity;
  const id = row.dataset.id;
  const field = element.dataset.field;
  const value = element.value;
  const index = row.dataset.idx;
  const lineId = row.dataset.lineId;
  runtimeValue('consumePendingRemoteForCommit')(false);
  const state = runtimeValue('state');
  if (entity === 'ingredient') {
    const ingredient = runtimeValue('getById')(state.ingredients, id);
    if (ingredient) {
      if (field === 'unit' && ingredient.unit !== value) {
        runtimeValue('changeIngredientUnitSafely')(id, value).catch(
          function () {},
        );
        return;
      }
      ingredient[field] = value;
    }
  } else if (entity === 'packaging') {
    const packaging = runtimeValue('getById')(state.packaging, id);
    if (packaging) packaging[field] = value;
  } else if (entity === 'recipe') {
    const recipe = runtimeValue('getById')(state.recipes, id);
    if (recipe) recipe[field] = value;
  } else if (entity === 'recipeLine') {
    const recipe = runtimeValue('getById')(state.recipes, id);
    if (recipe) {
      const line = lineId
        ? runtimeValue('getById')(recipe.lines, lineId)
        : recipe.lines[index];
      if (!line) {
        runtimeValue('alert')(
          'That recipe row changed on another device. Please try again.',
        );
        runtimeValue('renderAll')();
        return;
      }
      if (field === 'ingredientId') {
        const previousRecipeSource = runtimeValue('getById')(
          state.ingredients,
          line.ingredientId,
        );
        const nextRecipeSource = runtimeValue('getById')(
          state.ingredients,
          value,
        );
        line.ingredientId = value;
        if (nextRecipeSource) {
          const nextRecipeUnit =
            runtimeValue('TYPE_UNITS')[
              runtimeValue('UNIT_TYPE')[nextRecipeSource.unit]
            ][0];
          line.qty =
            previousRecipeSource &&
            runtimeValue('UNIT_TYPE')[previousRecipeSource.unit] ===
              runtimeValue('UNIT_TYPE')[nextRecipeSource.unit]
              ? runtimeValue('convertUnitQuantity')(
                  line.qty,
                  line.unit,
                  nextRecipeUnit,
                )
              : '';
          line.unit = nextRecipeUnit;
        } else {
          line.qty = '';
        }
      } else {
        if (
          field === 'unit' &&
          runtimeValue('UNIT_TYPE')[line.unit] ===
            runtimeValue('UNIT_TYPE')[value]
        ) {
          line.qty = runtimeValue('convertUnitQuantity')(
            line.qty,
            line.unit,
            value,
          );
        }
        line[field] = value;
      }
    }
  } else if (entity === 'product') {
    const product = runtimeValue('getById')(state.products, id);
    if (product) {
      if (field === 'recipeId') {
        const oldRecipe = runtimeValue('getById')(
          state.recipes,
          product.recipeId,
        );
        const newRecipe = runtimeValue('getById')(state.recipes, value);
        const currentName = String(product.name || '').trim();
        const oldRecipeName = oldRecipe
          ? String(oldRecipe.name || '').trim()
          : '';
        if (!currentName || (oldRecipeName && currentName === oldRecipeName)) {
          product.name = newRecipe ? newRecipe.name : '';
        }
      }
      product[field] = value;
    }
  } else if (entity === 'packLine') {
    const product = runtimeValue('getById')(state.products, id);
    if (product) {
      const line = lineId
        ? runtimeValue('getById')(product.packLines, lineId)
        : product.packLines[index];
      if (!line) {
        runtimeValue('alert')(
          'That packaging row changed on another device. Please try again.',
        );
        runtimeValue('renderAll')();
        return;
      }
      line[field] = value;
    }
  }
  runtimeValue('logChanges')();
  runtimeValue('save')();
  runtimeValue('renderAll')();
}
