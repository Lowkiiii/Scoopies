/* ---------- stable compatibility contract ---------- */
/* Transition fallback only: the current module bootstrap does not load this file.
   Keep it temporarily so pre-3B0 cached HTML can still start after deployment. */
(function createMatchaLunaCompatibility(root){
  var classicContract = [
    'acceptPosCatalogChanges',
    'activateAppTab',
    'activeUrl',
    'addPosProduct',
    'addPosProductVariant',
    'applyPosHistoryDateFilter',
    'authMode',
    'blank',
    'buildPosPendingSale',
    'buildProductCostingSnapshot',
    'cancelPosDrinkImageEditor',
    'categoryModalOpen',
    'changeIngredientUnitSafely',
    'closeMixtureModal',
    'closePublishProductModal',
    'closeStockModal',
    'cloud',
    'cloudLoad',
    'cloudSave',
    'costingBulkInventoryIssue',
    'costingCloudReady',
    'currentUserId',
    'deleteCostingProduct',
    'deleteIngredientSafely',
    'diffStates',
    'draftMixtureInfo',
    'draftsModalOpen',
    'freshStockModal',
    'freshStockState',
    'getById',
    'handleAuth',
    'ingCostPerBase',
    'ingredientCostInfo',
    'ingredientTotalBase',
    'ingredientUi',
    'ingredientUsage',
    'isMixture',
    'KEY',
    'lineCost',
    'loadPosCheckoutData',
    'loadPosClosedShiftsPage',
    'loadPosContext',
    'loadPosPublicationStatus',
    'loadPosSalesHistoryPage',
    'loadPosSalesProductTally',
    'loadStocks',
    'localDirty',
    'maybeApplyRemote',
    'mergeStates',
    'mixtureBatchCost',
    'mixtureDraft',
    'mixtureModalOpen',
    'normalizeState',
    'openManageDrinksModal',
    'openMixtureModal',
    'openPosCloseModal',
    'openPosDrinkImageEditor',
    'openPosReportModal',
    'openPosSalesHistory',
    'openPosShiftModal',
    'openPosVoidModal',
    'openPublishProductModal',
    'openStockModal',
    'pendingRemote',
    'pendingSave',
    'pkgCostPerPiece',
    'POS_CATALOG_CACHE_KEY',
    'POS_CATALOG_CACHE_MAX_AGE_MS',
    'POS_PENDING_KEY',
    'posBuildReportCsv',
    'posCanManageOperations',
    'posCanPublish',
    'posCartLines',
    'posCartTotalCentavos',
    'posCartUnits',
    'posCatalogGeneration',
    'posCheckout',
    'posCheckoutErrorText',
    'posCheckoutValidation',
    'posClearCatalogCache',
    'posClearPending',
    'posCloseOpsModal',
    'posContext',
    'posCsvCell',
    'posDecodeDrinkImageFile',
    'posDeterministicError',
    'posDrinkGroupKey',
    'posDrinkImageCropGeometry',
    'posEncodeDrinkImageCanvas',
    'posExportDrinkImage',
    'posHydrateCatalogCache',
    'posOperationDeterministic',
    'posOperationErrorText',
    'posOpsModal',
    'posPendingRecords',
    'posPendingScope',
    'posPrepareDrinkImage',
    'posProductCartQuantity',
    'posRememberCatalogCache',
    'posRestorePending',
    'posSalesHistory',
    'posSavePending',
    'posSilentRefreshPromise',
    'posStoredPending',
    'productCost',
    'publishError',
    'publishModalOpen',
    'publishNotice',
    'publishProductId',
    'publishProductToPos',
    'publishSnapshot',
    'publishSubmitting',
    'purchasedIngredientModalOpen',
    'recipePerServing',
    'recipeTotal',
    'reconcileCostingInventoryLifecycle',
    'refreshModalBodyClass',
    'refreshPosCatalogOnly',
    'refreshPosSilently',
    'renderAll',
    'renderGate',
    'renderIngredients',
    'renderPos',
    'renderProducts',
    'renderStocks',
    'resetPosCheckout',
    'resetPosContext',
    'reviewPosCloseShift',
    'reviewPosSale',
    'reviewPosVoidSale',
    'sameDataValue',
    'save',
    'saveMixture',
    'savePosDrinkImageEditor',
    'saveTimer',
    'session',
    'setPosHistoryShiftFilter',
    'setPosOpenMode',
    'setPosReportMode',
    'setPosReportsLoading',
    'setPosSalesHistoryMode',
    'setPosSalesHistoryView',
    'setStockModalAction',
    'snapshot',
    'stableSerialize',
    'state',
    'STOCK_PENDING_KEY',
    'STOCK_SOURCE_DELETE_KEY',
    'stockBuildPending',
    'stockBuildSourceDelete',
    'stockClearPending',
    'stockClearSourceDelete',
    'stockModal',
    'stockNormalizeItem',
    'stockNormalizeTransaction',
    'stockRecoverSourceDeletes',
    'stockSavePending',
    'stockSaveSourceDelete',
    'stockScopedSourceDeletes',
    'stockSourcePayload',
    'stockState',
    'stockStoredPending',
    'stockStoredPendings',
    'stockTransactionLabel',
    'stockValidateModal',
    'strictPesoCentavos',
    'submitPosCloseShift',
    'submitPosOpenShift',
    'submitPosSale',
    'submitPosVoidSale',
    'submitStockModal',
    'syncedState',
    'TEST_MODE',
    'uploadPosDrinkImage',
    'validateProductForPublish'
  ];

  function ensureDomain(facade, domain){
    if(!facade.domains[domain])facade.domains[domain]={};
    return facade.domains[domain];
  }

  var facade = {
    contractVersion:1,
    contractNames:Object.freeze(classicContract.slice()),
    domains:{},
    bindClassic:function(domain,names){
      var namespace=ensureDomain(this,domain);
      names.forEach(function(name){
        Object.defineProperty(namespace,name,{
          configurable:true,
          enumerable:true,
          get:function(){return root[name];},
          set:function(value){root[name]=value;}
        });
      });
      return namespace;
    },
    registerModule:function(domain,descriptors){
      var namespace=ensureDomain(this,domain);
      Object.keys(descriptors||{}).forEach(function(name){
        var descriptor=Object.assign({configurable:true,enumerable:true},descriptors[name]);
        Object.defineProperty(namespace,name,descriptor);
        if(!(name in root)){
          Object.defineProperty(root,name,{
            configurable:true,
            enumerable:true,
            get:function(){return namespace[name];},
            set:function(value){namespace[name]=value;}
          });
        }
      });
      return namespace;
    },
    finalize:function(){
      var missing=this.contractNames.filter(function(name){
        return !Object.prototype.hasOwnProperty.call(root,name);
      });
      if(missing.length)throw new Error('Compatibility contract is missing: '+missing.join(', '));
      this.finalized=true;
      return this;
    }
  };

  root.MatchaLunaApp=facade;
  facade.bindClassic('legacy',facade.contractNames);
  facade.finalize();
})(window);
