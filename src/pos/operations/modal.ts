import {
  incrementRuntimeBinding,
  posFunction,
  runtimeFunction,
  runtimeValue,
  writeRuntimeBinding,
  type LegacyValue,
} from '../bindings';

export function posCloseOpsModal(force?: LegacyValue): boolean {
  if (
    (
      runtimeValue<LegacyValue>('posOpsModal').submitting ||
      runtimeValue<LegacyValue>('posOpsModal').uncertain
    ) &&
    !force
  ) {
    return false;
  }
  if (runtimeValue<LegacyValue>('posOpsModal').type === 'salesHistory') {
    incrementRuntimeBinding('posHistoryGeneration');
    writeRuntimeBinding(
      'posSalesHistory',
      runtimeFunction('freshPosSalesHistory')(),
    );
  }
  if (runtimeValue<LegacyValue>('posOpsModal').type === 'manageDrinks') {
    incrementRuntimeBinding('posMediaGeneration');
    runtimeFunction('disposePosDrinkImageEditor')();
  }
  writeRuntimeBinding('posOpsModal', runtimeFunction('freshPosOpsModal')());
  const document = runtimeValue<LegacyValue>('document');
  const modal = document.getElementById('posOpsModal');
  if (modal) modal.hidden = true;
  runtimeFunction('refreshModalBodyClass')();
  if (
    runtimeValue<LegacyValue>('posOpsModalReturnFocus') &&
    document.contains(runtimeValue<LegacyValue>('posOpsModalReturnFocus'))
  ) {
    runtimeValue<LegacyValue>('posOpsModalReturnFocus').focus();
  }
  writeRuntimeBinding('posOpsModalReturnFocus', null);
  return true;
}

export function posOpenOpsModal(
  type: LegacyValue,
  details?: LegacyValue,
): boolean {
  if (
    runtimeValue<LegacyValue>('posOpsModal') &&
    runtimeValue<LegacyValue>('posOpsModal').mediaEditor
  ) {
    runtimeFunction('disposePosDrinkImageEditor')();
  }
  writeRuntimeBinding(
    'posOpsModalReturnFocus',
    runtimeValue<LegacyValue>('document').activeElement,
  );
  writeRuntimeBinding('posOpsModal', runtimeFunction('freshPosOpsModal')());
  runtimeValue<LegacyValue>('posOpsModal').open = true;
  runtimeValue<LegacyValue>('posOpsModal').type = type;
  if (details && typeof details === 'object') {
    runtimeValue<LegacyValue>('Object').assign(
      runtimeValue<LegacyValue>('posOpsModal'),
      details,
    );
  }
  runtimeFunction('refreshModalBodyClass')();
  posFunction('renderPosOpsModal')();
  return true;
}

export function openPosShiftModal(): boolean {
  if (
    runtimeValue<LegacyValue>('posCheckout').shift ||
    runtimeValue<LegacyValue>('posCheckout').shiftLoading ||
    runtimeValue<LegacyValue>('posCheckout').shiftError ||
    runtimeValue<LegacyValue>('posCheckout').pending ||
    runtimeValue<LegacyValue>('posCheckout').refreshing ||
    runtimeValue<LegacyValue>('posCheckout').checkoutRefreshRequired
  ) {
    return false;
  }
  const status = runtimeValue<LegacyValue>('posCheckout').shiftStatus || {};
  if (!status.can_open_live && !status.can_open_training) return false;
  posFunction('posOpenOpsModal')('openShift');
  runtimeValue<LegacyValue>('posOpsModal').mode = status.can_open_live
    ? 'live'
    : 'training';
  runtimeValue<LegacyValue>('posOpsModal').openingCash = '0.00';
  posFunction('renderPosOpsModal')();
  runtimeFunction('focusSoon')('#posOpeningCash');
  return true;
}

export function setPosOpenMode(mode: LegacyValue): boolean {
  if (
    !runtimeValue<LegacyValue>('posOpsModal').open ||
    runtimeValue<LegacyValue>('posOpsModal').type !== 'openShift' ||
    runtimeValue<LegacyValue>('posOpsModal').submitting ||
    runtimeValue<LegacyValue>('posOpsModal').uncertain ||
    posFunction('posOpsActionBlocked')()
  ) {
    return false;
  }
  const status = runtimeValue<LegacyValue>('posCheckout').shiftStatus || {};
  if (mode === 'training' && !status.can_open_training) return false;
  if (mode === 'live' && !status.can_open_live) return false;
  runtimeValue<LegacyValue>('posOpsModal').mode = mode;
  runtimeValue<LegacyValue>('posOpsModal').error = '';
  if (mode === 'training') {
    runtimeValue<LegacyValue>('posOpsModal').openingCash = '0.00';
  }
  posFunction('renderPosOpsModal')();
  if (mode === 'live') runtimeFunction('focusSoon')('#posOpeningCash');
  return true;
}

export function openPosCloseModal(): boolean {
  if (
    !runtimeValue<LegacyValue>('posCheckout').shift ||
    runtimeValue<LegacyValue>('posCheckout').submitting ||
    runtimeValue<LegacyValue>('posCheckout').pending ||
    runtimeValue<LegacyValue>('posCheckout').confirming ||
    runtimeFunction('posCartLines')().length ||
    runtimeValue<LegacyValue>('posOpsModal').submitting ||
    runtimeValue<LegacyValue>('posCheckout').refreshing ||
    runtimeValue<LegacyValue>('posCheckout').checkoutRefreshRequired
  ) {
    return false;
  }
  if (
    !(
      runtimeValue<LegacyValue>('posCheckout').shiftStatus &&
      runtimeValue<LegacyValue>('posCheckout').shiftStatus.can_close_shift
    )
  ) {
    return false;
  }
  posFunction('posOpenOpsModal')('closeShift');
  runtimeValue<LegacyValue>('posOpsModal').mode =
    runtimeValue<LegacyValue>('posCheckout').shift.is_training
      ? 'training'
      : 'live';
  runtimeValue<LegacyValue>('posOpsModal').step =
    runtimeValue<LegacyValue>('posCheckout').shift.is_training
      ? 'confirm'
      : 'edit';
  posFunction('renderPosOpsModal')();
  if (runtimeValue<LegacyValue>('posOpsModal').mode === 'live') {
    runtimeFunction('focusSoon')('#posCountedCash');
  }
  return true;
}

