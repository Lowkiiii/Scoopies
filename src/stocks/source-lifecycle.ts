import {
  readStocksBinding,
  runtimeValue,
  writeRuntimeBinding,
} from './bindings';
import { stockBaseUnitForIngredient } from './domain';
import { stockSourceGuardMessage } from './mutations';
import {
  stockAdoptRemoteCosting,
  stockBuildSourceDelete,
  stockClearSourceDelete,
  stockSaveSourceDelete,
  stockScopedSourceDeletes,
} from './storage';
import type { LegacyValue } from './types';

export async function stockRecoverSourceDeletes(): Promise<number> {
  const records = readStocksBinding(
    'stockScopedSourceDeletes',
    stockScopedSourceDeletes,
  )();
  if (
    !records.length ||
    !runtimeValue('stockCanManage')() ||
    !runtimeValue('cloud').client
  ) {
    return 0;
  }
  let remote: LegacyValue;
  try {
    remote = await runtimeValue('cloudLoad')();
  } catch (_error) {
    runtimeValue('stockState').notice =
      'A confirmed ingredient deletion is waiting for its inventory archive. Reconnect and refresh Stocks.';
    return 0;
  }
  if (remote === null) {
    runtimeValue('stockState').notice =
      'The cloud costing document is unavailable, so ingredient deletion recovery was kept for a later refresh.';
    return 0;
  }
  let archived = 0;
  let restored = 0;
  let failed = 0;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (
      runtimeValue('getById')(
        remote.ingredients || [],
        record.sourceId,
      )
    ) {
      const savedLocally = readStocksBinding(
        'stockAdoptRemoteCosting',
        stockAdoptRemoteCosting,
      )(remote);
      if (
        savedLocally &&
        readStocksBinding(
          'stockClearSourceDelete',
          stockClearSourceDelete,
        )(record)
      ) {
        restored += 1;
      } else {
        failed += 1;
      }
      continue;
    }
    try {
      const prepared = runtimeValue('rpcRows')(
        await runtimeValue('cloud').client.rpc(
          'pos_inventory_prepare_source_delete',
          {
            p_business_id: record.businessId,
            p_source_costing_ingredient_id: record.sourceId,
            p_item_kind: record.kind,
            p_name: record.name,
            p_base_unit: record.baseUnit,
          },
        ),
      );
      if (prepared[0] !== true) {
        throw {
          code: '55000',
          message: 'The source deletion was not committed.',
        };
      }
      const confirmedRemote = await runtimeValue('cloudLoad')();
      if (
        !confirmedRemote ||
        runtimeValue('getById')(
          confirmedRemote.ingredients || [],
          record.sourceId,
        )
      ) {
        throw new Error('The costing deletion could not be verified.');
      }
      if (
        readStocksBinding(
          'stockAdoptRemoteCosting',
          stockAdoptRemoteCosting,
        )(confirmedRemote) &&
        readStocksBinding(
          'stockClearSourceDelete',
          stockClearSourceDelete,
        )(record)
      ) {
        archived += 1;
      } else {
        failed += 1;
      }
    } catch (_error) {
      failed += 1;
    }
  }
  const notices: string[] = [];
  if (restored) {
    notices.push(
      'The cloud still contained ' +
        restored +
        ' ingredient ' +
        (restored === 1 ? 'source' : 'sources') +
        ', so the local deletion was cancelled safely.',
    );
  }
  if (archived) {
    notices.push(
      'Recovered ' +
        archived +
        ' pending ingredient ' +
        (archived === 1 ? 'archive' : 'archives') +
        ' safely.',
    );
  }
  if (failed) {
    notices.push(
      'A confirmed ingredient deletion is still waiting for recovery. No source ID will be reused while it is pending.',
    );
  }
  if (notices.length) runtimeValue('stockState').notice = notices.join(' ');
  return archived;
}

