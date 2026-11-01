import {
  readStocksBinding,
  runtimeValue,
  writeRuntimeBinding,
} from './bindings';
import {
  stockClearPending,
  stockPendingStillCurrent,
  stockStoredPendings,
} from './storage';
import type { LegacyValue } from './types';

export function stockApplyMutationRows(
  request: LegacyValue,
  rows: LegacyValue,
): boolean {
  rows = Array.isArray(rows) ? rows : [];
  if (!request || !rows.length) return false;
  if (request.name === 'pos_inventory_set_threshold') {
    const thresholdRow = rows[0];
    const thresholdItem = runtimeValue('stockItemById')(
      thresholdRow.inventory_item_id,
    );
    if (!thresholdItem) return false;
    thresholdItem.threshold =
      thresholdRow.low_stock_threshold_base == null
        ? null
        : Number(thresholdRow.low_stock_threshold_base);
    thresholdItem.revision = Number(
      thresholdRow.revision || thresholdItem.revision,
    );
    thresholdItem.active = thresholdRow.active !== false;
    return true;
  }
  if (request.name !== 'pos_inventory_record_transaction') return false;
  let applied = false;
  rows.forEach(function (row: LegacyValue) {
    const item = runtimeValue('stockItemById')(row.inventory_item_id);
    if (!item || !row.transaction_id) return;
    const wasInitialized = item.initialized;
    item.balance = Number(row.balance_after_base);
    item.revision = Number(row.item_revision || item.revision);
    item.initialized = true;
    item.active = true;
    item.lastMovementAt = row.occurred_at || new Date().toISOString();
    item.lastMovementType = String(
      row.transaction_type || request.args.p_transaction_type || '',
    );
    const duplicate = runtimeValue('stockState').transactions.some(function (
      entry: LegacyValue,
    ) {
      return (
        entry.transactionId === String(row.transaction_id) &&
        entry.itemId === String(row.inventory_item_id)
      );
    });
    if (!duplicate) {
      runtimeValue('stockState').transactions.unshift({
        transactionId: String(row.transaction_id),
        itemId: String(row.inventory_item_id),
        itemName: String(row.item_name || item.name),
        type: String(
          row.transaction_type || request.args.p_transaction_type || '',
        ),
        delta: Number(row.quantity_delta_base || 0),
        before: Number(row.balance_before_base || 0),
        after: Number(row.balance_after_base || 0),
        unit: String(row.base_unit || item.baseUnit),
        reason: String(request.args.p_reason || ''),
        note: String(request.args.p_note || ''),
        actor: runtimeValue('actorName')(),
        occurredAt: row.occurred_at || new Date().toISOString(),
        itemSequence: wasInitialized ? 0 : 1,
        revisionBefore: Math.max(
          0,
          Number(row.item_revision || item.revision) - 1,
        ),
        revisionAfter: Number(row.item_revision || item.revision),
      });
    }
    applied = true;
  });
  if (runtimeValue('stockState').transactions.length > 100) {
    runtimeValue('stockState').transactions = runtimeValue(
      'stockState',
    ).transactions.slice(0, 100);
  }
  return applied;
}

export function stockRestorePendingModal(record: LegacyValue): boolean {
  const line =
    record &&
    record.rpcArgs &&
    record.rpcArgs.p_lines &&
    record.rpcArgs.p_lines[0];
  const item = line && runtimeValue('stockItemById')(line.inventoryItemId);
  if (!line || !item) return false;
  writeRuntimeBinding('stockModalReturnFocus', document.activeElement);
  writeRuntimeBinding('stockModal', runtimeValue('freshStockModal')());
  runtimeValue('stockModal').open = true;
  runtimeValue('stockModal').itemId = item.id;
  runtimeValue('stockModal').action = String(
    record.rpcArgs.p_transaction_type || '',
  );
  runtimeValue('stockModal').quantity = String(
    line.quantity == null ? '' : line.quantity,
  );
  runtimeValue('stockModal').unit = String(line.unit || item.baseUnit);
  runtimeValue('stockModal').reason = String(record.rpcArgs.p_reason || '');
  runtimeValue('stockModal').note = String(record.rpcArgs.p_note || '');
  runtimeValue('stockModal').uncertain = true;
  runtimeValue('stockModal').pendingRpc = {
    name: record.rpcName,
    args: runtimeValue('snapshot')(record.rpcArgs),
  };
  const modal = document.getElementById('stockModal');
  if (modal) modal.hidden = false;
  runtimeValue('refreshModalBodyClass')();
  runtimeValue('renderStockModal')();
  return true;
}

