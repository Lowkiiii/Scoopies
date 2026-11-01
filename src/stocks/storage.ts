import {
  readStocksBinding,
  runtimeValue,
  writeRuntimeBinding,
} from './bindings';
import {
  reconcileCostingInventoryLifecycle,
  stockBaseUnitForIngredient,
} from './domain';
import type { LegacyValue } from './types';

export function stockPendingScope(
  userId: LegacyValue,
  businessId: LegacyValue,
): string {
  return String(userId || '') + '|' + String(businessId || '');
}

export function stockPendingStorageKey(record: LegacyValue): string {
  return (
    runtimeValue('STOCK_PENDING_KEY') +
    '|' +
    encodeURIComponent(String((record && record.userId) || '')) +
    '|' +
    encodeURIComponent(String((record && record.businessId) || '')) +
    '|' +
    encodeURIComponent(
      String(
        (record &&
          record.rpcArgs &&
          record.rpcArgs.p_client_transaction_id) ||
          '',
      ),
    )
  );
}

export function stockPendingRecords(): LegacyValue[] {
  const records: LegacyValue[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (
        !key ||
        key.indexOf(runtimeValue('STOCK_PENDING_KEY') + '|') !== 0
      ) {
        continue;
      }
      const record = JSON.parse(localStorage.getItem(key) as string);
      if (record && record.schemaVersion === 1) records.push(record);
    }
  } catch (_error) {}
  return records.sort(function (first: LegacyValue, second: LegacyValue) {
    return Number(first.savedAt || 0) - Number(second.savedAt || 0);
  });
}

export function stockBuildPending(
  request: LegacyValue,
  itemId: LegacyValue,
): LegacyValue {
  return {
    schemaVersion: 1,
    userId: String(
      (runtimeValue('session') &&
        runtimeValue('session').user &&
        runtimeValue('session').user.id) ||
        '',
    ),
    businessId: String(runtimeValue('posContext').businessId || ''),
    itemId: String(itemId || ''),
    rpcName: String((request && request.name) || ''),
    rpcArgs: runtimeValue('snapshot')((request && request.args) || {}),
    savedAt: Date.now(),
  };
}

export function stockSavePending(record: LegacyValue): boolean {
  if (
    !record ||
    !record.userId ||
    !record.businessId ||
    record.rpcName !== 'pos_inventory_record_transaction'
  ) {
    return false;
  }
  const key = readStocksBinding(
    'stockPendingStorageKey',
    stockPendingStorageKey,
  )(record);
  try {
    const existing = JSON.parse(localStorage.getItem(key) as string);
    if (
      existing &&
      JSON.stringify(existing.rpcArgs) !== JSON.stringify(record.rpcArgs)
    ) {
      return false;
    }
    localStorage.setItem(key, JSON.stringify(record));
    return true;
  } catch (_error) {
    return false;
  }
}

export function stockClearPending(record?: LegacyValue): boolean {
  record =
    record ||
    readStocksBinding('stockStoredPending', stockStoredPending)();
  if (!record) return false;
  const key = readStocksBinding(
    'stockPendingStorageKey',
    stockPendingStorageKey,
  )(record);
  try {
    const stored = JSON.parse(localStorage.getItem(key) as string);
    if (
      stored &&
      String(
        (stored.rpcArgs && stored.rpcArgs.p_client_transaction_id) || '',
      ) !==
        String(
          (record.rpcArgs && record.rpcArgs.p_client_transaction_id) || '',
        )
    ) {
      return false;
    }
    localStorage.removeItem(key);
    return true;
  } catch (_error) {
    return false;
  }
}

export function stockStoredPendings(): LegacyValue[] {
  if (
    !runtimeValue('session') ||
    !runtimeValue('session').user ||
    !runtimeValue('posContext').businessId
  ) {
    return [];
  }
  const scope = readStocksBinding(
    'stockPendingScope',
    stockPendingScope,
  )(
    runtimeValue('session').user.id,
    runtimeValue('posContext').businessId,
  );
  return readStocksBinding(
    'stockPendingRecords',
    stockPendingRecords,
  )().filter(function (record: LegacyValue) {
    return (
      readStocksBinding('stockPendingScope', stockPendingScope)(
        record.userId,
        record.businessId,
      ) === scope &&
      record.rpcName === 'pos_inventory_record_transaction' &&
      record.rpcArgs &&
      Array.isArray(record.rpcArgs.p_lines)
    );
  });
}

export function stockStoredPending(): LegacyValue {
  return (
    readStocksBinding('stockStoredPendings', stockStoredPendings)()[0] || null
  );
}

