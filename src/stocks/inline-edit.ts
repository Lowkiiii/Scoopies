import {
  incrementRuntimeBinding,
  readStocksBinding,
  runtimeValue,
} from './bindings';
import { loadStocks } from './loading';
import {
  stockApplyMutationRows,
  stockErrorText,
  stockMutationDeterministic,
} from './mutations';
import {
  stockBuildPending,
  stockClearPending,
  stockSavePending,
  stockStoredPending,
  stockStoredPendings,
} from './storage';
import type { LegacyValue } from './types';

export type StockInlineField = 'count' | 'threshold';

type StockInlineStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'error'
  | 'uncertain';

export interface StockInlineFieldState {
  value: string;
  confirmed: string;
  status: StockInlineStatus;
  error: string;
  itemRevision: number;
  pendingRpc: LegacyValue | null;
  uncertainAt: number;
  unit: string;
}

function stockInlineUnit(item: LegacyValue): string {
  const unit = String((item && item.preferredUnit) || (item && item.baseUnit) || '');
  return runtimeValue('UNIT_TYPE')[unit] === runtimeValue('UNIT_TYPE')[item.baseUnit]
    ? unit
    : item.baseUnit;
}

function stockInlineFromBase(value: LegacyValue, item: LegacyValue): number {
  return Number(value || 0) / (runtimeValue('UNIT_FACTOR')[stockInlineUnit(item)] || 1);
}

function stockInlineEdits(): Record<
  string,
  Partial<Record<StockInlineField, StockInlineFieldState>>
> {
  const state = runtimeValue('stockState');
  if (!state.inlineEdits || typeof state.inlineEdits !== 'object') {
    state.inlineEdits = {};
  }
  return state.inlineEdits;
}

function stockInlineAuthoritativeValue(
  item: LegacyValue,
  field: StockInlineField,
): string {
  if (!item) return '';
  if (field === 'count') {
    return item.initialized ? String(stockInlineFromBase(item.balance, item)) : '';
  }
  return item.threshold == null
    ? ''
    : String(stockInlineFromBase(item.threshold, item));
}

function stockInlineSameValue(
  field: StockInlineField,
  value: string,
  authoritative: string,
): boolean {
  if (field === 'threshold' && value.trim() === '' && authoritative === '') {
    return true;
  }
  if (value.trim() === '' || authoritative === '') return false;
  return Number(value) === Number(authoritative);
}

export function stockInlineFieldState(
  item: LegacyValue,
  field: StockInlineField,
  create = true,
): StockInlineFieldState | null {
  if (!item) return null;
  const edits = stockInlineEdits();
  const itemId = String(item.id);
  const row = edits[itemId] || (create ? (edits[itemId] = {}) : null);
  if (!row) return null;
  const authoritative = stockInlineAuthoritativeValue(item, field);
  let entry = row[field];
  if (!entry && create) {
    entry = row[field] = {
      value: authoritative,
      confirmed: authoritative,
      status: 'idle',
      error: '',
      itemRevision: Number(item.revision || 0),
      pendingRpc: null,
      uncertainAt: 0,
      unit: stockInlineUnit(item),
    };
  }
  if (!entry) return null;

  const currentUnit = stockInlineUnit(item);
  if (
    entry.unit !== currentUnit &&
    entry.status !== 'saving' &&
    entry.status !== 'uncertain'
  ) {
    entry.unit = currentUnit;
    entry.value = authoritative;
    entry.confirmed = authoritative;
    entry.itemRevision = Number(item.revision || 0);
    entry.status = 'idle';
    entry.error = '';
    entry.pendingRpc = null;
  }

  const refreshedAfterUncertain =
    entry.status === 'uncertain' &&
    (Number(runtimeValue('stockState').lastUpdatedAt || 0) >
      Number(entry.uncertainAt || 0) ||
      Number(entry.itemRevision || 0) !== Number(item.revision || 0));
  const uncertainCanReconcile =
    refreshedAfterUncertain &&
    (field !== 'count' ||
      !readStocksBinding('stockStoredPending', stockStoredPending)());
  if (uncertainCanReconcile) {
    const desired = entry.value;
    entry.confirmed = authoritative;
    entry.itemRevision = Number(item.revision || 0);
    entry.pendingRpc = null;
    if (stockInlineSameValue(field, desired, authoritative)) {
      entry.value = authoritative;
      entry.status = 'saved';
      entry.error = '';
    } else {
      entry.status = 'error';
      entry.error = 'Latest value loaded. Review this amount and save again.';
    }
  } else if (
    entry.status !== 'saving' &&
    entry.status !== 'uncertain' &&
    Number(entry.itemRevision || 0) !== Number(item.revision || 0) &&
    stockInlineSameValue(field, entry.value, entry.confirmed)
  ) {
    entry.value = authoritative;
    entry.confirmed = authoritative;
    entry.itemRevision = Number(item.revision || 0);
    entry.status = 'idle';
    entry.error = '';
    entry.pendingRpc = null;
  }
  return entry;
}