export function openPosVoidModal(saleId: LegacyValue): boolean {
  if (
    !posFunction('posCanManageOperations')() ||
    runtimeValue<LegacyValue>('posCheckout').submitting ||
    runtimeValue<LegacyValue>('posCheckout').pending ||
    runtimeValue<LegacyValue>('posCheckout').refreshing ||
    runtimeValue<LegacyValue>('posCheckout').checkoutRefreshRequired
  ) {
    return false;
  }
  const sale = (runtimeValue<LegacyValue>('posCheckout').recent || []).find(
    function (row: LegacyValue) {
      return runtimeFunction('String')(row.sale_id || '') ===
        runtimeFunction('String')(saleId || '');
    },
  );
  if (!sale || !sale.can_void || sale.sale_state === 'voided') return false;
  posFunction('posOpenOpsModal')('voidSale');
  runtimeValue<LegacyValue>('posOpsModal').sale = sale;
  posFunction('renderPosOpsModal')();
  runtimeFunction('focusSoon')('#posVoidReason');
  return true;
}

export function posOpsActionBlocked(): boolean {
  return !!(
    runtimeValue<LegacyValue>('posCheckout').refreshing ||
    runtimeValue<LegacyValue>('posCheckout').shiftLoading ||
    runtimeValue<LegacyValue>('posCheckout').catalogLoading ||
    (
      runtimeValue<LegacyValue>('posCheckout').checkoutRefreshRequired &&
      !runtimeValue<LegacyValue>('posOpsModal').uncertain
    )
  );
}

export function requirePosOpsVerification(): boolean {
  if (!posFunction('posOpsActionBlocked')()) return true;
  runtimeValue<LegacyValue>('posOpsModal').error =
    'Wait for the register check to finish, then try again.';
  posFunction('renderPosOpsModal')();
  return false;
}

export function openPosReportModal(): boolean {
  if (runtimeValue<LegacyValue>('posCheckout').reportsLoading) return false;
  posFunction('posOpenOpsModal')('report');
  runtimeValue<LegacyValue>('posOpsModal').result =
    runtimeValue<LegacyValue>('posCheckout').dailyReport;
  posFunction('renderPosOpsModal')();
  return true;
}

export function posHistoryRequestStillCurrent(
  generation: LegacyValue,
  userId: LegacyValue,
  businessId: LegacyValue,
  mode: LegacyValue,
  view?: LegacyValue,
): boolean {
  return generation === runtimeValue<LegacyValue>('posHistoryGeneration') &&
    runtimeValue<LegacyValue>('posOpsModal').open &&
    runtimeValue<LegacyValue>('posOpsModal').type === 'salesHistory' &&
    !!runtimeValue<LegacyValue>('session') &&
    !!runtimeValue<LegacyValue>('session').user &&
    runtimeFunction('String')(
      runtimeValue<LegacyValue>('session').user.id || '',
    ) === runtimeFunction('String')(userId || '') &&
    runtimeFunction('String')(
      runtimeValue<LegacyValue>('posContext').businessId || '',
    ) === runtimeFunction('String')(businessId || '') &&
    runtimeValue<LegacyValue>('posSalesHistory').mode === mode &&
    (!view || runtimeValue<LegacyValue>('posSalesHistory').view === view);
}

export function posSalesHistoryBusy(): boolean {
  return !!(
    runtimeValue<LegacyValue>('posSalesHistory').loading ||
    runtimeValue<LegacyValue>('posSalesHistory').tallyLoading ||
    runtimeValue<LegacyValue>('posSalesHistory').shiftLoading
  );
}

export function renderPosHistoryPreservingScroll(
  focusViewTab?: LegacyValue,
): void {
  const document = runtimeValue<LegacyValue>('document');
  let panel = document.querySelector('#posOpsModal .modal');
  const scrollTop = panel ? panel.scrollTop : 0;
  const active = document.activeElement;
  const activeView = active && active.matches &&
      active.matches('.pos-history-view-tabs [role="tab"]')
    ? active.dataset.view
    : '';
  const viewToFocus = ['receipts', 'tally', 'shifts'].indexOf(focusViewTab) >= 0
    ? focusViewTab
    : activeView;
  posFunction('renderPosOpsModal')();
  panel = document.querySelector('#posOpsModal .modal');
  if (panel) panel.scrollTop = scrollTop;
  if (viewToFocus) {
    const tab = document.querySelector(
      '.pos-history-view-tabs [data-view="' + viewToFocus + '"]',
    );
    if (tab && tab.getAttribute('aria-selected') === 'true') {
      try {
        tab.focus({ preventScroll: true });
      } catch (error) {
        tab.focus();
      }
      if (panel) panel.scrollTop = scrollTop;
    }
  }
}

export function posHistoryErrorText(error: LegacyValue): string {
  if (
    error &&
    runtimeFunction('String')(error.code || '') === '42501'
  ) {
    return 'Your account no longer has access to this sales history.';
  }
  if (
    error &&
    runtimeFunction('String')(error.code || '') === '22023'
  ) {
    return 'The history request was rejected. Close this window and try again.';
  }
  return 'Could not load older sales. Your already loaded receipts are still shown.';
}
