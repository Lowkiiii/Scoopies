import {
  incrementRuntimeBinding,
  readStocksBinding,
  runtimeValue,
} from './bindings';
import {
  stockNormalizeItem,
  stockNormalizeTransaction,
  stockRequestIsCurrent,
  stockSourcePayload,
} from './domain';
import {
  stockErrorText,
  stockRecoverStoredPending,
} from './mutations';
import { stockRecoverSourceDeletes } from './source-lifecycle';
import { stockScopedSourceDeletes } from './storage';
import type { LegacyValue } from './types';

export async function loadStocks(options?: LegacyValue): Promise<boolean> {
  options = options || {};
  if (
    !runtimeValue('cloud').client ||
    !runtimeValue('session') ||
    !runtimeValue('session').user ||
    !runtimeValue('posContext').businessId
  ) {
    runtimeValue('stockState').error =
      'Sign in and connect the POS workspace to use Stocks.';
    runtimeValue('stockState').loaded = true;
    runtimeValue('renderStocks')();
    return false;
  }
  if (
    runtimeValue('stockState').loading ||
    runtimeValue('stockState').refreshing ||
    runtimeValue('stockModal').submitting
  ) {
    return false;
  }
  const background = !!options.background;
  const generation = incrementRuntimeBinding('stockLoadGeneration');
  const userId = String(runtimeValue('session').user.id || '');
  const businessId = String(runtimeValue('posContext').businessId || '');
  runtimeValue('stockState').loading = !background;
  runtimeValue('stockState').refreshing = background;
  runtimeValue('stockState').error = '';
  runtimeValue('stockState').sourceConflict = '';
  if (!background) runtimeValue('stockState').notice = '';
  runtimeValue('renderStocks')();
  let syncWarning = '';
  let sourceRecoveryNotice = '';
  try {
    await readStocksBinding(
      'stockRecoverSourceDeletes',
      stockRecoverSourceDeletes,
    )();
    sourceRecoveryNotice = runtimeValue('stockState').notice;
    if (
      !readStocksBinding(
        'stockRequestIsCurrent',
        stockRequestIsCurrent,
      )(generation, userId, businessId)
    ) {
      return false;
    }
    if (
      runtimeValue('stockCanManage')() &&
      !readStocksBinding(
        'stockScopedSourceDeletes',
        stockScopedSourceDeletes,
      )().length
    ) {
      if (
        runtimeValue('costingCloudReady') &&
        !runtimeValue('pendingSave') &&
        !runtimeValue('localDirty') &&
        !runtimeValue('pendingRemote') &&
        !runtimeValue('saveTimer')
      ) {
        try {
          const syncRows = runtimeValue('rpcRows')(
            await runtimeValue('cloud').client.rpc(
              'pos_inventory_sync_items',
              {
                p_business_id: businessId,
                p_items: readStocksBinding(
                  'stockSourcePayload',
                  stockSourcePayload,
                )(runtimeValue('syncedState')),
              },
            ),
          );
          const inactiveSources = syncRows
            .filter(function (row: LegacyValue) {
              return row && row.active === false;
            })
            .map(function (row: LegacyValue) {
              return String(
                row.name ||
                  row.source_costing_ingredient_id ||
                  'ingredient',
              );
            });
          if (inactiveSources.length) {
            runtimeValue('stockState').sourceConflict =
              'Costing still contains archived stock ' +
              (inactiveSources.length === 1 ? 'source' : 'sources') +
              ': ' +
              inactiveSources.join(', ') +
              '. Create a new ingredient ID and replace old recipe references; the archived ledger identity will not be reused.';
            syncWarning = runtimeValue('stockState').sourceConflict;
          }
        } catch (caughtError) {
          const syncError = caughtError as LegacyValue;
          if (String((syncError && syncError.code) || '') === '42501') {
            throw syncError;
          }
          syncWarning = readStocksBinding(
            'stockErrorText',
            stockErrorText,
          )(syncError);
          if (String((syncError && syncError.code) || '') === '55000') {
            runtimeValue('stockState').sourceConflict = String(
              (syncError && syncError.message) || syncWarning,
            );
          }
        }
      } else {
        syncWarning = runtimeValue('costingCloudReady')
          ? 'Costing changes are still saving, so new or edited sources will appear in Stocks after the cloud confirms them.'
          : 'Costing is not fully synced, so ingredient names were not refreshed.';
      }
    } else if (
      readStocksBinding(
        'stockScopedSourceDeletes',
        stockScopedSourceDeletes,
      )().length
    ) {
      syncWarning =
        'Costing-to-stock sync is paused until the pending source recovery is confirmed.';
    }
    const itemRequest = runtimeValue('cloud').client.rpc(
      'pos_inventory_get_items',
      {
        p_business_id: businessId,
        p_include_inactive: false,
      },
    );
    const historyRequest = runtimeValue('stockCanManage')()
      ? runtimeValue('cloud').client.rpc(
          'pos_inventory_get_transactions',
          {
            p_business_id: businessId,
            p_inventory_item_id: null,
            p_limit: 100,
          },
        )
      : Promise.resolve({ data: [], error: null });
    const responses = await Promise.all([itemRequest, historyRequest]);
    if (
      !readStocksBinding(
        'stockRequestIsCurrent',
        stockRequestIsCurrent,
      )(generation, userId, businessId)
    ) {
      return false;
    }
    runtimeValue('stockState').items = runtimeValue('rpcRows')(
      responses[0],
    ).map(
      readStocksBinding('stockNormalizeItem', stockNormalizeItem),
    );
    runtimeValue('stockState').transactions = runtimeValue('rpcRows')(
      responses[1],
    ).map(
      readStocksBinding(
        'stockNormalizeTransaction',
        stockNormalizeTransaction,
      ),
    );
    runtimeValue('stockState').loaded = true;
    runtimeValue('stockState').error = '';
    runtimeValue('stockState').notice = sourceRecoveryNotice;
    runtimeValue('stockState').lastUpdatedAt = Date.now();
    await readStocksBinding(
      'stockRecoverStoredPending',
      stockRecoverStoredPending,
    )();
    if (
      !readStocksBinding(
        'stockRequestIsCurrent',
        stockRequestIsCurrent,
      )(generation, userId, businessId)
    ) {
      return false;
    }
    if (syncWarning) {
      runtimeValue('stockState').notice =
        (runtimeValue('stockState').notice
          ? runtimeValue('stockState').notice + ' '
          : '') + syncWarning;
    }
    return true;
  } catch (caughtError) {
    const error = caughtError as LegacyValue;
    if (
      !readStocksBinding(
        'stockRequestIsCurrent',
        stockRequestIsCurrent,
      )(generation, userId, businessId)
    ) {
      return false;
    }
    const message = readStocksBinding(
      'stockErrorText',
      stockErrorText,
    )(error);
    if (background && runtimeValue('stockState').items.length) {
      runtimeValue('stockState').notice =
        'Showing the last loaded stock amounts. ' + message;
      runtimeValue('stockState').error = '';
    } else {
      runtimeValue('stockState').error = message;
      runtimeValue('stockState').loaded = true;
    }
    if (String((error && error.code) || '') === '42501') {
      runtimeValue('stockState').items = [];
      runtimeValue('stockState').transactions = [];
    }
    return false;
  } finally {
    if (
      readStocksBinding(
        'stockRequestIsCurrent',
        stockRequestIsCurrent,
      )(generation, userId, businessId)
    ) {
      runtimeValue('stockState').loading = false;
      runtimeValue('stockState').refreshing = false;
      runtimeValue('renderStocks')();
    }
  }
}

export async function openStocks(refresh: LegacyValue): Promise<boolean> {
  if (!runtimeValue('session')) {
    runtimeValue('renderStocks')();
    return false;
  }
  if (!runtimeValue('posContext').businessId) {
    const ready = await runtimeValue('loadPosContext')();
    if (!ready || !runtimeValue('posContext').businessId) {
      runtimeValue('renderStocks')();
      return false;
    }
  }
  if (runtimeValue('stockState').loaded && !refresh) {
    runtimeValue('renderStocks')();
    return true;
  }
  return readStocksBinding('loadStocks', loadStocks)({
    background: !!(
      runtimeValue('stockState').loaded &&
      runtimeValue('stockState').items.length
    ),
  });
}
