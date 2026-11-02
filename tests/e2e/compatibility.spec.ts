import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const browserNativeNames = new Set([
  'alert',
  'Blob',
  'clearTimeout',
  'confirm',
  'dispatchEvent',
  'document',
  'Event',
  'File',
  'getComputedStyle',
  'KeyboardEvent',
  'localStorage',
  'MouseEvent',
  'sessionStorage',
  'setTimeout',
]);

const expectedCoreNames = Object.freeze([
  'UNIT_FACTOR',
  'UNIT_TYPE',
  'TYPE_UNITS',
  'TYPE_BASE',
  'toBase',
  'convertUnitQuantity',
  'peso',
  'pct',
  'num',
  'uid',
  'getById',
  'ceilTo',
  'canonicalValue',
  'stableSerialize',
  'sameDataValue',
]);

const protectedCoreContractNames = Object.freeze(['getById', 'stableSerialize', 'sameDataValue']);

const expectedCostingNames = Object.freeze([
  'isMixture',
  'ingredientBaseUnit',
  'ingredientTotalBase',
  'stateIngredientLookup',
  'ingredientCostInfo',
  'mixtureBatchCost',
  'ingCostPerBase',
  'pkgCostPerPiece',
  'packagingLineCost',
  'lineCost',
  'recipeTotal',
  'recipePerServing',
  'productPackagingCost',
  'productCost',
  'suggestedPrice',
  'ingredientUsage',
  'packagingUsage',
  'recipeUsage',
  'moneyToCentavos',
  'snapshotNumber',
  'publicationIngredientRecord',
  'collectPublicationIngredient',
  'buildProductCostingSnapshot',
  'validateProductForPublish',
]);

const protectedCostingContractNames = Object.freeze([
  'isMixture',
  'ingredientTotalBase',
  'ingredientCostInfo',
  'mixtureBatchCost',
  'ingCostPerBase',
  'pkgCostPerPiece',
  'lineCost',
  'recipeTotal',
  'recipePerServing',
  'productCost',
  'ingredientUsage',
  'buildProductCostingSnapshot',
  'validateProductForPublish',
]);

const expectedStocksDomainNames = Object.freeze([
  'stockRequestIsCurrent',
  'stockBaseUnitForIngredient',
  'stockSourcePayload',
  'costingBulkInventoryIssue',
  'reconcileCostingInventoryLifecycle',
  'replaceCostingStateSafely',
  'stockNormalizeItem',
  'stockNormalizeTransaction',
  'stockPendingScope',
  'stockPendingStorageKey',
  'stockPendingRecords',
  'stockBuildPending',
  'stockSavePending',
  'stockClearPending',
  'stockStoredPendings',
  'stockStoredPending',
  'stockPendingStillCurrent',
  'stockSourceDeleteStorageKey',
  'stockSourceDeleteRecords',
  'stockSaveSourceDelete',
  'stockClearSourceDelete',
  'stockBuildSourceDelete',
  'stockAdoptRemoteCosting',
  'stockScopedSourceDeletes',
  'stockRecoverSourceDeletes',
  'stockApplyMutationRows',
  'stockRestorePendingModal',
  'stockRecoverStoredPending',
  'stockErrorText',
  'stockMutationDeterministic',
  'stockSourceGuardMessage',
  'stockEnsureSourceWorkspace',
  'deleteIngredientSafely',
  'changeIngredientUnitSafely',
  'loadStocks',
  'openStocks',
]);

const expectedStocksViewNames = Object.freeze([
  'stockNumber',
  'stockFormatNumber',
  'stockFormatQuantity',
  'stockSourceForItem',
  'stockStatus',
  'stockFilteredItems',
  'stockSummaryHtml',
  'stockFilterBarHtml',
  'stockItemCardsHtml',
  'stockTransactionLabel',
  'stockHistoryHtml',
  'renderStockResults',
  'renderStocks',
  'stockItemById',
  'stockAllowedActions',
  'stockUnitChoices',
  'stockInputToBase',
  'stockValidateModal',
  'openStockModal',
  'closeStockModal',
  'setStockModalAction',
  'stockPreviewHtml',
  'renderStockModal',
  'updateStockModalPreview',
  'submitStockModal',
  'renderPos',
  'renderAll',
]);