export async function stockEnsureSourceWorkspace(
  verb: LegacyValue,
): Promise<boolean> {
  if (!runtimeValue('session')) return true;
  if (!runtimeValue('cloud').connected || !runtimeValue('cloud').client) {
    alert(
      'Reconnect to the cloud before you ' +
        verb +
        ' this ingredient so its stock history stays safe.',
    );
    return false;
  }
  if (!runtimeValue('posContext').businessId) {
    const ready = await runtimeValue('loadPosContext')();
    if (!ready || !runtimeValue('posContext').businessId) {
      alert(
        runtimeValue('posContext').error ||
          'The inventory workspace could not be opened.',
      );
      return false;
    }
  }
  if (!runtimeValue('stockCanManage')()) {
    alert(
      'Only an owner or manager can ' +
        verb +
        ' an ingredient that may have stock history.',
    );
    return false;
  }
  return true;
}

export async function deleteIngredientSafely(
  id: LegacyValue,
): Promise<boolean> {
  id = String(id || '');
  if (!id || runtimeValue('stockSourceMutations')[id]) return false;
  runtimeValue('consumePendingRemoteForCommit')(false);
  let target = runtimeValue('getById')(
    runtimeValue('state').ingredients,
    id,
  );
  let usedBy = runtimeValue('ingredientUsage')(id);
  if (!target) {
    runtimeValue('renderAll')();
    return false;
  }
  if (usedBy.length) {
    alert(
      'Cannot delete "' +
        (target.name || 'this item') +
        '" because it is used by ' +
        usedBy.join(', ') +
        '. Remove or replace it there first.',
    );
    return false;
  }
  if (!confirm('Delete "' + (target.name || 'this ingredient') + '"?')) {
    return false;
  }
  runtimeValue('stockSourceMutations')[id] = true;
  writeRuntimeBinding('costingSourceCommitInFlight', true);
  let sourceIdentity: LegacyValue = null;
  let sourceDeleteRecord: LegacyValue = null;
  try {
    if (!runtimeValue('session')) {
      const knownOfflineSource = runtimeValue('getById')(
        (runtimeValue('syncedState') &&
          runtimeValue('syncedState').ingredients) ||
          [],
        id,
      );
      if (knownOfflineSource) {
        alert(
          'Reconnect to the cloud before deleting this ingredient so its inventory identity and stock history stay safe.',
        );
        runtimeValue('renderAll')();
        return false;
      }
      runtimeValue('state').ingredients = runtimeValue(
        'state',
      ).ingredients.filter(function (item: LegacyValue) {
        return item.id !== id;
      });
      runtimeValue('stockState').items = runtimeValue(
        'stockState',
      ).items.filter(function (item: LegacyValue) {
        return item.sourceId !== id;
      });
      runtimeValue('logChanges')();
      runtimeValue('save')();
      runtimeValue('renderAll')();
      return true;
    }
    if (
      !(await readStocksBinding(
        'stockEnsureSourceWorkspace',
        stockEnsureSourceWorkspace,
      )('delete'))
    ) {
      runtimeValue('renderAll')();
      return false;
    }
    runtimeValue('consumePendingRemoteForCommit')(false);
    target = runtimeValue('getById')(
      runtimeValue('state').ingredients,
      id,
    );
    if (!target) {
      runtimeValue('renderAll')();
      return false;
    }
    usedBy = runtimeValue('ingredientUsage')(id);
    if (usedBy.length) {
      alert(
        'This ingredient is now used by ' +
          usedBy.join(', ') +
          '. Remove or replace it there first.',
      );
      runtimeValue('renderAll')();
      return false;
    }
    const remoteBefore = await runtimeValue('cloudLoad')();
    if (!remoteBefore) {
      throw new Error('The cloud costing document could not be loaded.');
    }
    const remoteTarget = runtimeValue('getById')(
      remoteBefore.ingredients || [],
      id,
    );
    if (!remoteTarget) {
      const inventoryRows = runtimeValue('rpcRows')(
        await runtimeValue('cloud').client.rpc('pos_inventory_get_items', {
          p_business_id: String(runtimeValue('posContext').businessId),
          p_include_inactive: true,
        }),
      );
      const inventorySource = inventoryRows.find(function (
        row: LegacyValue,
      ) {
        return String(
          (row && row.source_costing_ingredient_id) || '',
        ) === id;
      });
      if (inventorySource && inventorySource.active !== false) {
        throw {
          code: '55000',
          message:
            'Stocks has an active identity for this ingredient even though the cloud costing source is missing. Refresh and reconcile Stocks before deleting it.',
        };
      }
      runtimeValue('state').ingredients = runtimeValue(
        'state',
      ).ingredients.filter(function (item: LegacyValue) {
        return item.id !== id;
      });
      if (
        !readStocksBinding(
          'stockAdoptRemoteCosting',
          stockAdoptRemoteCosting,
        )(remoteBefore)
      ) {
        throw new Error(
          'The ingredient was already deleted in the cloud, but this browser could not save the merged result locally.',
        );
      }
      runtimeValue('stockState').items = runtimeValue(
        'stockState',
      ).items.filter(function (item: LegacyValue) {
        return item.sourceId !== id;
      });
      if (
        !runtimeValue('sameDataValue')(runtimeValue('state'), remoteBefore)
      ) {
        runtimeValue('save')();
      } else {
        runtimeValue('setStatus')('Updated from cloud ✓', 'good');
      }
      runtimeValue('renderAll')();
      return true;
    }
    runtimeValue('rpcRows')(
      await runtimeValue('cloud').client.rpc(
        'pos_inventory_validate_source_delete',
        {
          p_business_id: String(runtimeValue('posContext').businessId),
          p_source_costing_ingredient_id: id,
        },
      ),
    );
    sourceIdentity = {
      kind: runtimeValue('isMixture')(remoteTarget)
        ? 'mixture'
        : 'purchased',
      name: String(remoteTarget.name || '').trim(),
      baseUnit: readStocksBinding(
        'stockBaseUnitForIngredient',
        stockBaseUnitForIngredient,
      )(remoteTarget),
    };
    sourceDeleteRecord = readStocksBinding(
      'stockBuildSourceDelete',
      stockBuildSourceDelete,
    )(remoteTarget);
    if (
      !readStocksBinding(
        'stockSaveSourceDelete',
        stockSaveSourceDelete,
      )(sourceDeleteRecord)
    ) {
      alert(
        'This browser could not save deletion recovery, so nothing was deleted. Free browser storage or allow local storage, then try again.',
      );
      return false;
    }
    const prepared = runtimeValue('rpcRows')(
      await runtimeValue('cloud').client.rpc(
        'pos_inventory_prepare_source_delete',
        {
          p_business_id: String(runtimeValue('posContext').businessId),
          p_source_costing_ingredient_id: id,
          p_item_kind: sourceIdentity.kind,
          p_name: sourceIdentity.name,
          p_base_unit: sourceIdentity.baseUnit,
        },
      ),
    );
    if (prepared[0] !== true) {
      throw {
        code: '55000',
        message: 'The database did not commit the ingredient deletion.',
      };
    }
    const confirmedRemote = await runtimeValue('cloudLoad')();
    if (
      !confirmedRemote ||
      runtimeValue('getById')(confirmedRemote.ingredients || [], id)
    ) {
      throw new Error('The cloud did not confirm the ingredient deletion.');
    }
    if (
      !readStocksBinding(
        'stockAdoptRemoteCosting',
        stockAdoptRemoteCosting,
      )(confirmedRemote)
    ) {
      throw new Error(
        'The deletion succeeded, but this browser could not save the confirmed result locally.',
      );
    }
    if (
      !readStocksBinding(
        'stockClearSourceDelete',
        stockClearSourceDelete,
      )(sourceDeleteRecord)
    ) {
      throw new Error(
        'The deletion succeeded, but its recovery marker could not be cleared.',
      );
    }
    runtimeValue('logChanges')();
    runtimeValue('stockState').items = runtimeValue(
      'stockState',
    ).items.filter(function (item: LegacyValue) {
      return item.sourceId !== id;
    });
    runtimeValue('stockState').loaded = false;
    runtimeValue('renderAll')();
    return true;
  } catch (error) {
    if (sourceDeleteRecord) {
      try {
        const checkedRemote = await runtimeValue('cloudLoad')();
        if (
          checkedRemote &&
          !runtimeValue('getById')(checkedRemote.ingredients || [], id)
        ) {
          if (
            readStocksBinding(
              'stockAdoptRemoteCosting',
              stockAdoptRemoteCosting,
            )(checkedRemote) &&
            readStocksBinding(
              'stockClearSourceDelete',
              stockClearSourceDelete,
            )(sourceDeleteRecord)
          ) {
            runtimeValue('logChanges')();
            runtimeValue('stockState').items = runtimeValue(
              'stockState',
            ).items.filter(function (item: LegacyValue) {
              return item.sourceId !== id;
            });
            runtimeValue('stockState').loaded = false;
            alert(
              'The response was interrupted, but the ingredient deletion was verified and recovered safely.',
            );
            runtimeValue('renderAll')();
            return true;
          }
        } else if (checkedRemote) {
          readStocksBinding(
            'stockAdoptRemoteCosting',
            stockAdoptRemoteCosting,
          )(checkedRemote);
          readStocksBinding(
            'stockClearSourceDelete',
            stockClearSourceDelete,
          )(sourceDeleteRecord);
          alert(
            readStocksBinding(
              'stockSourceGuardMessage',
              stockSourceGuardMessage,
            )(error, 'delete'),
          );
          runtimeValue('renderAll')();
          return false;
        }
      } catch (_verificationError) {}
      runtimeValue('stockState').loaded = false;
      runtimeValue('stockState').notice =
        'An ingredient deletion could not be confirmed. Its exact recovery record is saved; reconnect and refresh Stocks before making more costing changes.';
      alert(
        'The connection stopped before the atomic ingredient deletion could be confirmed. Refresh Stocks when online; the app will verify the exact result before syncing anything else.',
      );
      runtimeValue('renderAll')();
      return false;
    }
    alert(
      readStocksBinding(
        'stockSourceGuardMessage',
        stockSourceGuardMessage,
      )(error, 'delete'),
    );
    runtimeValue('renderAll')();
    return false;
  } finally {
    writeRuntimeBinding('costingSourceCommitInFlight', false);
    Reflect.deleteProperty(runtimeValue('stockSourceMutations'), id);
  }
}