export async function stockRecoverStoredPending(): Promise<boolean> {
  const records = readStocksBinding(
    'stockStoredPendings',
    stockStoredPendings,
  )();
  if (
    !records.length ||
    !runtimeValue('stockCanManage')() ||
    !runtimeValue('cloud').client
  ) {
    return false;
  }
  let recovered = 0;
  const failed: LegacyValue[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    try {
      const rows = runtimeValue('rpcRows')(
        await runtimeValue('cloud').client.rpc(
          record.rpcName,
          record.rpcArgs,
        ),
      );
      if (
        !readStocksBinding(
          'stockPendingStillCurrent',
          stockPendingStillCurrent,
        )(record)
      ) {
        return false;
      }
      if (!rows.length) {
        throw new Error('Missing inventory recovery response');
      }
      readStocksBinding(
        'stockApplyMutationRows',
        stockApplyMutationRows,
      )({ name: record.rpcName, args: record.rpcArgs }, rows);
      readStocksBinding('stockClearPending', stockClearPending)(record);
      recovered += 1;
    } catch (error) {
      if (
        !readStocksBinding(
          'stockPendingStillCurrent',
          stockPendingStillCurrent,
        )(record)
      ) {
        return false;
      }
      if (
        readStocksBinding(
          'stockMutationDeterministic',
          stockMutationDeterministic,
        )(error)
      ) {
        readStocksBinding('stockClearPending', stockClearPending)(record);
        failed.push(
          readStocksBinding('stockErrorText', stockErrorText)(error),
        );
        continue;
      }
      runtimeValue('stockState').notice =
        'A previous stock update still needs an exact retry. Its request is preserved so it cannot be counted twice.';
      readStocksBinding(
        'stockRestorePendingModal',
        stockRestorePendingModal,
      )(record);
      return false;
    }
  }
  runtimeValue('stockState').notice =
    (recovered
      ? 'Recovered ' +
        recovered +
        ' exact pending stock update' +
        (recovered === 1 ? '' : 's') +
        ' safely. '
      : '') +
    (failed.length
      ? 'Some pending updates were not applied: ' + failed.join(' ')
      : '');
  return recovered > 0;
}

export function stockErrorText(error: LegacyValue): string {
  const code = String((error && error.code) || '');
  const message = String((error && error.message) || '');
  if (
    code === 'PGRST202' ||
    code === '42883' ||
    (/pos_inventory_/i.test(message) &&
      /not find|does not exist/i.test(message))
  ) {
    return 'The Stocks database update is not installed yet.';
  }
  if (code === '42501') {
    return 'Your account does not have access to this inventory workspace.';
  }
  if (code === '40001') {
    return 'This stock item changed on another device. Refresh and review the latest amount.';
  }
  if (code === '55000') {
    return (
      message ||
      'This inventory action is blocked until the item is safely reconciled.'
    );
  }
  if (code === '23505') {
    return 'This request ID was already used with different stock details. Refresh before trying again.';
  }
  if (code === '22003') {
    return 'The stock amount is outside the supported range. Enter a smaller quantity.';
  }
  if (code === '23514' || code === '22023') {
    return message || 'Review the stock amount, unit, and required reason.';
  }
  if (code === 'P0002') {
    return 'This stock item is no longer active. Refresh Stocks before trying again.';
  }
  return 'Could not reach the Stocks database. Check your connection and try again.';
}

export function stockMutationDeterministic(error: LegacyValue): boolean {
  return (
    [
      'PGRST202',
      '42883',
      '42501',
      '40001',
      '55000',
      '23505',
      '23514',
      '22003',
      '22023',
      'P0002',
    ].indexOf(String((error && error.code) || '')) >= 0
  );
}

export function stockSourceGuardMessage(
  error: LegacyValue,
  verb: LegacyValue,
): string {
  const message = String((error && error.message) || '');
  if (String((error && error.code) || '') === '55000' && message) {
    return message;
  }
  if (String((error && error.code) || '') === '42501') {
    return (
      'Your account does not have permission to ' +
      verb +
      ' this inventory source.'
    );
  }
  if (runtimeValue('TEST_MODE') && message) return message;
  return readStocksBinding('stockErrorText', stockErrorText)(error);
}