const expectedStocksNames = Object.freeze([
  ...expectedStocksDomainNames,
  ...expectedStocksViewNames,
]);

const protectedStocksContractNames = Object.freeze([
  'stockSourcePayload',
  'costingBulkInventoryIssue',
  'reconcileCostingInventoryLifecycle',
  'stockNormalizeItem',
  'stockNormalizeTransaction',
  'stockBuildPending',
  'stockSavePending',
  'stockClearPending',
  'stockStoredPendings',
  'stockStoredPending',
  'stockSaveSourceDelete',
  'stockClearSourceDelete',
  'stockBuildSourceDelete',
  'stockScopedSourceDeletes',
  'stockRecoverSourceDeletes',
  'deleteIngredientSafely',
  'changeIngredientUnitSafely',
  'loadStocks',
  'stockTransactionLabel',
  'renderStocks',
  'stockValidateModal',
  'openStockModal',
  'closeStockModal',
  'setStockModalAction',
  'submitStockModal',
  'renderPos',
  'renderAll',
]);

const expectedEventsNames = Object.freeze(['activateAppTab']);

const protectedEventsContractNames = Object.freeze(['activateAppTab']);

const expectedRuntimeNames = Object.freeze([
  'freshPosOpsModal',
  'freshPosSalesHistory',
  'freshStockState',
  'freshStockModal',
]);

const protectedRuntimeContractNames = Object.freeze([
  'freshStockState',
  'freshStockModal',
]);

const expectedSupportNames = Object.freeze([
  'exportData',
  'handleFileImport',
  'exampleData',
]);

function legacyContractNames() {
  const source = readFileSync(resolve(process.cwd(), 'tests/costing.test.html'), 'utf8');
  const names = Array.from(source.matchAll(/\bapp\.([A-Za-z_$][\w$]*)/g), (match) => match[1]);
  return Array.from(new Set(names)).filter((name) => !browserNativeNames.has(name)).sort();
}