export function stockPendingStillCurrent(record: LegacyValue): boolean {
  return !!(
    record &&
    runtimeValue('session') &&
    runtimeValue('session').user &&
    String(record.userId) ===
      String(runtimeValue('session').user.id || '') &&
    String(record.businessId) ===
      String(runtimeValue('posContext').businessId || '')
  );
}

export function stockSourceDeleteStorageKey(record: LegacyValue): string {
  return (
    runtimeValue('STOCK_SOURCE_DELETE_KEY') +
    '|' +
    encodeURIComponent(String((record && record.userId) || '')) +
    '|' +
    encodeURIComponent(String((record && record.businessId) || '')) +
    '|' +
    encodeURIComponent(String((record && record.sourceId) || ''))
  );
}

export function stockSourceDeleteRecords(): LegacyValue[] {
  const records: LegacyValue[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (
        !key ||
        key.indexOf(runtimeValue('STOCK_SOURCE_DELETE_KEY') + '|') !== 0
      ) {
        continue;
      }
      const record = JSON.parse(localStorage.getItem(key) as string);
      if (record && record.schemaVersion === 1) records.push(record);
    }
  } catch (_error) {}
  return records;
}

export function stockSaveSourceDelete(record: LegacyValue): boolean {
  if (!record || !record.userId || !record.businessId || !record.sourceId) {
    return false;
  }
  try {
    localStorage.setItem(
      readStocksBinding(
        'stockSourceDeleteStorageKey',
        stockSourceDeleteStorageKey,
      )(record),
      JSON.stringify(record),
    );
    return true;
  } catch (_error) {
    return false;
  }
}

export function stockClearSourceDelete(record: LegacyValue): boolean {
  if (!record) return false;
  try {
    localStorage.removeItem(
      readStocksBinding(
        'stockSourceDeleteStorageKey',
        stockSourceDeleteStorageKey,
      )(record),
    );
    return true;
  } catch (_error) {
    return false;
  }
}

export function stockBuildSourceDelete(source: LegacyValue): LegacyValue {
  return {
    schemaVersion: 1,
    userId: String(
      (runtimeValue('session') &&
        runtimeValue('session').user &&
        runtimeValue('session').user.id) ||
        '',
    ),
    businessId: String(runtimeValue('posContext').businessId || ''),
    sourceId: String(source.id),
    kind: runtimeValue('isMixture')(source) ? 'mixture' : 'purchased',
    name: String(source.name || '').trim(),
    baseUnit: readStocksBinding(
      'stockBaseUnitForIngredient',
      stockBaseUnitForIngredient,
    )(source),
    source: runtimeValue('snapshot')(source),
    savedAt: Date.now(),
  };
}

export function stockAdoptRemoteCosting(remote: LegacyValue): boolean {
  if (!remote) return false;
  remote = runtimeValue('normalizeState')(remote);
  const baseline = runtimeValue('syncedState') || remote;
  const merged = runtimeValue('mergeStates')(
    baseline,
    runtimeValue('state'),
    remote,
  );
  const lifecycle = readStocksBinding(
    'reconcileCostingInventoryLifecycle',
    reconcileCostingInventoryLifecycle,
  )(remote, merged, baseline);
  writeRuntimeBinding('state', lifecycle.state);
  const clean = runtimeValue('sameDataValue')(
    runtimeValue('state'),
    remote,
  );
  let savedLocally = true;
  try {
    localStorage.setItem(
      runtimeValue('KEY'),
      JSON.stringify(runtimeValue('state')),
    );
  } catch (_storageError) {
    savedLocally = false;
  }
  runtimeValue('rememberSynced')(remote, clean);
  if (!clean) runtimeValue('markLocalDirty')();
  writeRuntimeBinding(
    'lastState',
    runtimeValue('snapshot')(runtimeValue('state')),
  );
  return savedLocally;
}

export function stockScopedSourceDeletes(): LegacyValue[] {
  if (
    !runtimeValue('session') ||
    !runtimeValue('session').user ||
    !runtimeValue('posContext').businessId
  ) {
    return [];
  }
  const scope = readStocksBinding(
    'stockPendingScope',
    stockPendingScope,
  )(
    runtimeValue('session').user.id,
    runtimeValue('posContext').businessId,
  );
  return readStocksBinding(
    'stockSourceDeleteRecords',
    stockSourceDeleteRecords,
  )().filter(function (record: LegacyValue) {
    return (
      readStocksBinding('stockPendingScope', stockPendingScope)(
        record.userId,
        record.businessId,
      ) === scope
    );
  });
}