export function stockInlineLocked(): boolean {
  const cloud = runtimeValue('cloud');
  return !!(
    !runtimeValue('stockCanManage')() ||
    !cloud ||
    !cloud.client ||
    !runtimeValue('session') ||
    !runtimeValue('session').user ||
    !runtimeValue('posContext').businessId ||
    runtimeValue('stockState').loading ||
    runtimeValue('stockState').refreshing ||
    runtimeValue('stockState').sourceConflict ||
    runtimeValue('stockModal').submitting ||
    readStocksBinding('stockStoredPending', stockStoredPending)()
  );
}

function stockInlineItem(itemId: LegacyValue): LegacyValue {
  return runtimeValue('stockState').items.find(function (item: LegacyValue) {
    return String(item.id) === String(itemId);
  });
}

function stockInlineError(
  item: LegacyValue,
  field: StockInlineField,
  message: string,
  restoreFocus = true,
): void {
  const entry = stockInlineFieldState(item, field);
  if (!entry) return;
  entry.status = 'error';
  entry.error = message;
  runtimeValue('renderStocks')();
  if (restoreFocus) {
    runtimeValue('focusSoon')(
      '[data-stock-inline-field="' +
        field +
        '"][data-id="' +
        stockInlineSelectorValue(item.id) +
        '"]',
    );
  }
}

