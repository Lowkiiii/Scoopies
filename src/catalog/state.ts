import {
  catalogFunction,
  runtimeFunction,
  runtimeValue,
  writeRuntimeBinding,
  type LegacyValue,
} from './bindings';

function incrementRuntimeBinding(name: string): LegacyValue {
  let value = runtimeValue<LegacyValue>(name);
  value++;
  writeRuntimeBinding(name, value);
  return value;
}

export function freshPosCheckout(): LegacyValue {
  return {
    catalog: [],
    catalogLoading: false,
    catalogError: '',
    search: '',
    category: 'all',
    cart: {},
    catalogChanged: false,
    paymentMethod: 'cash',
    cashReceived: '',
    referenceNumber: '',
    confirming: false,
    submitting: false,
    error: '',
    notice: '',
    pending: null,
    lastReceipt: null,
    summary: null,
    recent: [],
    reportsLoading: false,
    reportsError: '',
    shift: null,
    shiftStatus: null,
    shiftLoading: false,
    shiftError: '',
    reportMode: 'live',
    reportDate: '',
    dailyReport: null,
    reportLoadedMode: '',
    reportLoadedDate: '',
    loaded: false,
    refreshing: false,
    refreshError: '',
    checkoutRefreshRequired: false,
    lastUpdatedAt: 0,
    catalogFromCache: false,
    catalogVerifiedGeneration: 0,
  };
}

export function clearPosReportData(): void {
  runtimeValue<LegacyValue>('posCheckout').summary = null;
  runtimeValue<LegacyValue>('posCheckout').dailyReport = null;
  runtimeValue<LegacyValue>('posCheckout').recent = [];
  runtimeValue<LegacyValue>('posCheckout').reportLoadedMode = '';
  runtimeValue<LegacyValue>('posCheckout').reportLoadedDate = '';
}

export function setPosReportsLoading(loading: LegacyValue): void {
  runtimeValue<LegacyValue>('posCheckout').reportsLoading = !!loading;
  runtimeValue<LegacyValue>('document').body.classList.toggle(
    'pos-reports-loading',
    !!loading,
  );
}

export function syncOpenPosReportModal(): boolean {
  if (!runtimeValue<LegacyValue>('posOpsModal').open) return false;
  if (runtimeValue<LegacyValue>('posOpsModal').type !== 'report') {
    runtimeFunction('renderPosOpsModal')();
    return true;
  }
  runtimeValue<LegacyValue>('posOpsModal').result =
    runtimeValue<LegacyValue>('posCheckout').dailyReport;
  if (runtimeValue<LegacyValue>('posCheckout').reportsLoading) {
    runtimeValue<LegacyValue>('posOpsModal').notice =
      runtimeValue<LegacyValue>('posOpsModal').notice || 'Refreshing report…';
  } else {
    runtimeValue<LegacyValue>('posOpsModal').notice =
      runtimeValue<LegacyValue>('posCheckout').reportsError || '';
  }
  runtimeFunction('renderPosOpsModal')();
  return true;
}

export function stockCanManage(): boolean {
  return runtimeValue<LegacyValue>('posContext').role === 'owner' ||
    runtimeValue<LegacyValue>('posContext').role === 'manager';
}

export function resetStocks(message?: LegacyValue): void {
  incrementRuntimeBinding('stockLoadGeneration');
  incrementRuntimeBinding('stockMutationGeneration');
  writeRuntimeBinding('stockState', runtimeFunction('freshStockState')());
  if (message) {
    runtimeValue<LegacyValue>('stockState').error =
      runtimeFunction('String')(message);
  }
  writeRuntimeBinding('stockModal', runtimeFunction('freshStockModal')());
  writeRuntimeBinding('stockModalReturnFocus', null);
  const modal = runtimeValue<LegacyValue>('document').getElementById(
    'stockModal',
  );
  if (modal) modal.hidden = true;
  if (typeof runtimeValue<LegacyValue>('refreshModalBodyClass') === 'function') {
    runtimeFunction('refreshModalBodyClass')();
  }
  if (typeof runtimeValue<LegacyValue>('renderStocks') === 'function') {
    runtimeFunction('renderStocks')();
  }
}

