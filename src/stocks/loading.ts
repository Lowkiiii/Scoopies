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

function stockNoticeWithUniqueMessage(
  current: LegacyValue,
  message: LegacyValue,
): string {
  const next = String(message || '').trim();
  const existing = String(current || '').trim();
  if (!next) return existing;
  const withoutDuplicate = existing
    .split(next)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [withoutDuplicate, next].filter(Boolean).join(' ');
}

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
          let syncRows: LegacyValue[];
          try {
            syncRows = runtimeValue('rpcRows')(
              await runtimeValue('cloud').client.rpc(
                'pos_inventory_sync_spreadsheet_sources',
                { p_business_id: businessId },
              ),
            );
          } catch (error) {
            const code = String((error as LegacyValue)?.code || '');
            const message = String((error as LegacyValue)?.message || '');
            if (code !== 'PGRST202' && !/function.*not found|schema cache/i.test(message)) {
              throw error;
            }
            const ingredientPayload = readStocksBinding(
              'stockSourcePayload',
              stockSourcePayload,
            )(runtimeValue('syncedState')).filter(function (source: LegacyValue) {
              return source.sourceType === 'ingredient';
            });
            syncRows = runtimeValue('rpcRows')(
              await runtimeValue('cloud').client.rpc(
                'pos_inventory_sync_items',
                {
                  p_business_id: businessId,
                  p_items: ingredientPayload,
                },
              ),
            );
          }
          const inactiveSources = syncRows
            .filter(function (row: LegacyValue) {
              return row &&
                (row.active === false || row.sync_result === 'inactive');
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
    const itemRequest = (async function (): Promise<LegacyValue[]> {
      try {
        return runtimeValue('rpcRows')(
          await runtimeValue('cloud').client.rpc(
            'pos_inventory_get_spreadsheet',
            {
              p_business_id: businessId,
              p_period_id: null,
            },
          ),
        );
      } catch (error) {
        const code = String((error as LegacyValue)?.code || '');
        const message = String((error as LegacyValue)?.message || '');
        if (code !== 'PGRST202' && !/function.*not found|schema cache/i.test(message)) {
          throw error;
        }
        return runtimeValue('rpcRows')(
          await runtimeValue('cloud').client.rpc(
            'pos_inventory_get_items',
            {
              p_business_id: businessId,
              p_include_inactive: false,
            },
          ),
        );
      }
    })();
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
    const itemRows = responses[0] as LegacyValue[];
    const periodRow = itemRows.find(function (row: LegacyValue) {
      return row && (row.active_period_id || row.period_id);
    });
    runtimeValue('stockState').activePeriod = periodRow
      ? {
          id: String(periodRow.active_period_id || periodRow.period_id || ''),
          name: String(periodRow.active_period_name || periodRow.period_name || 'Inventory period'),
          status: String(periodRow.active_period_status || periodRow.period_status || 'active'),
          openedAt: periodRow.active_period_opened_at || periodRow.opened_at || null,
          revision: Number(periodRow.active_period_revision || periodRow.period_revision || 0),
        }
      : null;
    runtimeValue('stockState').items = itemRows.map(
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
      runtimeValue('stockState').notice = stockNoticeWithUniqueMessage(
        runtimeValue('stockState').notice,
        syncWarning,
      );
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

export async function ensureActiveInventoryPeriod(
  options?: LegacyValue,
): Promise<boolean> {
  const state = runtimeValue<LegacyValue>('stockState');
  const announce = !options || options.announce !== false;
  if (state.activePeriod) return true;
  if (
    !runtimeValue<LegacyValue>('stockCanManage')() ||
    !runtimeValue<LegacyValue>('cloud').client ||
    !runtimeValue<LegacyValue>('session') ||
    !runtimeValue<LegacyValue>('session').user ||
    !runtimeValue<LegacyValue>('posContext').businessId ||
    state.loading ||
    state.refreshing ||
    state.startingPeriod ||
    state.sourceConflict ||
    runtimeValue<LegacyValue>('stockModal').submitting
  ) {
    return false;
  }

  state.startingPeriod = true;
  runtimeValue<LegacyValue>('renderStocks')();
  if (!state.pendingPeriodStartId) {
    const now = new Date();
    state.pendingPeriodStartId = runtimeValue<LegacyValue>('posUuid')();
    state.pendingPeriodStartName =
      'Inventory ' +
      now.toLocaleDateString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
  }

  const name = String(state.pendingPeriodStartName || 'Current inventory');
  try {
    const rows = runtimeValue<LegacyValue>('rpcRows')(
      await runtimeValue<LegacyValue>('cloud').client.rpc(
        'pos_inventory_start_period',
        {
          p_business_id: String(
            runtimeValue<LegacyValue>('posContext').businessId,
          ),
          p_client_period_id: state.pendingPeriodStartId,
          p_name: name,
          p_carry_forward: true,
        },
      ),
    );
    if (!rows.length) throw new Error('Missing inventory period response');
    await loadStocks({ background: true });
    if (!state.activePeriod) {
      throw new Error('The editable inventory could not be prepared. Try again.');
    }
    state.pendingPeriodStartId = '';
    state.pendingPeriodStartName = '';
    if (announce) {
      state.notice = 'Inventory is ready. Edit the white cells directly.';
    }
    return true;
  } catch (error) {
    const message = stockErrorText(error);
    await loadStocks({ background: true });
    if (state.activePeriod) {
      state.pendingPeriodStartId = '';
      state.pendingPeriodStartName = '';
      if (announce) {
        state.notice = 'Inventory is ready. Edit the white cells directly.';
      }
      return true;
    }
    state.notice =
      'Stock editing could not be prepared automatically. ' + message;
    return false;
  } finally {
    state.startingPeriod = false;
    runtimeValue<LegacyValue>('renderStocks')();
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
    if (
      !runtimeValue<LegacyValue>('stockState').activePeriod &&
      runtimeValue<LegacyValue>('stockState').items.length
    ) {
      await ensureActiveInventoryPeriod({ announce: false });
    }
    return true;
  }
  const loaded = await readStocksBinding('loadStocks', loadStocks)({
    background: !!(
      runtimeValue('stockState').loaded &&
      runtimeValue('stockState').items.length
    ),
  });
  if (
    loaded &&
    !runtimeValue<LegacyValue>('stockState').activePeriod &&
    runtimeValue<LegacyValue>('stockState').items.length
  ) {
    await ensureActiveInventoryPeriod({ announce: false });
  }
  return loaded;
}
