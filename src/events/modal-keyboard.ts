import { runtimeValue } from './bindings';
import type { LegacyValue } from './types';

export function handleBackdropClick(event: LegacyValue): void {
  if (event.target && event.target.id === 'categoryModal') {
    runtimeValue('closeCategoryModal')(false);
  }
  if (event.target && event.target.id === 'purchasedIngredientModal') {
    runtimeValue('closePurchasedIngredientModal')(false);
  }
  if (event.target && event.target.id === 'mixtureModal') {
    runtimeValue('requestCloseMixtureModal')();
  }
  if (event.target && event.target.id === 'draftsModal') {
    runtimeValue('closeDraftsModal')(false, false);
  }
  if (event.target && event.target.id === 'publishModal') {
    runtimeValue('closePublishProductModal')();
  }
  if (event.target && event.target.id === 'posOpsModal') {
    if (
      runtimeValue('posOpsModal').type === 'manageDrinks' &&
      runtimeValue('posOpsModal').mediaEditor
    ) {
      runtimeValue('cancelPosDrinkImageEditor')();
    } else {
      runtimeValue('posCloseOpsModal')(false);
    }
  }
  if (event.target && event.target.id === 'stockModal') {
    runtimeValue('closeStockModal')(false);
  }
}

export function handleBodyKeydown(event: LegacyValue): void {
  if (event.target && event.target.id === 'posPhotoCropCanvas') {
    const photoKeyStep = event.shiftKey ? 50 : 10;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      runtimeValue('nudgePosDrinkImageEditor')(-photoKeyStep, 0);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      runtimeValue('nudgePosDrinkImageEditor')(photoKeyStep, 0);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      runtimeValue('nudgePosDrinkImageEditor')(0, -photoKeyStep);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      runtimeValue('nudgePosDrinkImageEditor')(0, photoKeyStep);
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      runtimeValue('adjustPosDrinkImageZoom')(0.1);
      return;
    }
    if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      runtimeValue('adjustPosDrinkImageZoom')(-0.1);
      return;
    }
    if (event.key === '0') {
      event.preventDefault();
      runtimeValue('resetPosDrinkImageEditor')();
      return;
    }
  }
  const historyViewTab =
    event.target &&
    event.target.matches &&
    event.target.matches('.pos-history-view-tabs [role="tab"]')
      ? event.target
      : null;
  if (
    historyViewTab &&
    ['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(event.key) >= 0
  ) {
    event.preventDefault();
    if (runtimeValue('posSalesHistoryBusy')()) return;
    const historyViewTabs = Array.from(
      historyViewTab.parentElement.querySelectorAll('[role="tab"]'),
    ) as LegacyValue[];
    const historyViewIndex = historyViewTabs.indexOf(historyViewTab);
    let nextHistoryViewIndex = historyViewIndex;
    if (event.key === 'Home') nextHistoryViewIndex = 0;
    else if (event.key === 'End') {
      nextHistoryViewIndex = historyViewTabs.length - 1;
    } else if (event.key === 'ArrowLeft') {
      nextHistoryViewIndex =
        (historyViewIndex - 1 + historyViewTabs.length) %
        historyViewTabs.length;
    } else {
      nextHistoryViewIndex =
        (historyViewIndex + 1) % historyViewTabs.length;
    }
    const nextHistoryView = historyViewTabs[nextHistoryViewIndex];
    if (nextHistoryView) {
      runtimeValue('setPosSalesHistoryView')(
        nextHistoryView.dataset.view,
      ).catch(function () {});
    }
    return;
  }
  if (event.key === 'Escape') {
    if (runtimeValue('stockModal').open) {
      event.preventDefault();
      runtimeValue('closeStockModal')(false);
      return;
    }
    if (runtimeValue('posOpsModal').open) {
      event.preventDefault();
      if (
        runtimeValue('posOpsModal').type === 'manageDrinks' &&
        runtimeValue('posOpsModal').mediaEditor
      ) {
        runtimeValue('cancelPosDrinkImageEditor')();
      } else {
        runtimeValue('posCloseOpsModal')(false);
      }
      return;
    }
    if (runtimeValue('publishModalOpen')) {
      event.preventDefault();
      runtimeValue('closePublishProductModal')();
      return;
    }
    if (runtimeValue('draftsModalOpen')) {
      event.preventDefault();
      runtimeValue('closeDraftsModal')(false, false);
      return;
    }
    if (runtimeValue('mixtureModalOpen')) {
      event.preventDefault();
      runtimeValue('requestCloseMixtureModal')();
      return;
    }
    if (runtimeValue('purchasedIngredientModalOpen')) {
      event.preventDefault();
      runtimeValue('closePurchasedIngredientModal')(false);
      return;
    }
    if (runtimeValue('categoryModalOpen')) {
      event.preventDefault();
      runtimeValue('closeCategoryModal')(false);
      return;
    }
  }
  if (
    event.key === 'Tab' &&
    (runtimeValue('stockModal').open ||
      runtimeValue('posOpsModal').open ||
      runtimeValue('publishModalOpen') ||
      runtimeValue('draftsModalOpen') ||
      runtimeValue('mixtureModalOpen') ||
      runtimeValue('purchasedIngredientModalOpen') ||
      runtimeValue('categoryModalOpen'))
  ) {
    const selector = runtimeValue('stockModal').open
      ? '#stockModal'
      : runtimeValue('posOpsModal').open
        ? '#posOpsModal'
        : runtimeValue('publishModalOpen')
          ? '#publishModal'
          : runtimeValue('draftsModalOpen')
            ? '#draftsModal'
            : runtimeValue('mixtureModalOpen')
              ? '#mixtureModal'
              : runtimeValue('purchasedIngredientModalOpen')
                ? '#purchasedIngredientModal'
                : '#categoryModal';
    const document = runtimeValue<Document>('document');
    const modal = document.querySelector(selector + ' .modal');
    const focusable = modal
      ? (Array.from(
          modal.querySelectorAll(
            'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
          ),
        ) as LegacyValue[])
      : [];
    if (focusable.length) {
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!modal!.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }
  if (event.key !== 'Enter') return;
  const id = event.target && event.target.id;
  if (
    runtimeValue('purchasedIngredientModalOpen') &&
    (id === 'purchasedIngredientName' ||
      id === 'purchasedIngredientCategory' ||
      id === 'purchasedIngredientUnit')
  ) {
    event.preventDefault();
    runtimeValue('savePurchasedIngredient')();
    return;
  }
  if (runtimeValue('categoryModalOpen') && id === 'categoryName') {
    event.preventDefault();
    runtimeValue('saveCategory')();
    return;
  }
  if (id === 'authEmail' || id === 'authPass') {
    event.preventDefault();
    runtimeValue('doLogin')();
  }
}