function stockInlineSelectorValue(value: LegacyValue): string {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function stockInlineValidate(
  item: LegacyValue,
  field: StockInlineField,
  rawValue: string,
): {
  valid: boolean;
  value: number | null;
  baseValue: number | null;
  unit: string;
  error: string;
} {
  const unit = stockInlineUnit(item);
  const trimmed = String(rawValue == null ? '' : rawValue).trim();
  if (field === 'threshold' && trimmed === '') {
    return { valid: true, value: null, baseValue: null, unit, error: '' };
  }
  if (trimmed === '') {
    return {
      valid: false,
      value: null,
      baseValue: null,
      unit,
      error: 'Enter the exact physical amount currently on hand.',
    };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) {
    return {
      valid: false,
      value: null,
      baseValue: null,
      unit,
      error: 'Enter zero or a positive number.',
    };
  }
  const baseValue = value * (runtimeValue('UNIT_FACTOR')[unit] || 1);
  if (baseValue > 1e12) {
    return {
      valid: false,
      value: null,
      baseValue: null,
      unit,
      error: 'Enter an amount no greater than 1,000,000,000,000.',
    };
  }
  if (!item || !item.baseUnit) {
    return {
      valid: false,
      value: null,
      baseValue: null,
      unit,
      error: 'This stock item has no valid base unit. Refresh Stocks.',
    };
  }
  return { valid: true, value, baseValue, unit, error: '' };
}

export function stockInlineHandleInput(element: LegacyValue): boolean {
  const field = String(element && element.dataset.stockInlineField) as
    | StockInlineField
    | '';
  if (field !== 'count' && field !== 'threshold') return false;
  const item = stockInlineItem(element.dataset.id);
  const entry = stockInlineFieldState(item, field);
  if (!entry || entry.status === 'saving') return true;
  entry.value = String(element.value == null ? '' : element.value);
  entry.status = 'idle';
  entry.error = '';
  entry.pendingRpc = null;
  element.removeAttribute('aria-invalid');
  const inlineCell = element.closest('[data-stock-inline-cell]');
  if (inlineCell) inlineCell.dataset.stockInlineState = 'idle';
  const feedback = inlineCell?.querySelector('[data-stock-inline-feedback]');
  if (feedback) {
    feedback.textContent = '';
    feedback.classList.remove('bad', 'good');
  }
  return true;
}

export function stockInlineResetElement(element: LegacyValue): boolean {
  const field = String(element && element.dataset.stockInlineField) as
    | StockInlineField
    | '';
  if (field !== 'count' && field !== 'threshold') return false;
  const item = stockInlineItem(element.dataset.id);
  const entry = stockInlineFieldState(item, field);
  if (!entry || entry.status === 'saving' || entry.status === 'uncertain') {
    return true;
  }
  entry.value = entry.confirmed;
  entry.status = 'idle';
  entry.error = '';
  entry.pendingRpc = null;
  runtimeValue('renderStocks')();
  runtimeValue('focusSoon')(
    '[data-stock-inline-field="' +
      field +
      '"][data-id="' +
      stockInlineSelectorValue(item.id) +
      '"]',
  );
  return true;
}

export async function stockInlineCommitElement(
  element: LegacyValue,
  restoreFocus = true,
): Promise<boolean> {
  const field = String(element && element.dataset.stockInlineField) as
    | StockInlineField
    | '';
  if (field !== 'count' && field !== 'threshold') return false;
  return stockInlineCommit(element.dataset.id, field, restoreFocus);
}

export async function stockInlineCommit(
  itemId: LegacyValue,
  field: StockInlineField,
  restoreFocus = true,
): Promise<boolean> {
  const item = stockInlineItem(itemId);
  const entry = stockInlineFieldState(item, field);
  if (!item || !entry || entry.status === 'saving') return false;
  if (stockInlineLocked()) return false;

  const validation = stockInlineValidate(item, field, entry.value);
  if (!validation.valid) {
    stockInlineError(item, field, validation.error, restoreFocus);
    return false;
  }
  const authoritative = stockInlineAuthoritativeValue(item, field);
  if (
    stockInlineSameValue(
      field,
      validation.value == null ? '' : String(validation.value),
      authoritative,
    )
  ) {
    entry.value = authoritative;
    entry.confirmed = authoritative;
    entry.status = 'saved';
    entry.error = '';
    runtimeValue('renderStocks')();
    if (restoreFocus) {
      runtimeValue('focusSoon')(
        '[data-stock-inline-field="' +
          field +
          '"][data-id="' +
          stockInlineSelectorValue(item.id) +
          '"]',
      );
    }
    return true;
  }

  let request: LegacyValue;
  let storedPending: LegacyValue = null;
  if (field === 'threshold') {
    request = {
      name: 'pos_inventory_set_threshold',
      args: {
        p_business_id: String(runtimeValue('posContext').businessId),
        p_inventory_item_id: item.id,
        p_threshold_base: validation.baseValue,
        p_expected_revision: item.revision,
      },
    };
  } else {
    request = {
      name: 'pos_inventory_record_transaction',
      args: {
        p_business_id: String(runtimeValue('posContext').businessId),
        p_client_transaction_id: runtimeValue('posUuid')(),
        p_transaction_type: 'stock_count',
        p_lines: [
          {
            inventoryItemId: item.id,
            quantity: validation.value,
            unit: validation.unit,
            expectedRevision: item.revision,
          },
        ],
        p_reason: '',
        p_note: '',
      },
    };
    storedPending = readStocksBinding(
      'stockBuildPending',
      stockBuildPending,
    )(request, item.id);
    if (
      !readStocksBinding('stockSavePending', stockSavePending)(storedPending)
    ) {
      stockInlineError(
        item,
        field,
        'Another protected stock count is waiting, or this browser could not protect the retry. Refresh Stocks before trying again.',
        restoreFocus,
      );
      return false;
    }
    storedPending = readStocksBinding(
      'stockStoredPendings',
      stockStoredPendings,
    )().find(function (record: LegacyValue) {
      return (
        String(record.rpcArgs.p_client_transaction_id) ===
        String(request.args.p_client_transaction_id)
      );
    });
  }

  const generation = incrementRuntimeBinding('stockMutationGeneration');
  const userId = String(runtimeValue('session').user.id || '');
  const businessId = String(runtimeValue('posContext').businessId || '');
  entry.status = 'saving';
  entry.error = '';
  entry.pendingRpc = request;
  runtimeValue('stockModal').submitting = true;
  runtimeValue('renderStocks')();
  try {
    const rows = runtimeValue('rpcRows')(
      await runtimeValue('cloud').client.rpc(request.name, request.args),
    );
    if (
      generation !== runtimeValue('stockMutationGeneration') ||
      !runtimeValue('session') ||
      String(runtimeValue('session').user.id || '') !== userId ||
      String(runtimeValue('posContext').businessId || '') !== businessId
    ) {
      return false;
    }
    if (
      !rows.length ||
      !readStocksBinding(
        'stockApplyMutationRows',
        stockApplyMutationRows,
      )(request, rows)
    ) {
      throw new Error('Missing authoritative inventory response');
    }
    if (field === 'count') {
      readStocksBinding('stockClearPending', stockClearPending)(storedPending);
    }
    runtimeValue('stockModal').submitting = false;
    const updatedItem = stockInlineItem(itemId);
    const confirmed = stockInlineAuthoritativeValue(updatedItem, field);
    entry.value = confirmed;
    entry.confirmed = confirmed;
    entry.itemRevision = Number(updatedItem.revision || 0);
    entry.status = 'saved';
    entry.error = '';
    entry.pendingRpc = null;
    runtimeValue('renderStocks')();
    const refreshed = await readStocksBinding('loadStocks', loadStocks)({
      background: true,
    });
    runtimeValue('stockState').notice = refreshed
      ? field === 'count'
        ? 'Physical stock count saved to the shared ledger.'
        : 'Low-stock alert saved.'
      : 'The change was saved and the confirmed value is shown, but the full stock list could not refresh. Use Refresh before another count.';
    runtimeValue('renderStocks')();
    if (restoreFocus) {
      runtimeValue('focusSoon')(
        '[data-stock-inline-field="' +
          field +
          '"][data-id="' +
          stockInlineSelectorValue(itemId) +
          '"]',
      );
    }
    return true;
  } catch (caughtError) {
    if (
      generation !== runtimeValue('stockMutationGeneration') ||
      !runtimeValue('session') ||
      String(runtimeValue('session').user.id || '') !== userId ||
      String(runtimeValue('posContext').businessId || '') !== businessId
    ) {
      return false;
    }
    runtimeValue('stockModal').submitting = false;
    entry.error = readStocksBinding('stockErrorText', stockErrorText)(
      caughtError,
    );
    const deterministic = readStocksBinding(
      'stockMutationDeterministic',
      stockMutationDeterministic,
    )(caughtError);
    if (field === 'count' && deterministic) {
      readStocksBinding('stockClearPending', stockClearPending)(storedPending);
      entry.pendingRpc = null;
      entry.status = 'error';
    } else if (field === 'count') {
      entry.status = 'uncertain';
      entry.uncertainAt = Date.now();
      entry.error +=
        ' The exact request is protected. Use Refresh to retry it safely.';
      runtimeValue('stockState').notice =
        'A physical count needs an exact retry. Its request is protected so it cannot be counted twice.';
    } else if (deterministic) {
      entry.pendingRpc = null;
      entry.status = 'error';
    } else {
      entry.status = 'uncertain';
      entry.uncertainAt = Date.now();
      entry.error += ' Refreshing the confirmed alert before retrying.';
      runtimeValue('renderStocks')();
      await readStocksBinding('loadStocks', loadStocks)({ background: true });
      const refreshedItem = stockInlineItem(itemId);
      const refreshedValue = stockInlineAuthoritativeValue(
        refreshedItem,
        field,
      );
      entry.confirmed = refreshedValue;
      entry.itemRevision = Number(
        (refreshedItem && refreshedItem.revision) || 0,
      );
      entry.pendingRpc = null;
      if (stockInlineSameValue(field, entry.value, refreshedValue)) {
        entry.value = refreshedValue;
        entry.status = 'saved';
        entry.error = '';
      } else {
        entry.status = 'error';
        entry.error = 'Review the refreshed value and save again.';
      }
    }
    runtimeValue('renderStocks')();
    if (restoreFocus) {
      runtimeValue('focusSoon')(
        '[data-stock-inline-field="' +
          field +
          '"][data-id="' +
          stockInlineSelectorValue(itemId) +
          '"]',
      );
    }
    return false;
  } finally {
    if (generation === runtimeValue('stockMutationGeneration')) {
      runtimeValue('stockModal').submitting = false;
    }
  }
}
