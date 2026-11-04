import {
  runtimeFunction,
  runtimeValue,
  stateFunction,
  writeRuntimeBinding,
  type LegacyValue,
} from './bindings';

/** Initialize every classic State `var` in its original source order. */
export function initializeStateValues(): void {
  writeRuntimeBinding('APP_BRAND_NAME', 'Matcha Luna');
  writeRuntimeBinding('APP_BRAND_SLUG', 'matcha-luna');
  const testMode = /(?:^|[?&])test=1(?:&|$)/.test(
    runtimeValue<Window>('window').location.search,
  );
  writeRuntimeBinding('TEST_MODE', testMode);
  writeRuntimeBinding(
    'KEY',
    testMode ? 'scoopies_costing_test' : 'scoopies_costing_v1',
  );
  writeRuntimeBinding(
    'DIRTY_KEY',
    testMode ? 'scoopies_costing_test_dirty' : 'scoopies_costing_v1_dirty',
  );
  writeRuntimeBinding(
    'SYNCED_KEY',
    testMode ? 'scoopies_costing_test_synced' : 'scoopies_costing_v1_synced',
  );
  writeRuntimeBinding('CFG_KEY', 'scoopies_cloud_cfg');
  writeRuntimeBinding(
    'DEFAULT_URL',
    'https://zdhybtctoxosjddzbfzp.supabase.co',
  );
  writeRuntimeBinding(
    'DEFAULT_KEY',
    'sb_publishable_0doOTYpX9SKPHNHSSHLYRg_g2lJCsAj',
  );
  writeRuntimeBinding('state', stateFunction('loadLocal')());
  writeRuntimeBinding('cloud', {
    url: '',
    key: '',
    client: null,
    connected: false,
    channel: null,
  });
  writeRuntimeBinding('session', null);
  writeRuntimeBinding('currentUserId', null);
  writeRuntimeBinding('offlineMode', false);
  writeRuntimeBinding('authMode', 'login');
  writeRuntimeBinding('costingCloudReady', false);
  writeRuntimeBinding('costingLoadGeneration', 0);
  writeRuntimeBinding('costingCloudLoading', false);
  writeRuntimeBinding('pendingSave', false);
  writeRuntimeBinding('saveTimer', null);
  writeRuntimeBinding('pendingRemote', null);
  writeRuntimeBinding('saveVersion', 0);
  writeRuntimeBinding('retryingDirty', false);
  writeRuntimeBinding('costingSourceCommitInFlight', false);
  writeRuntimeBinding('localDirty', stateFunction('loadLocalDirty')());
  writeRuntimeBinding('syncedState', stateFunction('loadSyncedLocal')());
  writeRuntimeBinding('lastState', null);
  writeRuntimeBinding('NAMES', {
    'lukesellado04@gmail.com': 'Luke',
    'ynazov03@gmail.com': 'Ynah',
  });
  writeRuntimeBinding('ingredientUi', { search: '', category: 'all' });
  writeRuntimeBinding('categoryModalOpen', false);
  writeRuntimeBinding('categoryEditId', '');
  writeRuntimeBinding('modalReturnFocus', null);
  writeRuntimeBinding('purchasedIngredientModalOpen', false);
  writeRuntimeBinding('purchasedIngredientReturnFocus', null);
  writeRuntimeBinding('mixtureModalOpen', false);
  writeRuntimeBinding('mixtureDraft', null);
  writeRuntimeBinding('mixtureReadOnly', false);
  writeRuntimeBinding('mixtureSaving', false);
  writeRuntimeBinding('quickIngredientDraft', null);
  writeRuntimeBinding('mixtureOriginalExisting', false);
  writeRuntimeBinding('draftsModalOpen', false);
  writeRuntimeBinding('activeMixtureDraftId', '');
  writeRuntimeBinding('mixtureInitialSnapshot', null);
  writeRuntimeBinding('mixtureSourceId', '');
  writeRuntimeBinding('mixtureSourceSnapshot', null);
  writeRuntimeBinding('openedMixtureDraftUpdatedAt', '');
  writeRuntimeBinding('openedMixtureDraftFingerprint', '');
  writeRuntimeBinding('mixtureDraftNotice', '');
  writeRuntimeBinding('posContext', {
    loaded: false,
    loading: false,
    businessId: '',
    businessName: '',
    role: '',
    publications: {},
    error: '',
  });
  writeRuntimeBinding('posLoadGeneration', 0);
  writeRuntimeBinding('posStatusGeneration', 0);
  writeRuntimeBinding('publishModalOpen', false);
  writeRuntimeBinding('publishProductId', '');
  writeRuntimeBinding('publishSnapshot', null);
  writeRuntimeBinding('publishSubmitting', false);
  writeRuntimeBinding('publishError', '');
  writeRuntimeBinding('publishNotice', '');
  writeRuntimeBinding(
    'POS_PENDING_KEY',
    testMode ? 'scoopies_pos_pending_test' : 'scoopies_pos_pending_v1',
  );
  writeRuntimeBinding(
    'STOCK_PENDING_KEY',
    testMode ? 'scoopies_stock_pending_test' : 'scoopies_stock_pending_v1',
  );
  writeRuntimeBinding(
    'STOCK_SOURCE_DELETE_KEY',
    testMode
      ? 'scoopies_stock_source_delete_test'
      : 'scoopies_stock_source_delete_v1',
  );
  writeRuntimeBinding(
    'POS_CATALOG_CACHE_KEY',
    testMode
      ? 'scoopies_pos_catalog_cache_test'
      : 'scoopies_pos_catalog_cache_v1',
  );
  writeRuntimeBinding('POS_IMAGE_BUCKET', 'pos-product-images');
  writeRuntimeBinding('POS_CATALOG_CACHE_MAX_AGE_MS', 30 * 60 * 1000);
  writeRuntimeBinding('POS_SILENT_REFRESH_MIN_AGE_MS', 30 * 1000);
  writeRuntimeBinding('POS_HISTORY_PAGE_SIZE', 20);
  writeRuntimeBinding('POS_SHIFT_HISTORY_PAGE_SIZE', 20);
  writeRuntimeBinding('posCheckoutLoadGeneration', 0);
  writeRuntimeBinding('posCheckoutSubmitGeneration', 0);
  writeRuntimeBinding('posCatalogGeneration', 0);
  writeRuntimeBinding('posSilentRefreshPromise', null);
  writeRuntimeBinding('posLastSilentRefreshAttemptAt', 0);
  writeRuntimeBinding('posOpsGeneration', 0);
  writeRuntimeBinding('posHistoryGeneration', 0);
  writeRuntimeBinding('posMediaGeneration', 0);
  writeRuntimeBinding('posMediaSelectionGeneration', 0);
  writeRuntimeBinding('posOpsModalReturnFocus', null);
  writeRuntimeBinding('posOpsModal', runtimeFunction('freshPosOpsModal')());
  writeRuntimeBinding(
    'posSalesHistory',
    runtimeFunction('freshPosSalesHistory')(),
  );
  writeRuntimeBinding('posCheckout', {
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
  });
  writeRuntimeBinding('stockLoadGeneration', 0);
  writeRuntimeBinding('stockMutationGeneration', 0);
  writeRuntimeBinding('stockModalReturnFocus', null);
  writeRuntimeBinding('stockSourceMutations', {});
  writeRuntimeBinding('stockState', runtimeFunction('freshStockState')());
  writeRuntimeBinding('stockModal', runtimeFunction('freshStockModal')());
  writeRuntimeBinding('MERGE_MISSING', {});
  writeRuntimeBinding(
    'cloudSaveChain',
    runtimeValue<LegacyValue>('Promise').resolve(),
  );
}