export function resetPosCheckout(): void {
  incrementRuntimeBinding('posCheckoutLoadGeneration');
  incrementRuntimeBinding('posCheckoutSubmitGeneration');
  incrementRuntimeBinding('posCatalogGeneration');
  incrementRuntimeBinding('posOpsGeneration');
  incrementRuntimeBinding('posHistoryGeneration');
  incrementRuntimeBinding('posMediaGeneration');
  writeRuntimeBinding('posSilentRefreshPromise', null);
  writeRuntimeBinding('posLastSilentRefreshAttemptAt', 0);
  catalogFunction('disposePosDrinkImageEditor')();
  writeRuntimeBinding('posCheckout', catalogFunction('freshPosCheckout')());
  writeRuntimeBinding('posSalesHistory', runtimeFunction('freshPosSalesHistory')());
  writeRuntimeBinding('posOpsModal', runtimeFunction('freshPosOpsModal')());
  runtimeValue<LegacyValue>('document').body.classList.remove('pos-training');
  catalogFunction('setPosReportsLoading')(false);
  writeRuntimeBinding('posOpsModalReturnFocus', null);
  const modal = runtimeValue<LegacyValue>('document').getElementById(
    'posOpsModal',
  );
  if (modal) modal.hidden = true;
  runtimeFunction('refreshModalBodyClass')();
  runtimeFunction('renderPos')();
}

export function posUuid(): string {
  const rootWindow = runtimeValue<LegacyValue>('window');
  if (
    rootWindow.crypto &&
    typeof rootWindow.crypto.randomUUID === 'function'
  ) {
    return rootWindow.crypto.randomUUID();
  }
  const bytes = new (runtimeValue<LegacyValue>('Uint8Array'))(16);
  if (
    rootWindow.crypto &&
    typeof rootWindow.crypto.getRandomValues === 'function'
  ) {
    rootWindow.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = runtimeValue<LegacyValue>('Math').floor(
        runtimeValue<LegacyValue>('Math').random() * 256,
      );
    }
  }
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = runtimeValue<LegacyValue>('Array').from(
    bytes,
    function (byte: LegacyValue) {
      return byte.toString(16).padStart(2, '0');
    },
  ).join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' +
    hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}

export function resetPosContext(
  message?: LegacyValue,
  preserveCheckout?: LegacyValue,
): void {
  incrementRuntimeBinding('posLoadGeneration');
  incrementRuntimeBinding('posStatusGeneration');
  incrementRuntimeBinding('posOpsGeneration');
  incrementRuntimeBinding('posHistoryGeneration');
  incrementRuntimeBinding('posMediaGeneration');
  writeRuntimeBinding('posSalesHistory', runtimeFunction('freshPosSalesHistory')());
  if (runtimeValue<LegacyValue>('posOpsModal').open) {
    runtimeFunction('posCloseOpsModal')(true);
  }
  writeRuntimeBinding('posContext', {
    loaded: !!message,
    loading: false,
    businessId: '',
    businessName: '',
    role: '',
    publications: {},
    error: message || '',
  });
  catalogFunction('resetStocks')(message || '');
  if (preserveCheckout) {
    incrementRuntimeBinding('posCheckoutLoadGeneration');
    incrementRuntimeBinding('posCatalogGeneration');
  } else {
    catalogFunction('resetPosCheckout')();
  }
}

export function posCanPublish(): boolean {
  return !!(
    runtimeValue<LegacyValue>('session') &&
    runtimeValue<LegacyValue>('cloud').connected &&
    runtimeValue<LegacyValue>('costingCloudReady') &&
    runtimeValue<LegacyValue>('posContext').businessId &&
    (
      runtimeValue<LegacyValue>('posContext').role === 'owner' ||
      runtimeValue<LegacyValue>('posContext').role === 'manager'
    )
  );
}

export function posFriendlyError(error: LegacyValue): string {
  if (
    error &&
    runtimeFunction('String')(error.code || '') === '40001'
  ) {
    return 'Your partner published a newer version. Close this window and review the latest POS version before trying again.';
  }
  if (
    error &&
    runtimeFunction('String')(error.code || '') === '42501'
  ) {
    return 'Your account does not have permission to publish POS prices.';
  }
  return 'Could not reach the POS database. Check your connection and try again.';
}

export function rpcRows(result: LegacyValue): LegacyValue[] {
  if (result && result.error) throw result.error;
  if (!result || result.data == null) return [];
  return runtimeValue<LegacyValue>('Array').isArray(result.data)
    ? result.data
    : [result.data];
}
