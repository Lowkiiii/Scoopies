import {
  incrementRuntimeBinding,
  readStocksBinding,
  runtimeValue,
} from './bindings';
import { stockInlineLocked, stockQueueInlineMutation } from './inline-edit';
import { loadStocks } from './loading';
import { stockErrorText, stockMutationDeterministic } from './mutations';
import type { LegacyValue } from './types';

export type StockCellField =
  | 'purchasedFrom'
  | 'lastStockedOn'
  | 'notes'
  | 'preferredUnit';

type StockCellStatus = 'idle' | 'saving' | 'saved' | 'error' | 'uncertain';

export interface StockCellFieldState {
  value: string;
  confirmed: string;
  status: StockCellStatus;
  error: string;
  itemRevision: number;
}

const STOCK_CELL_FIELDS: StockCellField[] = [
  'purchasedFrom',
  'lastStockedOn',
  'notes',
  'preferredUnit',
];

function stockCellItem(itemId: LegacyValue): LegacyValue {
  return (runtimeValue('stockState').items || []).find(function (
    item: LegacyValue,
  ) {
    return String(item.id) === String(itemId);
  });
}

function stockCellEdits(): Record<
  string,
  Partial<Record<StockCellField, StockCellFieldState>>
> {
  const state = runtimeValue('stockState');
  if (!state.cellEdits || typeof state.cellEdits !== 'object') {
    state.cellEdits = {};
  }
  return state.cellEdits;
}

function stockCellAuthoritativeValue(
  item: LegacyValue,
  field: StockCellField,
): string {
  if (!item) return '';
  return String(item[field] == null ? '' : item[field]);
}

export function stockCellFieldState(
  item: LegacyValue,
  field: StockCellField,
  create = true,
): StockCellFieldState | null {
  if (!item || STOCK_CELL_FIELDS.indexOf(field) < 0) return null;
  const edits = stockCellEdits();
  const itemId = String(item.id);
  const row = edits[itemId] || (create ? (edits[itemId] = {}) : null);
  if (!row) return null;
  const authoritative = stockCellAuthoritativeValue(item, field);
  let entry = row[field];
  if (!entry && create) {
    entry = row[field] = {
      value: authoritative,
      confirmed: authoritative,
      status: 'idle',
      error: '',
      itemRevision: Number(item.revision || 0),
    };
  }
  if (!entry) return null;

  if (
    entry.status !== 'saving' &&
    Number(entry.itemRevision || 0) !== Number(item.revision || 0)
  ) {
    const dirty = entry.value !== entry.confirmed;
    entry.confirmed = authoritative;
    entry.itemRevision = Number(item.revision || 0);
    if (!dirty) entry.value = authoritative;
    if (entry.status !== 'error' && entry.status !== 'uncertain') {
      entry.status = 'idle';
      entry.error = '';
    }
  }
  return entry;
}