export async function changeIngredientUnitSafely(
  id: LegacyValue,
  nextUnit: LegacyValue,
): Promise<boolean> {
  id = String(id || '');
  nextUnit = String(nextUnit || '');
  if (!id || runtimeValue('stockSourceMutations')[id]) {
    runtimeValue('renderAll')();
    return false;
  }
  runtimeValue('consumePendingRemoteForCommit')(false);
  const ingredient = runtimeValue('getById')(
    runtimeValue('state').ingredients,
    id,
  );
  if (!ingredient) {
    runtimeValue('renderAll')();
    return false;
  }
  if (!runtimeValue('UNIT_TYPE')[nextUnit]) {
    alert('Choose a valid ingredient unit.');
    runtimeValue('renderAll')();
    return false;
  }
  if (
    runtimeValue('UNIT_TYPE')[ingredient.unit] ===
    runtimeValue('UNIT_TYPE')[nextUnit]
  ) {
    if (runtimeValue('isMixture')(ingredient)) {
      ingredient.batchYield = runtimeValue('convertUnitQuantity')(
        ingredient.batchYield,
        ingredient.unit,
        nextUnit,
      );
    } else if (ingredient.amountPerItem != null) {
      ingredient.amountPerItem = runtimeValue('convertUnitQuantity')(
        ingredient.amountPerItem,
        ingredient.unit,
        nextUnit,
      );
    } else {
      ingredient.qty = runtimeValue('convertUnitQuantity')(
        ingredient.qty,
        ingredient.unit,
        nextUnit,
      );
    }
    ingredient.unit = nextUnit;
    runtimeValue('logChanges')();
    runtimeValue('save')();
    runtimeValue('renderAll')();
    return true;
  }
  alert(
    'For inventory safety, an existing ingredient cannot change between weight, volume, or pieces. Add a new ingredient with the correct unit, replace its recipe uses, then delete the old ingredient when its stock balance is zero.',
  );
  runtimeValue('renderAll')();
  return false;
}