test('the compatibility facade exactly protects the legacy browser contract', async ({ page }) => {
  await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/, async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: 'window.supabase={createClient:function(){throw new Error("Supabase is disabled in browser tests");}};',
    });
  });
  await page.goto('index.html?test=1', { waitUntil: 'load' });
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');

  const contract = await page.evaluate(async ({
    nativeNames,
    coreNames,
    protectedCoreNames,
    costingNames,
    protectedCostingNames,
    stocksNames,
    protectedStocksNames,
    runtimeNames,
    protectedRuntimeNames,
    supportNames,
    eventsNames,
    protectedEventsNames,
  }) => {
    const appWindow = window as typeof window & {
      MatchaLunaApp: {
        contractVersion: number;
        contractNames: string[];
        domains: {
          core: Record<string, unknown>;
          costing: Record<string, unknown>;
          stocks: Record<string, unknown>;
          runtime: Record<string, unknown>;
          support: Record<string, unknown>;
          events: Record<string, unknown>;
          legacy: Record<string, unknown>;
        };
        finalized: boolean;
        ready: Promise<void>;
      };
      state: unknown;
      renderAll: unknown;
    };
    const root = appWindow as typeof appWindow & Record<string, unknown>;
    await appWindow.MatchaLunaApp.ready;
    return {
      version: appWindow.MatchaLunaApp.contractVersion,
      finalized: appWindow.MatchaLunaApp.finalized,
      readyResolved: true,
      contractNames: appWindow.MatchaLunaApp.contractNames.slice().sort(),
      namespaceNames: Object.keys(appWindow.MatchaLunaApp.domains.legacy).sort(),
      missing: appWindow.MatchaLunaApp.contractNames.filter(
        (name) => !Object.prototype.hasOwnProperty.call(appWindow, name),
      ),
      invalidProxies: appWindow.MatchaLunaApp.contractNames.filter((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(appWindow.MatchaLunaApp.domains.legacy, name);
        return !descriptor || typeof descriptor.get !== 'function' || typeof descriptor.set !== 'function';
      }),
      coreNames: Object.keys(appWindow.MatchaLunaApp.domains.core).sort(),
      missingCoreRootProperties: coreNames.filter(
        (name) => !Object.prototype.hasOwnProperty.call(root, name),
      ),
      mismatchedCoreRootValues: coreNames.filter(
        (name) => root[name] !== appWindow.MatchaLunaApp.domains.core[name],
      ),
      invalidCoreNamespaceDescriptors: coreNames.filter((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(appWindow.MatchaLunaApp.domains.core, name);
        return (
          !descriptor ||
          descriptor.configurable !== true ||
          descriptor.enumerable !== true ||
          descriptor.writable !== true ||
          typeof descriptor.get === 'function' ||
          typeof descriptor.set === 'function'
        );
      }),
      invalidCoreRootDescriptors: coreNames.filter((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(root, name);
        return (
          !descriptor ||
          descriptor.configurable !== true ||
          descriptor.enumerable !== true ||
          typeof descriptor.get !== 'function' ||
          typeof descriptor.set !== 'function'
        );
      }),
      mismatchedProtectedCoreValues: protectedCoreNames.filter(
        (name) =>
          appWindow.MatchaLunaApp.domains.legacy[name] !== root[name] ||
          appWindow.MatchaLunaApp.domains.core[name] !== root[name],
      ),
      costingNames: Object.keys(appWindow.MatchaLunaApp.domains.costing).sort(),
      missingCostingRootProperties: costingNames.filter(
        (name) => !Object.prototype.hasOwnProperty.call(root, name),
      ),
      mismatchedCostingRootValues: costingNames.filter(
        (name) => root[name] !== appWindow.MatchaLunaApp.domains.costing[name],
      ),
      invalidCostingNamespaceDescriptors: costingNames.filter((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(appWindow.MatchaLunaApp.domains.costing, name);
        return (
          !descriptor ||
          descriptor.configurable !== true ||
          descriptor.enumerable !== true ||
          descriptor.writable !== true ||
          typeof descriptor.get === 'function' ||
          typeof descriptor.set === 'function'
        );
      }),
      invalidCostingRootDescriptors: costingNames.filter((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(root, name);
        return (
          !descriptor ||
          descriptor.configurable !== true ||
          descriptor.enumerable !== true ||
          typeof descriptor.get !== 'function' ||
          typeof descriptor.set !== 'function'
        );
      }),
      mismatchedProtectedCostingValues: protectedCostingNames.filter(
        (name) =>
          appWindow.MatchaLunaApp.domains.legacy[name] !== root[name] ||
          appWindow.MatchaLunaApp.domains.costing[name] !== root[name],
      ),
      stocksOrder: Object.keys(appWindow.MatchaLunaApp.domains.stocks),
      stocksNames: Object.keys(appWindow.MatchaLunaApp.domains.stocks).sort(),
      missingStocksRootProperties: stocksNames.filter(
        (name) => !Object.prototype.hasOwnProperty.call(root, name),
      ),
      mismatchedStocksRootValues: stocksNames.filter(
        (name) => root[name] !== appWindow.MatchaLunaApp.domains.stocks[name],
      ),
      invalidStocksNamespaceDescriptors: stocksNames.filter((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(
          appWindow.MatchaLunaApp.domains.stocks,
          name,
        );
        return (
          !descriptor ||
          descriptor.configurable !== true ||
          descriptor.enumerable !== true ||
          descriptor.writable !== true ||
          typeof descriptor.get === 'function' ||
          typeof descriptor.set === 'function'
        );
      }),
      invalidStocksRootDescriptors: stocksNames.filter((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(root, name);
        return (
          !descriptor ||
          descriptor.configurable !== true ||
          descriptor.enumerable !== true ||
          typeof descriptor.get !== 'function' ||
          typeof descriptor.set !== 'function'
        );
      }),
      mismatchedProtectedStocksValues: protectedStocksNames.filter(
        (name) =>
          appWindow.MatchaLunaApp.domains.legacy[name] !== root[name] ||
          appWindow.MatchaLunaApp.domains.stocks[name] !== root[name],
      ),
      runtimeOrder: Object.keys(appWindow.MatchaLunaApp.domains.runtime),
      runtimeNames: Object.keys(appWindow.MatchaLunaApp.domains.runtime).sort(),
      missingRuntimeRootProperties: runtimeNames.filter(
        (name) => !Object.prototype.hasOwnProperty.call(root, name),
      ),
      mismatchedRuntimeRootValues: runtimeNames.filter(
        (name) => root[name] !== appWindow.MatchaLunaApp.domains.runtime[name],
      ),
      invalidRuntimeNamespaceDescriptors: runtimeNames.filter((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(
          appWindow.MatchaLunaApp.domains.runtime,
          name,
        );
        return (
          !descriptor ||
          descriptor.configurable !== true ||
          descriptor.enumerable !== true ||
          descriptor.writable !== true ||
          typeof descriptor.get === 'function' ||
          typeof descriptor.set === 'function'
        );
      }),
      invalidRuntimeRootDescriptors: runtimeNames.filter((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(root, name);
        return (
          !descriptor ||
          descriptor.configurable !== true ||
          descriptor.enumerable !== true ||
          typeof descriptor.get !== 'function' ||
          typeof descriptor.set !== 'function'
        );
      }),
      mismatchedProtectedRuntimeValues: protectedRuntimeNames.filter(
        (name) =>
          appWindow.MatchaLunaApp.domains.legacy[name] !== root[name] ||
          appWindow.MatchaLunaApp.domains.runtime[name] !== root[name],
      ),
      supportOrder: Object.keys(appWindow.MatchaLunaApp.domains.support),
      supportNames: Object.keys(appWindow.MatchaLunaApp.domains.support).sort(),
      missingSupportRootProperties: supportNames.filter(
        (name) => !Object.prototype.hasOwnProperty.call(root, name),
      ),
      mismatchedSupportRootValues: supportNames.filter(
        (name) => root[name] !== appWindow.MatchaLunaApp.domains.support[name],
      ),
      invalidSupportNamespaceDescriptors: supportNames.filter((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(
          appWindow.MatchaLunaApp.domains.support,
          name,
        );
        return (
          !descriptor ||
          descriptor.configurable !== true ||
          descriptor.enumerable !== true ||
          descriptor.writable !== true ||
          typeof descriptor.get === 'function' ||
          typeof descriptor.set === 'function'
        );
      }),
      invalidSupportRootDescriptors: supportNames.filter((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(root, name);
        return (
          !descriptor ||
          descriptor.configurable !== true ||
          descriptor.enumerable !== true ||
          typeof descriptor.get !== 'function' ||
          typeof descriptor.set !== 'function'
        );
      }),
      eventsOrder: Object.keys(appWindow.MatchaLunaApp.domains.events),
      eventsNames: Object.keys(appWindow.MatchaLunaApp.domains.events).sort(),
      missingEventsRootProperties: eventsNames.filter(
        (name) => !Object.prototype.hasOwnProperty.call(root, name),
      ),
      mismatchedEventsRootValues: eventsNames.filter(
        (name) => root[name] !== appWindow.MatchaLunaApp.domains.events[name],
      ),
      invalidEventsNamespaceDescriptors: eventsNames.filter((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(
          appWindow.MatchaLunaApp.domains.events,
          name,
        );
        return (
          !descriptor ||
          descriptor.configurable !== true ||
          descriptor.enumerable !== true ||
          descriptor.writable !== true ||
          typeof descriptor.get === 'function' ||
          typeof descriptor.set === 'function'
        );
      }),
      invalidEventsRootDescriptors: eventsNames.filter((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(root, name);
        return (
          !descriptor ||
          descriptor.configurable !== true ||
          descriptor.enumerable !== true ||
          typeof descriptor.get !== 'function' ||
          typeof descriptor.set !== 'function'
        );
      }),
      mismatchedProtectedEventsValues: protectedEventsNames.filter(
        (name) =>
          appWindow.MatchaLunaApp.domains.legacy[name] !== root[name] ||
          appWindow.MatchaLunaApp.domains.events[name] !== root[name],
      ),
      missingBrowserNatives: nativeNames.filter((name) => !(name in appWindow)),
      facadeBrowserNatives: nativeNames.filter((name) => appWindow.MatchaLunaApp.contractNames.includes(name)),
    };
  }, {
    nativeNames: Array.from(browserNativeNames),
    coreNames: [...expectedCoreNames],
    protectedCoreNames: [...protectedCoreContractNames],
    costingNames: [...expectedCostingNames],
    protectedCostingNames: [...protectedCostingContractNames],
    stocksNames: [...expectedStocksNames],
    protectedStocksNames: [...protectedStocksContractNames],
    runtimeNames: [...expectedRuntimeNames],
    protectedRuntimeNames: [...protectedRuntimeContractNames],
    supportNames: [...expectedSupportNames],
    eventsNames: [...expectedEventsNames],
    protectedEventsNames: [...protectedEventsContractNames],
  });

  expect(contract.version).toBe(1);
  expect(contract.finalized).toBe(true);
  expect(contract.readyResolved).toBe(true);
  expect(contract.contractNames).toEqual(legacyContractNames());
  expect(contract.namespaceNames).toEqual(contract.contractNames);
  expect(contract.missing).toEqual([]);
  expect(contract.invalidProxies).toEqual([]);
  expect(contract.coreNames).toEqual([...expectedCoreNames].sort());
  expect(contract.missingCoreRootProperties).toEqual([]);
  expect(contract.mismatchedCoreRootValues).toEqual([]);
  expect(contract.invalidCoreNamespaceDescriptors).toEqual([]);
  expect(contract.invalidCoreRootDescriptors).toEqual([]);
  expect(contract.mismatchedProtectedCoreValues).toEqual([]);
  expect(contract.costingNames).toEqual([...expectedCostingNames].sort());
  expect(contract.missingCostingRootProperties).toEqual([]);
  expect(contract.mismatchedCostingRootValues).toEqual([]);
  expect(contract.invalidCostingNamespaceDescriptors).toEqual([]);
  expect(contract.invalidCostingRootDescriptors).toEqual([]);
  expect(contract.mismatchedProtectedCostingValues).toEqual([]);
  expect(contract.stocksOrder).toEqual(expectedStocksNames);
  expect(contract.stocksNames).toEqual([...expectedStocksNames].sort());
  expect(contract.missingStocksRootProperties).toEqual([]);
  expect(contract.mismatchedStocksRootValues).toEqual([]);
  expect(contract.invalidStocksNamespaceDescriptors).toEqual([]);
  expect(contract.invalidStocksRootDescriptors).toEqual([]);
  expect(contract.mismatchedProtectedStocksValues).toEqual([]);
  expect(contract.runtimeOrder).toEqual(expectedRuntimeNames);
  expect(contract.runtimeNames).toEqual([...expectedRuntimeNames].sort());
  expect(contract.missingRuntimeRootProperties).toEqual([]);
  expect(contract.mismatchedRuntimeRootValues).toEqual([]);
  expect(contract.invalidRuntimeNamespaceDescriptors).toEqual([]);
  expect(contract.invalidRuntimeRootDescriptors).toEqual([]);
  expect(contract.mismatchedProtectedRuntimeValues).toEqual([]);
  expect(contract.supportOrder).toEqual(expectedSupportNames);
  expect(contract.supportNames).toEqual([...expectedSupportNames].sort());
  expect(contract.missingSupportRootProperties).toEqual([]);
  expect(contract.mismatchedSupportRootValues).toEqual([]);
  expect(contract.invalidSupportNamespaceDescriptors).toEqual([]);
  expect(contract.invalidSupportRootDescriptors).toEqual([]);
  expect(contract.eventsOrder).toEqual(expectedEventsNames);
  expect(contract.eventsNames).toEqual([...expectedEventsNames].sort());
  expect(contract.missingEventsRootProperties).toEqual([]);
  expect(contract.mismatchedEventsRootValues).toEqual([]);
  expect(contract.invalidEventsNamespaceDescriptors).toEqual([]);
  expect(contract.invalidEventsRootDescriptors).toEqual([]);
  expect(contract.mismatchedProtectedEventsValues).toEqual([]);
  expect(contract.missingBrowserNatives).toEqual([]);
  expect(contract.facadeBrowserNatives).toEqual([]);

  const proxyResult = await page.evaluate(() => {
    const appWindow = window as typeof window & {
      MatchaLunaApp: {
        domains: {
          core: Record<string, unknown>;
          costing: Record<string, unknown>;
          stocks: Record<string, unknown>;
          events: Record<string, unknown>;
          legacy: Record<string, unknown>;
        };
      };
      state: unknown;
      renderAll: unknown;
      categoryModalOpen: boolean;
      num: unknown;
      UNIT_FACTOR: unknown;
      suggestedPrice: unknown;
      stockSourcePayload: unknown;
      activateAppTab: unknown;
    };
    const core = appWindow.MatchaLunaApp.domains.core;
    const costing = appWindow.MatchaLunaApp.domains.costing;
    const stocks = appWindow.MatchaLunaApp.domains.stocks;
    const events = appWindow.MatchaLunaApp.domains.events;
    const legacy = appWindow.MatchaLunaApp.domains.legacy;
    const originalState = appWindow.state;
    const originalRenderAll = appWindow.renderAll;
    const originalCategoryModalOpen = appWindow.categoryModalOpen;
    const originalNum = appWindow.num;
    const originalUnitFactor = appWindow.UNIT_FACTOR;
    const originalSuggestedPrice = appWindow.suggestedPrice;
    const originalStockSourcePayload = appWindow.stockSourcePayload;
    const originalActivateAppTab = appWindow.activateAppTab;
    const stateFromNamespace = { source: 'namespace' };
    const stateFromGlobal = { source: 'global' };
    const renderFromNamespace = () => 'namespace';
    const renderFromGlobal = () => 'global';
    const numFromNamespace = () => 1;
    const numFromGlobal = () => 2;
    const unitFactorFromNamespace = { g: 11 };
    const unitFactorFromGlobal = { g: 22 };
    const suggestedPriceFromNamespace = () => 33;
    const suggestedPriceFromGlobal = () => 44;
    const stockSourcePayloadFromNamespace = () => 55;
    const stockSourcePayloadFromGlobal = () => 66;
    const activateAppTabFromNamespace = () => 77;
    const activateAppTabFromGlobal = () => 88;

    try {
      legacy.state = stateFromNamespace;
      const namespaceStateReachedGlobal = appWindow.state === stateFromNamespace;
      appWindow.state = stateFromGlobal;
      const globalStateReachedNamespace = legacy.state === stateFromGlobal;

      legacy.renderAll = renderFromNamespace;
      const namespaceFunctionReachedGlobal = appWindow.renderAll === renderFromNamespace;
      appWindow.renderAll = renderFromGlobal;
      const globalFunctionReachedNamespace = legacy.renderAll === renderFromGlobal;

      legacy.categoryModalOpen = true;
      const namespacePrimitiveReachedGlobal = appWindow.categoryModalOpen === true;
      appWindow.categoryModalOpen = false;
      const globalPrimitiveReachedNamespace = legacy.categoryModalOpen === false;

      core.num = numFromNamespace;
      const coreFunctionReachedGlobal = appWindow.num === numFromNamespace;
      appWindow.num = numFromGlobal;
      const globalFunctionReachedCore = core.num === numFromGlobal;

      core.UNIT_FACTOR = unitFactorFromNamespace;
      const coreObjectReachedGlobal = appWindow.UNIT_FACTOR === unitFactorFromNamespace;
      appWindow.UNIT_FACTOR = unitFactorFromGlobal;
      const globalObjectReachedCore = core.UNIT_FACTOR === unitFactorFromGlobal;

      costing.suggestedPrice = suggestedPriceFromNamespace;
      const costingFunctionReachedGlobal =
        appWindow.suggestedPrice === suggestedPriceFromNamespace;
      appWindow.suggestedPrice = suggestedPriceFromGlobal;
      const globalFunctionReachedCosting =
        costing.suggestedPrice === suggestedPriceFromGlobal;

      stocks.stockSourcePayload = stockSourcePayloadFromNamespace;
      const stocksFunctionReachedGlobal =
        appWindow.stockSourcePayload === stockSourcePayloadFromNamespace;
      appWindow.stockSourcePayload = stockSourcePayloadFromGlobal;
      const globalFunctionReachedStocks =
        stocks.stockSourcePayload === stockSourcePayloadFromGlobal;

      events.activateAppTab = activateAppTabFromNamespace;
      const eventsFunctionReachedGlobal =
        appWindow.activateAppTab === activateAppTabFromNamespace;
      appWindow.activateAppTab = activateAppTabFromGlobal;
      const globalFunctionReachedEvents =
        events.activateAppTab === activateAppTabFromGlobal;

      return {
        namespaceStateReachedGlobal,
        globalStateReachedNamespace,
        namespaceFunctionReachedGlobal,
        globalFunctionReachedNamespace,
        namespacePrimitiveReachedGlobal,
        globalPrimitiveReachedNamespace,
        coreFunctionReachedGlobal,
        globalFunctionReachedCore,
        coreObjectReachedGlobal,
        globalObjectReachedCore,
        costingFunctionReachedGlobal,
        globalFunctionReachedCosting,
        stocksFunctionReachedGlobal,
        globalFunctionReachedStocks,
        eventsFunctionReachedGlobal,
        globalFunctionReachedEvents,
      };
    } finally {
      appWindow.state = originalState;
      appWindow.renderAll = originalRenderAll;
      appWindow.categoryModalOpen = originalCategoryModalOpen;
      appWindow.num = originalNum;
      appWindow.UNIT_FACTOR = originalUnitFactor;
      appWindow.suggestedPrice = originalSuggestedPrice;
      appWindow.stockSourcePayload = originalStockSourcePayload;
      appWindow.activateAppTab = originalActivateAppTab;
    }
  });

  expect(proxyResult).toEqual({
    namespaceStateReachedGlobal: true,
    globalStateReachedNamespace: true,
    namespaceFunctionReachedGlobal: true,
    globalFunctionReachedNamespace: true,
    namespacePrimitiveReachedGlobal: true,
    globalPrimitiveReachedNamespace: true,
    coreFunctionReachedGlobal: true,
    globalFunctionReachedCore: true,
    coreObjectReachedGlobal: true,
    globalObjectReachedCore: true,
    costingFunctionReachedGlobal: true,
    globalFunctionReachedCosting: true,
    stocksFunctionReachedGlobal: true,
    globalFunctionReachedStocks: true,
    eventsFunctionReachedGlobal: true,
    globalFunctionReachedEvents: true,
  });

  const moduleBridgeResult = await page.evaluate(() => {
    const appWindow = window as typeof window & {
      MatchaLunaApp: {
        domains: Record<string, Record<string, unknown>>;
        registerModule: (
          domain: string,
          descriptors: Record<string, PropertyDescriptor>,
        ) => Record<string, unknown>;
      };
      __phase2ModuleBridge?: string;
    };
    let value = 'initial';
    const namespace = appWindow.MatchaLunaApp.registerModule('future', {
      __phase2ModuleBridge: {
        get: () => value,
        set: (next: string) => {
          value = next;
        },
      },
    });
    try {
      namespace.__phase2ModuleBridge = 'from-namespace';
      const namespaceReachedGlobal = appWindow.__phase2ModuleBridge === 'from-namespace';
      appWindow.__phase2ModuleBridge = 'from-global';
      const globalReachedNamespace = namespace.__phase2ModuleBridge === 'from-global';
      return { namespaceReachedGlobal, globalReachedNamespace };
    } finally {
      delete appWindow.__phase2ModuleBridge;
      delete namespace.__phase2ModuleBridge;
    }
  });

  expect(moduleBridgeResult).toEqual({ namespaceReachedGlobal: true, globalReachedNamespace: true });
});