function stockCellSelectorValue(value: LegacyValue): string {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function stockCellSelector(itemId: LegacyValue, field: StockCellField): string {
  return (
    '[data-stock-cell-field="' +
    field +
    '"][data-id="' +
    stockCellSelectorValue(itemId) +
    '"]'
  );
}

function stockCellMessage(entry: StockCellFieldState): string {
  if (entry.error) return entry.error;
  if (entry.status === 'saving') return 'Saving...';
  if (entry.status === 'saved') return 'Saved';
  return '';
}

function stockCellUpdateElement(
  itemId: LegacyValue,
  field: StockCellField,
  entry: StockCellFieldState,
): void {
  const document = runtimeValue<Document>('document');
  const element = document.querySelector(stockCellSelector(itemId, field));
  if (!element) return;
  if (
    entry.status === 'saved' &&
    String((element as LegacyValue).value ?? '') !== entry.value
  ) {
    (element as LegacyValue).value = entry.value;
  }
  const wrapper = element.closest('[data-stock-cell-editor]') as LegacyValue;
  if (wrapper) wrapper.dataset.stockCellState = entry.status;
  const invalid = entry.status === 'error' || entry.status === 'uncertain';
  element.setAttribute('aria-invalid', invalid ? 'true' : 'false');
  const feedback = wrapper?.querySelector('[data-stock-cell-feedback]');
  if (feedback) {
    feedback.textContent = stockCellMessage(entry);
    feedback.classList.toggle('bad', invalid);
    feedback.classList.toggle('good', entry.status === 'saved');
  }
}

function stockCellValidation(
  item: LegacyValue,
  field: StockCellField,
  rawValue: LegacyValue,
): { valid: boolean; value: string; error: string } {
  const value = String(rawValue == null ? '' : rawValue).trim();
  if (field === 'purchasedFrom') {
    if (item.kind === 'mixture') {
      return {
        valid: false,
        value,
        error: 'Prepared mixtures are always prepared in-house.',
      };
    }
    if (value.length > 160) {
      return {
        valid: false,
        value,
        error: 'Keep Purchased From under 160 characters.',
      };
    }
  }
  if (field === 'notes' && value.length > 1000) {
    return { valid: false, value, error: 'Keep notes under 1,000 characters.' };
  }
  if (
    field === 'lastStockedOn' &&
    value &&
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return { valid: false, value, error: 'Choose a valid date.' };
  }
  if (field === 'preferredUnit') {
    const choices =
      item.baseUnit === 'g'
        ? ['g', 'kg']
        : item.baseUnit === 'ml'
          ? ['ml', 'l']
          : ['piece'];
    if (choices.indexOf(value.toLowerCase()) < 0) {
      return {
        valid: false,
        value,
        error: 'Choose a compatible measurement unit.',
      };
    }
    return { valid: true, value: value.toLowerCase(), error: '' };
  }
  return { valid: true, value, error: '' };
}

export function stockCellHandleInput(element: LegacyValue): boolean {
  const field = String(element && element.dataset.stockCellField) as
    | StockCellField
    | '';
  if (STOCK_CELL_FIELDS.indexOf(field as StockCellField) < 0) return false;
  const item = stockCellItem(element.dataset.id);
  const entry = stockCellFieldState(item, field as StockCellField);
  if (!entry) return true;
  entry.value = String(element.value == null ? '' : element.value);
  if (entry.status !== 'saving') entry.status = 'idle';
  entry.error = '';
  stockCellUpdateElement(item.id, field as StockCellField, entry);
  return true;
}

export function stockCellResetElement(element: LegacyValue): boolean {
  const field = String(element && element.dataset.stockCellField) as
    | StockCellField
    | '';
  if (STOCK_CELL_FIELDS.indexOf(field as StockCellField) < 0) return false;
  const item = stockCellItem(element.dataset.id);
  const entry = stockCellFieldState(item, field as StockCellField);
  if (!entry || entry.status === 'saving') return true;
  entry.value = entry.confirmed;
  entry.status = 'idle';
  entry.error = '';
  element.value = entry.confirmed;
  stockCellUpdateElement(item.id, field as StockCellField, entry);
  return true;
}

export function stockCellCommitElement(
  element: LegacyValue,
  restoreFocus = true,
): Promise<boolean> {
  const field = String(element && element.dataset.stockCellField) as
    | StockCellField
    | '';
  if (STOCK_CELL_FIELDS.indexOf(field as StockCellField) < 0) {
    return Promise.resolve(false);
  }
  return stockCellCommit(
    element.dataset.id,
    field as StockCellField,
    restoreFocus,
  );
}

export function stockCellCommit(
  itemId: LegacyValue,
  field: StockCellField,
  restoreFocus = true,
): Promise<boolean> {
  return stockQueueInlineMutation(function () {
    return stockCellCommitNow(itemId, field, restoreFocus);
  });
}

function stockCellApplyRow(item: LegacyValue, row: LegacyValue): void {
  if (Object.prototype.hasOwnProperty.call(row, 'brand')) {
    item.brand = String(row.brand || '');
  }
  item.purchasedFrom = String(row.purchased_from || row.purchasedFrom || '');
  item.lastStockedOn = row.last_stocked_on || row.lastStockedOn || null;
  item.notes = String(row.notes || '');
  item.preferredUnit = String(
    row.preferred_unit || row.preferredUnit || item.baseUnit,
  );
  item.active = row.active !== false;
  item.revision = Number(row.revision || item.revision || 0);
}

async function stockCellCommitNow(
  itemId: LegacyValue,
  field: StockCellField,
  restoreFocus: boolean,
): Promise<boolean> {
  const item = stockCellItem(itemId);
  const entry = stockCellFieldState(item, field);
  if (!item || !entry || entry.status === 'saving') return false;
  if (stockInlineLocked()) return false;

  const validation = stockCellValidation(item, field, entry.value);
  if (!validation.valid) {
    entry.status = 'error';
    entry.error = validation.error;
    stockCellUpdateElement(item.id, field, entry);
    if (restoreFocus) {
      runtimeValue('focusSoon')(stockCellSelector(item.id, field));
    }
    return false;
  }
  const authoritative = stockCellAuthoritativeValue(item, field);
  if (validation.value === authoritative) {
    entry.value = authoritative;
    entry.confirmed = authoritative;
    entry.itemRevision = Number(item.revision || 0);
    entry.status = 'saved';
    entry.error = '';
    stockCellUpdateElement(item.id, field, entry);
    if (restoreFocus) {
      runtimeValue('focusSoon')(stockCellSelector(item.id, field));
    }
    return true;
  }

  const values: Record<StockCellField, string> = {
    purchasedFrom: String(item.purchasedFrom || ''),
    lastStockedOn: String(item.lastStockedOn || ''),
    notes: String(item.notes || ''),
    preferredUnit: String(item.preferredUnit || item.baseUnit),
  };
  values[field] = validation.value;
  const submittedEntryValue = entry.value;

  const generation = incrementRuntimeBinding('stockMutationGeneration');
  const userId = String(runtimeValue('session').user.id || '');
  const businessId = String(runtimeValue('posContext').businessId || '');
  entry.status = 'saving';
  entry.error = '';
  runtimeValue('stockModal').submitting = true;
  stockCellUpdateElement(item.id, field, entry);
  try {
    const v2Args = {
      p_business_id: businessId,
      p_inventory_item_id: item.id,
      p_purchased_from: values.purchasedFrom || null,
      p_last_stocked_on: values.lastStockedOn || null,
      p_notes: values.notes || null,
      p_preferred_unit: values.preferredUnit,
      p_expected_revision: item.revision,
    };
    let response = await runtimeValue('cloud').client.rpc(
      'pos_inventory_update_item_details_v2',
      v2Args,
    );
    if (
      response &&
      response.error &&
      (String(response.error.code || '') === 'PGRST202' ||
        /function.*not found|schema cache/i.test(String(response.error.message || '')))
    ) {
      response = await runtimeValue('cloud').client.rpc(
        'pos_inventory_update_item_details',
        {
          p_business_id: businessId,
          p_inventory_item_id: item.id,
          p_brand: item.brand || null,
          p_purchased_from: values.purchasedFrom || null,
          p_last_stocked_on: values.lastStockedOn || null,
          p_notes: values.notes || null,
          p_preferred_unit: values.preferredUnit,
          p_expected_revision: item.revision,
        },
      );
    }
    const rows = runtimeValue('rpcRows')(response);
    if (
      generation !== runtimeValue('stockMutationGeneration') ||
      !runtimeValue('session') ||
      String(runtimeValue('session').user.id || '') !== userId ||
      String(runtimeValue('posContext').businessId || '') !== businessId
    ) {
      return false;
    }
    if (!rows.length) {
      throw new Error('Missing authoritative inventory response');
    }
    stockCellApplyRow(item, rows[0]);
    STOCK_CELL_FIELDS.forEach(function (cellField) {
      const cellEntry = stockCellFieldState(item, cellField, false);
      if (!cellEntry) return;
      const nextAuthoritative = stockCellAuthoritativeValue(item, cellField);
      if (cellField === field) {
        if (cellEntry.value === submittedEntryValue) {
          cellEntry.value = nextAuthoritative;
          cellEntry.status = 'saved';
        } else {
          cellEntry.status = 'idle';
        }
        cellEntry.error = '';
      } else if (cellEntry.value === cellEntry.confirmed) {
        cellEntry.value = nextAuthoritative;
      }
      cellEntry.confirmed = nextAuthoritative;
      cellEntry.itemRevision = Number(item.revision || 0);
    });
    runtimeValue('stockModal').submitting = false;
    if (field === 'preferredUnit') {
      // Spreadsheet quantities and formula values are returned in the item's
      // preferred display unit. Reload the authoritative sheet after a unit
      // change so every editable and computed cell switches together.
      await readStocksBinding('loadStocks', loadStocks)({ background: true });
    } else {
      stockCellUpdateElement(item.id, field, entry);
    }
    if (restoreFocus) {
      runtimeValue('focusSoon')(stockCellSelector(item.id, field));
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
    entry.error = readStocksBinding('stockErrorText', stockErrorText)(
      caughtError,
    );
    if (
      readStocksBinding(
        'stockMutationDeterministic',
        stockMutationDeterministic,
      )(caughtError)
    ) {
      entry.status = 'error';
    } else {
      entry.status = 'uncertain';
      entry.error += ' Refreshing the confirmed value before retrying.';
      stockCellUpdateElement(item.id, field, entry);
      runtimeValue('stockModal').submitting = false;
      await readStocksBinding('loadStocks', loadStocks)({ background: true });
      const refreshedItem = stockCellItem(itemId);
      const refreshedValue = stockCellAuthoritativeValue(refreshedItem, field);
      const editedAfterSubmit = entry.value !== submittedEntryValue;
      entry.confirmed = refreshedValue;
      entry.itemRevision = Number((refreshedItem && refreshedItem.revision) || 0);
      if (editedAfterSubmit) {
        entry.status = 'idle';
        entry.error = '';
      } else if (validation.value === refreshedValue) {
        entry.value = refreshedValue;
        entry.status = 'saved';
        entry.error = '';
      } else {
        entry.status = 'error';
        entry.error = 'Review the refreshed value and save again.';
      }
    }
    stockCellUpdateElement(itemId, field, entry);
    if (restoreFocus) {
      runtimeValue('focusSoon')(stockCellSelector(itemId, field));
    }
    return false;
  } finally {
    if (generation === runtimeValue('stockMutationGeneration')) {
      runtimeValue('stockModal').submitting = false;
    }
  }
}
