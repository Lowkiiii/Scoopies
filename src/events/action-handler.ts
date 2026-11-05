import { runtimeValue, writeRuntimeBinding } from './bindings';
import type { LegacyValue } from './types';

const commitActions = Object.freeze([
  'deleteCategory',
  'addIngredient',
  'delIngredient',
  'addPackaging',
  'delPackaging',
  'addRecipe',
  'delRecipe',
  'addLine',
  'delLine',
  'addProduct',
  'delProduct',
  'addPkgLine',
  'delPkgLine',
  'useSuggested',
  'loadExample',
  'clearAll',
]);

export function handleActionClick(event: LegacyValue): void {
  if (runtimeValue('costingSourceCommitInFlight')) return;
  const button = event.target.closest('[data-act]');
  if (!button) return;
  if (button.tagName === 'A') event.preventDefault();
  const action = button.dataset.act;
  const id = button.dataset.id;
  const index = button.dataset.idx;
  const lineId = button.dataset.lineId;
  if (commitActions.indexOf(action) >= 0) {
    runtimeValue('consumePendingRemoteForCommit')(false);
  }
  switch (action) {
    case 'refreshStocks':
      runtimeValue('openStocks')(true).catch(function () {});
      return;
    case 'setStockStatus':
      runtimeValue('stockState').status = button.dataset.status || 'all';
      runtimeValue('renderStocks')();
      return;
    case 'openStockModal':
      runtimeValue('openStockModal')(id, button.dataset.mode);
      return;
    case 'closeStockModal':
      runtimeValue('closeStockModal')(false);
      return;
    case 'submitStockModal':
      runtimeValue('submitStockModal')().catch(function () {});
      return;
    case 'refreshPos':
      runtimeValue('openPosRegister')(true).catch(function () {});
      return;
    case 'openPosShift':
      runtimeValue('openPosShiftModal')();
      return;
    case 'setPosOpenMode':
      runtimeValue('setPosOpenMode')(button.dataset.mode);
      return;
    case 'submitPosOpenShift':
      runtimeValue('submitPosOpenShift')().catch(function () {});
      return;
    case 'openPosClose':
      runtimeValue('openPosCloseModal')();
      return;
    case 'reviewPosCloseShift':
      runtimeValue('reviewPosCloseShift')();
      return;
    case 'backPosCloseShift':
      runtimeValue('backPosCloseShift')();
      return;
    case 'submitPosCloseShift':
      runtimeValue('submitPosCloseShift')().catch(function () {});
      return;
    case 'openPosVoid':
      runtimeValue('openPosVoidModal')(id);
      return;
    case 'reviewPosVoidSale':
      runtimeValue('reviewPosVoidSale')();
      return;
    case 'backPosVoidSale':
      runtimeValue('backPosVoidSale')();
      return;
    case 'submitPosVoidSale':
      runtimeValue('submitPosVoidSale')().catch(function () {});
      return;
    case 'openPosReport':
      runtimeValue('openPosReportModal')();
      return;
    case 'openPosSalesHistory':
      runtimeValue('openPosSalesHistory')().catch(function () {});
      return;
    case 'loadOlderPosSalesHistory':
      runtimeValue('loadPosSalesHistoryPage')(
        runtimeValue('posSalesHistory').rows.length > 0,
      ).catch(function () {});
      return;
    case 'reloadPosSalesHistory':
      runtimeValue('reloadPosSalesHistory')().catch(function () {});
      return;
    case 'setPosSalesHistoryMode':
      runtimeValue('setPosSalesHistoryMode')(button.dataset.mode).catch(
        function () {},
      );
      return;
    case 'setPosSalesHistoryView':
      runtimeValue('setPosSalesHistoryView')(button.dataset.view).catch(
        function () {},
      );
      return;
    case 'retryPosSalesProductTally':
      runtimeValue('loadPosSalesProductTally')().catch(function () {});
      return;
    case 'applyPosHistoryDate':
      runtimeValue('applyPosHistoryDateFilter')().catch(function () {});
      return;
    case 'clearPosHistoryDate':
      runtimeValue('clearPosHistoryDateFilter')().catch(function () {});
      return;
    case 'loadOlderPosClosedShifts':
      runtimeValue('loadPosClosedShiftsPage')(
        runtimeValue('posSalesHistory').shiftRows.length > 0,
      ).catch(function () {});
      return;
    case 'viewPosShiftTally':
      runtimeValue('viewPosShiftTally')(id).catch(function () {});
      return;
    case 'setPosReportMode':
      runtimeValue('setPosReportMode')(button.dataset.mode).catch(
        function () {},
      );
      return;
    case 'downloadPosReport':
      runtimeValue('downloadPosReport')();
      return;
    case 'printPosReport':
      runtimeValue('printPosReport')();
      return;
    case 'closePosOpsModal':
      runtimeValue('posCloseOpsModal')(false);
      return;
    case 'openManageDrinks':
      runtimeValue('openManageDrinksModal')().catch(function () {});
      return;
    case 'cancelPosDrinkImageEditor':
      runtimeValue('cancelPosDrinkImageEditor')();
      return;
    case 'resetPosDrinkImageEditor':
      runtimeValue('resetPosDrinkImageEditor')();
      return;
    case 'adjustPosDrinkImageZoom':
      runtimeValue('adjustPosDrinkImageZoom')(button.dataset.delta);
      return;
    case 'savePosDrinkImageEditor':
      runtimeValue('savePosDrinkImageEditor')().catch(function () {});
      return;
    case 'requestRemovePosDrinkImage':
      runtimeValue('requestRemovePosDrinkImage')(id);
      return;
    case 'cancelRemovePosDrinkImage':
      runtimeValue('cancelRemovePosDrinkImage')();
      return;
    case 'confirmRemovePosDrinkImage':
      runtimeValue('confirmRemovePosDrinkImage')().catch(function () {});
      return;
    case 'setPosCategory':
      runtimeValue('posCheckout').category = id || 'all';
      runtimeValue('renderPos')();
      return;
    case 'managePosMenu':
      runtimeValue('managePosMenu')();
      return;
    case 'focusPosCart':
      runtimeValue('focusPosCart')();
      return;
    case 'addPosProduct':
      runtimeValue('addPosProduct')(id);
      return;
    case 'confirmPosProductOption':
      runtimeValue('confirmPosProductOption')();
      return;
    case 'posQtyDown':
      runtimeValue('changePosQuantity')(id, -1);
      return;
    case 'posQtyUp':
      runtimeValue('changePosQuantity')(id, 1);
      return;
    case 'removePosLine':
      runtimeValue('removePosLine')(id);
      return;
    case 'clearPosCart':
      runtimeValue('clearPosCart')();
      return;
    case 'confirmPosCartAction':
      runtimeValue('confirmPosCartAction')();
      return;
    case 'setPosPayment':
      if (
        !runtimeValue('posCheckout').pending &&
        !runtimeValue('posCheckout').submitting &&
        !runtimeValue('posCheckout').confirming &&
        ['cash', 'gcash', 'gotyme'].indexOf(button.dataset.method) >= 0
      ) {
        runtimeValue('posCheckout').paymentMethod = button.dataset.method;
        runtimeValue('posCheckout').error = '';
        runtimeValue('renderPos')();
      }
      return;
    case 'setPosCash':
      if (
        !runtimeValue('posCheckout').pending &&
        !runtimeValue('posCheckout').submitting &&
        !runtimeValue('posCheckout').confirming
      ) {
        runtimeValue('posCheckout').cashReceived = (
          Number(button.dataset.centavos || 0) / 100
        ).toFixed(2);
        runtimeValue('posCheckout').error = '';
        runtimeValue('renderPos')();
      }
      return;
    case 'acceptPosCatalogChanges':
      runtimeValue('acceptPosCatalogChanges')();
      return;
    case 'reviewPosSale':
      runtimeValue('reviewPosSale')();
      return;
    case 'confirmPosSale':
      runtimeValue('submitPosSale')();
      return;
    case 'cancelPosConfirmation':
      runtimeValue('cancelPosConfirmation')();
      return;
    case 'completePosSale':
      runtimeValue('submitPosSale')();
      return;
    case 'posNewSale':
      runtimeValue('posCheckout').lastReceipt = null;
      runtimeValue('posCheckout').confirming = false;
      runtimeValue('posCheckout').error = '';
      runtimeValue('posCheckout').notice = '';
      runtimeValue('renderPos')();
      return;
    case 'setIngredientCategory':
      runtimeValue('ingredientUi').category = id;
      runtimeValue('renderIngredients')();
      return;
    case 'openCategoryModal':
      runtimeValue('openCategoryModal')('');
      return;
    case 'editCategory':
      runtimeValue('openCategoryModal')(id);
      return;
    case 'closeCategoryModal':
      runtimeValue('closeCategoryModal')(false);
      return;
    case 'saveCategory':
      runtimeValue('saveCategory')();
      return;
    case 'deleteCategory':
      runtimeValue('deleteCategory')(id);
      return;
    case 'closePurchasedIngredientModal':
      runtimeValue('closePurchasedIngredientModal')(false);
      return;
    case 'savePurchasedIngredient':
      runtimeValue('savePurchasedIngredient')();
      return;
    case 'openMixtureModal':
      runtimeValue('openMixtureModal')('', false);
      return;
    case 'editMixture':
      runtimeValue('openMixtureModal')(id, false);
      return;
    case 'viewMixture':
      runtimeValue('openMixtureModal')(id, true);
      return;
    case 'closeMixtureModal':
      runtimeValue('requestCloseMixtureModal')();
      return;
    case 'discardMixtureChanges':
      runtimeValue('discardMixtureChanges')();
      return;
    case 'saveMixtureDraft':
      runtimeValue('saveCurrentMixtureDraft')(true, false);
      return;
    case 'openDraftsModal':
      runtimeValue('openDraftsModal')();
      return;
    case 'closeDraftsModal':
      runtimeValue('closeDraftsModal')(false, false);
      return;
    case 'resumeMixtureDraft':
      runtimeValue('resumeMixtureDraft')(id);
      return;
    case 'deleteMixtureDraft':
      runtimeValue('deleteMixtureDraft')(id);
      return;
    case 'openPublishModal':
      runtimeValue('openPublishProductModal')(id);
      return;
    case 'closePublishModal':
      runtimeValue('closePublishProductModal')();
      return;
    case 'publishProductToPos':
      runtimeValue('publishProductToPos')();
      return;
    case 'retryPosContext':
      runtimeValue('resetPosContext')('', true);
      runtimeValue('openPosRegister')(true).catch(function () {});
      return;
    case 'enableMixtureEdit':
      writeRuntimeBinding('mixtureReadOnly', false);
      runtimeValue('renderMixtureModal')();
      runtimeValue('focusSoon')('#mixtureName');
      return;
    case 'addMixtureComponent':
      runtimeValue('mixtureDraft').components.push({
        ingredientId: '',
        qty: '',
        unit: 'g',
      });
      runtimeValue('renderMixtureModal')();
      runtimeValue('focusLastMixtureField')('ingredientId');
      return;
    case 'removeMixtureComponent': {
      const nextIndex = Math.max(0, parseInt(index, 10) - 1);
      runtimeValue('mixtureDraft').components.splice(parseInt(index, 10), 1);
      runtimeValue('renderMixtureModal')();
      runtimeValue('focusSoon')(
        runtimeValue('mixtureDraft').components.length
          ? '#mixtureModal [data-mix-index="' +
              Math.min(
                nextIndex,
                runtimeValue('mixtureDraft').components.length - 1,
              ) +
              '"] [data-mix-field="ingredientId"]'
          : '#mixtureModal [data-act="addMixtureComponent"]',
      );
      return;
    }
    case 'beginQuickIngredient':
      runtimeValue('beginQuickIngredient')();
      return;
    case 'cancelQuickIngredient':
      writeRuntimeBinding('quickIngredientDraft', null);
      runtimeValue('renderMixtureModal')();
      runtimeValue('focusSoon')(
        '#mixtureModal [data-act="beginQuickIngredient"]',
      );
      return;
    case 'addQuickIngredient':
      runtimeValue('addQuickIngredient')();
      return;
    case 'saveMixture':
      runtimeValue('saveMixture')().catch(function (error: LegacyValue) {
        runtimeValue('setMixtureError')(
          runtimeValue('stockSourceGuardMessage')(error, 'change'),
        );
      });
      return;
    case 'addIngredient':
      runtimeValue('openPurchasedIngredientModal')();
      return;
    case 'delIngredient':
      runtimeValue('deleteIngredientSafely')(id).catch(function () {});
      return;
    case 'addPackaging':
      runtimeValue('state').packaging.push({
        id: runtimeValue('uid')(),
        name: '',
        qty: '',
        price: '',
      });
      break;
    case 'delPackaging': {
      const packagingUses = runtimeValue('packagingUsage')(id);
      if (packagingUses.length) {
        runtimeValue('alert')(
          'Cannot delete this packaging because it is used by ' +
            packagingUses.join(', ') +
            '. Remove or replace it there first.',
        );
        return;
      }
      runtimeValue('state').packaging = runtimeValue(
        'state',
      ).packaging.filter(function (item: LegacyValue) {
        return item.id !== id;
      });
      break;
    }
    case 'addRecipe':
      runtimeValue('state').recipes.push({
        id: runtimeValue('uid')(),
        name: '',
        yield: '',
        lines: [],
      });
      break;
    case 'delRecipe': {
      const recipeUses = runtimeValue('recipeUsage')(id);
      if (recipeUses.length) {
        runtimeValue('alert')(
          'Cannot delete this recipe because it is used by ' +
            recipeUses.join(', ') +
            '. Change that product first.',
        );
        return;
      }
      if (runtimeValue('confirm')('Delete this recipe?')) {
        runtimeValue('state').recipes = runtimeValue('state').recipes.filter(
          function (item: LegacyValue) {
            return item.id !== id;
          },
        );
      } else {
        return;
      }
      break;
    }
    case 'addLine': {
      const recipe = runtimeValue('getById')(runtimeValue('state').recipes, id);
      if (recipe) {
        recipe.lines.push({
          id: runtimeValue('uid')(),
          ingredientId: '',
          qty: '',
          unit: 'g',
        });
      }
      break;
    }
    case 'delLine': {
      const recipe = runtimeValue('getById')(runtimeValue('state').recipes, id);
      if (recipe) {
        recipe.lines = recipe.lines.filter(function (
          item: LegacyValue,
          itemIndex: number,
        ) {
          return lineId ? item.id !== lineId : itemIndex !== parseInt(index, 10);
        });
      }
      break;
    }
    case 'addProduct':
      runtimeValue('state').products.push({
        id: runtimeValue('uid')(),
        name: '',
        recipeId: '',
        packLines: [],
        targetMargin: 60,
        price: '',
      });
      break;
    case 'delProduct':
      runtimeValue('deleteCostingProduct')(id);
      return;
    case 'addPkgLine': {
      const product = runtimeValue('getById')(
        runtimeValue('state').products,
        id,
      );
      if (product) {
        product.packLines.push({
          id: runtimeValue('uid')(),
          packagingId: '',
          qty: 1,
        });
      }
      break;
    }
    case 'delPkgLine': {
      const product = runtimeValue('getById')(
        runtimeValue('state').products,
        id,
      );
      if (product) {
        product.packLines = product.packLines.filter(function (
          item: LegacyValue,
          itemIndex: number,
        ) {
          return lineId ? item.id !== lineId : itemIndex !== parseInt(index, 10);
        });
      }
      break;
    }
    case 'useSuggested': {
      const product = runtimeValue('getById')(
        runtimeValue('state').products,
        id,
      );
      if (product) {
        const cost = runtimeValue('productCost')(product);
        const suggested = runtimeValue('suggestedPrice')(
          cost,
          product.targetMargin,
        );
        if (isFinite(suggested)) {
          product.price = runtimeValue('ceilTo')(suggested, 5);
        }
      }
      break;
    }
    case 'export':
      runtimeValue('exportData')();
      return;
    case 'importTrigger':
      runtimeValue<Document>('document').getElementById('importFile')!.click();
      return;
    case 'loadExample':
      if (runtimeValue('session')) {
        runtimeValue('alert')(
          'Example data is disabled in the shared cloud workspace because replacing ingredient IDs would detach their stock history. Use a separate offline copy for examples.',
        );
        return;
      }
      if (
        runtimeValue('confirm')(
          'Load example data? This replaces what you have now.',
        )
      ) {
        runtimeValue('replaceCostingStateSafely')(
          runtimeValue('exampleData')(),
          'Loaded example data',
        );
      }
      return;
    case 'clearAll':
      if (
        runtimeValue('confirm')(
          'Erase ALL costing data? Export a backup first if unsure.',
        )
      ) {
        runtimeValue('replaceCostingStateSafely')(
          runtimeValue('blank')(),
          'Cleared all data',
        );
      }
      return;
    case 'doLogin':
      runtimeValue('doLogin')();
      return;
    case 'toggleAuthMode':
      runtimeValue('toggleAuthMode')();
      return;
    case 'openLogin':
      runtimeValue('openLogin')();
      return;
    case 'goOffline':
      runtimeValue('goOffline')();
      return;
    case 'logout':
      runtimeValue('doLogout')();
      return;
    case 'doReconnect':
      runtimeValue('doReconnect')();
      return;
    case 'copySql':
      runtimeValue('navigator').clipboard.writeText(
        runtimeValue<Document>('document').getElementById('sqlText')!
          .textContent,
      ).then(
        function () {
          runtimeValue('alert')(
            'SQL copied. Paste it into Supabase → SQL Editor → New query → Run.',
          );
        },
        function () {
          runtimeValue('alert')(
            'Could not copy automatically — select the SQL and copy it manually.',
          );
        },
      );
      return;
    case 'histClear': {
      const historyDate = runtimeValue<Document>('document').getElementById(
        'histDate',
      ) as HTMLInputElement | null;
      if (historyDate) historyDate.value = '';
      runtimeValue('loadHistory')();
      return;
    }
    default:
      return;
  }
  runtimeValue('logChanges')();
  runtimeValue('save')();
  runtimeValue('renderAll')();
}
