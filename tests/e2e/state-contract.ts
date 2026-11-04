export const stateValueNames = [
  'APP_BRAND_NAME', 'APP_BRAND_SLUG', 'TEST_MODE', 'KEY', 'DIRTY_KEY',
  'SYNCED_KEY', 'CFG_KEY', 'DEFAULT_URL', 'DEFAULT_KEY', 'state', 'cloud',
  'session', 'currentUserId', 'offlineMode', 'authMode', 'costingCloudReady',
  'costingLoadGeneration', 'costingCloudLoading', 'pendingSave', 'saveTimer',
  'pendingRemote', 'saveVersion', 'retryingDirty',
  'costingSourceCommitInFlight', 'localDirty', 'syncedState', 'lastState',
  'NAMES', 'ingredientUi', 'categoryModalOpen', 'categoryEditId',
  'modalReturnFocus', 'purchasedIngredientModalOpen',
  'purchasedIngredientReturnFocus', 'mixtureModalOpen', 'mixtureDraft',
  'mixtureReadOnly', 'mixtureSaving', 'quickIngredientDraft',
  'mixtureOriginalExisting', 'draftsModalOpen', 'activeMixtureDraftId',
  'mixtureInitialSnapshot', 'mixtureSourceId', 'mixtureSourceSnapshot',
  'openedMixtureDraftUpdatedAt', 'openedMixtureDraftFingerprint',
  'mixtureDraftNotice', 'posContext', 'posLoadGeneration',
  'posStatusGeneration', 'publishModalOpen', 'publishProductId',
  'publishSnapshot', 'publishSubmitting', 'publishError', 'publishNotice',
  'POS_PENDING_KEY', 'STOCK_PENDING_KEY', 'STOCK_SOURCE_DELETE_KEY',
  'POS_CATALOG_CACHE_KEY', 'POS_IMAGE_BUCKET',
  'POS_CATALOG_CACHE_MAX_AGE_MS', 'POS_SILENT_REFRESH_MIN_AGE_MS',
  'POS_HISTORY_PAGE_SIZE', 'POS_SHIFT_HISTORY_PAGE_SIZE',
  'posCheckoutLoadGeneration', 'posCheckoutSubmitGeneration',
  'posCatalogGeneration', 'posSilentRefreshPromise',
  'posLastSilentRefreshAttemptAt', 'posOpsGeneration', 'posHistoryGeneration',
  'posMediaGeneration', 'posMediaSelectionGeneration', 'posOpsModalReturnFocus',
  'posOpsModal', 'posSalesHistory', 'posCheckout', 'stockLoadGeneration',
  'stockMutationGeneration', 'stockModalReturnFocus', 'stockSourceMutations',
  'stockState', 'stockModal', 'MERGE_MISSING', 'cloudSaveChain',
] as const;

export const stateFunctionNames = [
  'brandDisplayName', 'blank', 'normalizeState', 'loadLocalDirty',
  'loadSyncedLocal', 'markLocalDirty', 'rememberSynced', 'sameMergeValue',
  'cloneMergeValue', 'mergeNode', 'mergeEntityList', 'mergeStates',
  'mergeWholeEntityList', 'draftConflictKey', 'stableDraftHash',
  'remapDraftOwnedIds', 'makeMergedDraftConflictCopy', 'loadLocal',
  'setStatus', 'save', 'loadCfg', 'saveCfg', 'activeUrl', 'activeKey',
  'initClient', 'cloudLoad', 'cloudSave', 'hasData', 'appIsEditing',
  'maybeApplyRemote', 'retryDirtySave', 'subscribeRealtime', 'actorName',
  'snapshot', 'fmtv', 'categoryNameIn', 'diffStates', 'logChanges',
  'logCoarse', 'fmtTime', 'fmtDay', 'dayKey', 'loadHistory', 'showGate',
  'authMsg', 'renderGate', 'handleAuth', 'doLogin', 'toggleAuthMode',
  'openLogin', 'goOffline', 'doLogout', 'doReconnect', 'renderAccount',
] as const;

export const stateBindingNames = [
  ...stateValueNames,
  ...stateFunctionNames,
] as const;

export const protectedStateNames = [
  'activeUrl', 'authMode', 'blank', 'categoryModalOpen', 'cloud', 'cloudLoad',
  'cloudSave', 'costingCloudReady', 'currentUserId', 'diffStates',
  'draftsModalOpen', 'handleAuth', 'ingredientUi', 'KEY', 'localDirty',
  'maybeApplyRemote', 'mergeStates', 'mixtureDraft', 'mixtureModalOpen',
  'normalizeState', 'pendingRemote', 'pendingSave', 'POS_CATALOG_CACHE_KEY',
  'POS_CATALOG_CACHE_MAX_AGE_MS', 'POS_PENDING_KEY', 'posCatalogGeneration',
  'posCheckout', 'posContext', 'posOpsModal', 'posSalesHistory',
  'posSilentRefreshPromise', 'publishError', 'publishModalOpen', 'publishNotice',
  'publishProductId', 'publishSnapshot', 'publishSubmitting',
  'purchasedIngredientModalOpen', 'renderGate', 'save', 'saveTimer', 'session',
  'snapshot', 'state', 'STOCK_PENDING_KEY', 'STOCK_SOURCE_DELETE_KEY',
  'stockModal', 'stockState', 'syncedState', 'TEST_MODE',
] as const;

export const transitionRuntimeFiles = [
  'core.js', 'runtime-factories.js', 'state.js', 'costing.js',
  'pos-catalog.js', 'stocks.js', 'workspace-sync.js', 'pos-operations.js',
  'publication.js', 'render-costing.js', 'render-modals.js', 'render-pos.js',
  'render-stocks.js', 'support.js', 'events.js', 'boot.js',
  'compatibility.js', 'start.js',
] as const;

export const activeRuntimeFiles = ['start.js'] as const;
