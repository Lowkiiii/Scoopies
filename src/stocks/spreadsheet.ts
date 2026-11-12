import {
  incrementRuntimeBinding,
  runtimeValue,
  writeRuntimeBinding,
} from './bindings';
import { ensureActiveInventoryPeriod, loadStocks } from './loading';
import { stockErrorText } from './mutations';
import { stockInlineLocked, stockQueueInlineMutation } from './inline-edit';
import type { LegacyValue } from './types';

export type StockSpreadsheetField =
  | 'openingStock'
  | 'stockAdded'
  | 'wasted'
  | 'reorderLevel'
  | 'purchaseQuantity'
  | 'purchasePrice';

type SpreadsheetStatus = 'idle' | 'saving' | 'saved' | 'error';

interface SpreadsheetEdit {
  value: string;
  confirmed: string;
  status: SpreadsheetStatus;
  error: string;
  itemRevision: number;
  periodItemRevision: number;
  clientMutationId: string;
  submittedValue: string;
}

const STOCK_SPREADSHEET_FIELDS: StockSpreadsheetField[] = [
  'openingStock',
  'stockAdded',
  'wasted',
  'reorderLevel',
  'purchaseQuantity',
  'purchasePrice',
];

const FIELD_RPC_NAMES: Record<StockSpreadsheetField, string> = {
  openingStock: 'opening_stock',
  stockAdded: 'stock_added',
  wasted: 'wasted_damaged',
  reorderLevel: 'reorder_level',
  purchaseQuantity: 'purchase_quantity',
  purchasePrice: 'purchase_price',
};

function spreadsheetItem(itemId: LegacyValue): LegacyValue {
  return runtimeValue<LegacyValue>('stockState').items.find(function (
    item: LegacyValue,
  ) {
    return String(item.id) === String(itemId);
  });
}

function spreadsheetEdits(): Record<
  string,
  Partial<Record<StockSpreadsheetField, SpreadsheetEdit>>
> {
  const state = runtimeValue<LegacyValue>('stockState');
  if (!state.spreadsheetEdits || typeof state.spreadsheetEdits !== 'object') {
    state.spreadsheetEdits = {};
  }
  return state.spreadsheetEdits;
}

function spreadsheetUnit(item: LegacyValue): string {
  const requested = String(item.preferredUnit || item.baseUnit || '');
  return runtimeValue<LegacyValue>('UNIT_TYPE')[requested] ===
    runtimeValue<LegacyValue>('UNIT_TYPE')[item.baseUnit]
    ? requested
    : String(item.baseUnit || '');
}

function fromBase(value: LegacyValue, item: LegacyValue): string {
  if (value == null || value === '') return '';
  const factor = runtimeValue<LegacyValue>('UNIT_FACTOR')[spreadsheetUnit(item)] || 1;
  const converted = Number(value) / factor;
  return Number.isFinite(converted) ? String(converted) : '';
}

function authoritativeValue(
  item: LegacyValue,
  field: StockSpreadsheetField,
): string {
  if (!item) return '';
  if (field === 'openingStock') return fromBase(item.openingStock, item);
  if (field === 'stockAdded') return fromBase(item.stockAdded, item);
  if (field === 'wasted') return fromBase(item.wasted, item);
  if (field === 'reorderLevel') return fromBase(item.threshold, item);
  if (field === 'purchaseQuantity') {
    return fromBase(item.purchaseQuantity, item);
  }
  return item.purchasePriceCentavos == null
    ? ''
    : (Number(item.purchasePriceCentavos) / 100).toFixed(2);
}

export function stockSpreadsheetFieldState(
  item: LegacyValue,
  field: StockSpreadsheetField,
  create = true,
): SpreadsheetEdit | null {
  if (!item || STOCK_SPREADSHEET_FIELDS.indexOf(field) < 0) return null;
  const edits = spreadsheetEdits();
  const itemId = String(item.id || '');
  const row = edits[itemId] || (create ? (edits[itemId] = {}) : null);
  if (!row) return null;
  const authoritative = authoritativeValue(item, field);
  let edit = row[field];
  if (!edit && create) {
    edit = row[field] = {
      value: authoritative,
      confirmed: authoritative,
      status: 'idle',
      error: '',
      itemRevision: Number(item.revision || 0),
      periodItemRevision: Number(item.periodItemRevision || 0),
      clientMutationId: '',
      submittedValue: '',
    };
  }
  if (!edit) return null;
  if (
    edit.status !== 'saving' &&
    (edit.itemRevision !== Number(item.revision || 0) ||
      edit.periodItemRevision !== Number(item.periodItemRevision || 0)) &&
    edit.value === edit.confirmed
  ) {
    edit.value = authoritative;
    edit.confirmed = authoritative;
    edit.itemRevision = Number(item.revision || 0);
    edit.periodItemRevision = Number(item.periodItemRevision || 0);
    edit.status = 'idle';
    edit.error = '';
  }
  return edit;
}

export function stockSpreadsheetLocked(): boolean {
  const state = runtimeValue<LegacyValue>('stockState');
  return !!(
    !runtimeValue<LegacyValue>('stockCanManage')() ||
    !runtimeValue<LegacyValue>('cloud').client ||
    !runtimeValue<LegacyValue>('session') ||
    !runtimeValue<LegacyValue>('session').user ||
    !runtimeValue<LegacyValue>('posContext').businessId ||
    state.loading ||
    state.refreshing ||
    state.startingPeriod ||
    state.sourceConflict ||
    stockInlineLocked() ||
    runtimeValue<LegacyValue>('stockModal').submitting
  );
}

function selectorValue(value: LegacyValue): string {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function spreadsheetSelector(
  itemId: LegacyValue,
  field: StockSpreadsheetField,
): string {
  return (
    '[data-stock-sheet-field="' +
    field +
    '"][data-id="' +
    selectorValue(itemId) +
    '"]'
  );
}

function updateSpreadsheetElement(
  itemId: LegacyValue,
  field: StockSpreadsheetField,
  edit: SpreadsheetEdit,
): void {
  const element = document.querySelector(
    spreadsheetSelector(itemId, field),
  ) as HTMLInputElement | null;
  if (!element) return;
  const wrapper = element.closest('[data-stock-sheet-editor]') as HTMLElement | null;
  const feedback = wrapper?.querySelector(
    '[data-stock-sheet-feedback]',
  ) as HTMLElement | null;
  if (wrapper) wrapper.dataset.stockSheetState = edit.status;
  element.setAttribute('aria-invalid', edit.status === 'error' ? 'true' : 'false');
  if (feedback) {
    feedback.textContent =
      edit.error ||
      (edit.status === 'saving'
        ? 'Saving...'
        : edit.status === 'saved'
          ? 'Saved'
          : '');
    feedback.classList.toggle('bad', edit.status === 'error');
    feedback.classList.toggle('good', edit.status === 'saved');
  }
}

export function stockSpreadsheetHandleInput(element: LegacyValue): boolean {
  const field = String(element && element.dataset.stockSheetField) as
    | StockSpreadsheetField
    | '';
  if (STOCK_SPREADSHEET_FIELDS.indexOf(field as StockSpreadsheetField) < 0) {
    return false;
  }
  const item = spreadsheetItem(element.dataset.id);
  const edit = stockSpreadsheetFieldState(item, field as StockSpreadsheetField);
  if (!edit) return true;
  edit.value = String(element.value == null ? '' : element.value);
  if (edit.status !== 'saving') edit.status = 'idle';
  edit.error = '';
  updateSpreadsheetElement(item.id, field as StockSpreadsheetField, edit);
  return true;
}

export function stockSpreadsheetResetElement(element: LegacyValue): boolean {
  const field = String(element && element.dataset.stockSheetField) as
    | StockSpreadsheetField
    | '';
  if (STOCK_SPREADSHEET_FIELDS.indexOf(field as StockSpreadsheetField) < 0) {
    return false;
  }
  const item = spreadsheetItem(element.dataset.id);
  const edit = stockSpreadsheetFieldState(item, field as StockSpreadsheetField);
  if (!edit || edit.status === 'saving') return true;
  edit.value = edit.confirmed;
  edit.status = 'idle';
  edit.error = '';
  element.value = edit.confirmed;
  updateSpreadsheetElement(item.id, field as StockSpreadsheetField, edit);
  return true;
}

function validateSpreadsheetValue(
  item: LegacyValue,
  field: StockSpreadsheetField,
  raw: string,
): { valid: boolean; numeric: number | null; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    if (field === 'reorderLevel' || field === 'purchaseQuantity' || field === 'purchasePrice') {
      return { valid: true, numeric: null, error: '' };
    }
    return { valid: false, numeric: null, error: 'Enter zero or a positive amount.' };
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { valid: false, numeric: null, error: 'Enter zero or a positive number.' };
  }
  if (field === 'purchasePrice') {
    const centavos = Math.round(parsed * 100);
    return centavos <= 100000000000
      ? { valid: true, numeric: parsed, error: '' }
      : { valid: false, numeric: null, error: 'That price is too large.' };
  }
  const factor = runtimeValue<LegacyValue>('UNIT_FACTOR')[spreadsheetUnit(item)] || 1;
  const base = parsed * factor;
  return base <= 1000000000000
    ? { valid: true, numeric: parsed, error: '' }
    : { valid: false, numeric: null, error: 'That quantity is too large.' };
}

function applySpreadsheetRow(item: LegacyValue, row: LegacyValue): void {
  if (!row) return;
  const setNumber = function (snake: string, key: string): void {
    if (Object.prototype.hasOwnProperty.call(row, snake)) {
      item[key] = row[snake] == null ? null : Number(row[snake]);
    }
  };
  setNumber('opening_stock_base', 'openingStock');
  setNumber('stock_added_base', 'stockAdded');
  setNumber('stock_used_base', 'stockUsed');
  setNumber('wasted_base', 'wasted');
  setNumber('remaining_stock_base', 'remainingStock');
  setNumber('low_stock_threshold_base', 'threshold');
  setNumber('purchase_quantity_base', 'purchaseQuantity');
  setNumber('purchase_price_centavos', 'purchasePriceCentavos');
  setNumber('cost_per_unit_centavos', 'costPerUnitCentavos');
  setNumber('remaining_value_centavos', 'remainingValueCentavos');
  if (Object.prototype.hasOwnProperty.call(row, 'row_color')) {
    const color = String(row.row_color || '').toUpperCase();
    item.rowColor = /^#[0-9A-F]{6}$/.test(color) ? color : '';
  }
  if (Object.prototype.hasOwnProperty.call(row, 'preferred_unit')) {
    item.preferredUnit = String(row.preferred_unit || item.baseUnit);
  }
  item.revision = Number(
    row.item_revision_after ||
      row.item_revision ||
      row.revision ||
      item.revision ||
      0,
  );
  item.periodItemRevision = Number(
    row.period_item_revision_after ||
      row.period_item_revision ||
      item.periodItemRevision ||
      0,
  );
  if (Object.prototype.hasOwnProperty.call(row, 'current_balance_base')) {
    item.balance = Number(row.current_balance_base || 0);
  }
}

async function commitSpreadsheetValue(
  item: LegacyValue,
  fieldName: string,
  value: string,
  clientMutationId?: string,
): Promise<LegacyValue> {
  const period = runtimeValue<LegacyValue>('stockState').activePeriod;
  return runtimeValue<LegacyValue>('rpcRows')(
    await runtimeValue<LegacyValue>('cloud').client.rpc(
      'pos_inventory_set_spreadsheet_cell',
      {
        p_business_id: String(runtimeValue<LegacyValue>('posContext').businessId),
        p_inventory_item_id: item.id,
        p_period_id: period && period.id ? String(period.id) : null,
        p_column: fieldName,
        p_value: value,
        p_expected_item_revision: Number(item.revision || 0),
        p_expected_period_item_revision: Number(item.periodItemRevision || 0),
        p_client_mutation_id:
          clientMutationId || runtimeValue<LegacyValue>('posUuid')(),
      },
    ),
  )[0];
}

export function stockSpreadsheetCommitElement(
  element: LegacyValue,
  restoreFocus = true,
): Promise<boolean> {
  const field = String(element && element.dataset.stockSheetField) as
    | StockSpreadsheetField
    | '';
  if (STOCK_SPREADSHEET_FIELDS.indexOf(field as StockSpreadsheetField) < 0) {
    return Promise.resolve(false);
  }
  return stockQueueInlineMutation(function () {
    return stockSpreadsheetCommit(
      element.dataset.id,
      field as StockSpreadsheetField,
      restoreFocus,
    );
  });
}

async function stockSpreadsheetCommit(
  itemId: LegacyValue,
  field: StockSpreadsheetField,
  restoreFocus: boolean,
): Promise<boolean> {
  const item = spreadsheetItem(itemId);
  const edit = stockSpreadsheetFieldState(item, field);
  if (!item || !edit || edit.status === 'saving' || stockSpreadsheetLocked()) {
    return false;
  }
  const validation = validateSpreadsheetValue(item, field, edit.value);
  if (!validation.valid) {
    edit.status = 'error';
    edit.error = validation.error;
    updateSpreadsheetElement(item.id, field, edit);
    return false;
  }
  const authoritative = authoritativeValue(item, field);
  if (edit.value.trim() === authoritative) {
    edit.status = 'saved';
    edit.error = '';
    updateSpreadsheetElement(item.id, field, edit);
    return true;
  }
  const generation = incrementRuntimeBinding('stockMutationGeneration');
  const userId = String(runtimeValue<LegacyValue>('session').user.id || '');
  const businessId = String(runtimeValue<LegacyValue>('posContext').businessId || '');
  const submitted = edit.value;
  const mutationValue =
    validation.numeric == null ? '' : String(validation.numeric);
  if (!edit.clientMutationId || edit.submittedValue !== mutationValue) {
    edit.clientMutationId = runtimeValue<LegacyValue>('posUuid')();
    edit.submittedValue = mutationValue;
  }
  edit.status = 'saving';
  edit.error = '';
  updateSpreadsheetElement(item.id, field, edit);
  try {
    const row = await commitSpreadsheetValue(
      item,
      FIELD_RPC_NAMES[field],
      mutationValue,
      edit.clientMutationId,
    );
    if (
      generation !== runtimeValue('stockMutationGeneration') ||
      !runtimeValue<LegacyValue>('session') ||
      String(runtimeValue<LegacyValue>('session').user.id || '') !== userId ||
      String(runtimeValue<LegacyValue>('posContext').businessId || '') !== businessId
    ) {
      return false;
    }
    if (!row) throw new Error('Missing authoritative inventory response');
    applySpreadsheetRow(item, row);
    await loadStocks({ background: true });
    const refreshedItem = spreadsheetItem(item.id) || item;
    const confirmed = authoritativeValue(refreshedItem, field);
    edit.confirmed = confirmed;
    edit.itemRevision = Number(refreshedItem.revision || 0);
    edit.periodItemRevision = Number(refreshedItem.periodItemRevision || 0);
    if (edit.value === submitted) edit.value = confirmed;
    edit.status = 'saved';
    edit.error = '';
    edit.clientMutationId = '';
    edit.submittedValue = '';
    runtimeValue<LegacyValue>('stockState').notice = 'Inventory cell saved.';
    runtimeValue<LegacyValue>('renderStocks')();
    if (restoreFocus) runtimeValue<LegacyValue>('focusSoon')(
      spreadsheetSelector(refreshedItem.id, field),
    );
    return true;
  } catch (error) {
    if (
      generation !== runtimeValue('stockMutationGeneration') ||
      !runtimeValue<LegacyValue>('session') ||
      String(runtimeValue<LegacyValue>('session').user.id || '') !== userId ||
      String(runtimeValue<LegacyValue>('posContext').businessId || '') !== businessId
    ) {
      return false;
    }
    edit.status = 'error';
    edit.error = stockErrorText(error);
    updateSpreadsheetElement(item.id, field, edit);
    return false;
  }
}

function openSpecialStockModal(mode: string): void {
  writeRuntimeBinding('stockModalReturnFocus', document.activeElement);
  writeRuntimeBinding('stockModal', runtimeValue<LegacyValue>('freshStockModal')());
  runtimeValue<LegacyValue>('stockModal').open = true;
  runtimeValue<LegacyValue>('stockModal').mode = mode;
  const backdrop = document.getElementById('stockModal');
  if (backdrop) backdrop.hidden = false;
  runtimeValue<LegacyValue>('refreshModalBodyClass')();
}

export function openStockColorPicker(itemId: LegacyValue): boolean {
  const item = spreadsheetItem(itemId);
  if (!item || stockSpreadsheetLocked()) return false;
  openSpecialStockModal('row-color');
  runtimeValue<LegacyValue>('stockModal').itemId = item.id;
  runtimeValue<LegacyValue>('stockModal').color = item.rowColor || '';
  renderStockSpreadsheetModal();
  runtimeValue<LegacyValue>('focusSoon')('#stockColorHex');
  return true;
}

export function chooseStockRowColor(color: LegacyValue): boolean {
  if (runtimeValue<LegacyValue>('stockModal').mode !== 'row-color') return false;
  runtimeValue<LegacyValue>('stockModal').color = String(color || '').toUpperCase();
  runtimeValue<LegacyValue>('stockModal').error = '';
  renderStockSpreadsheetModal();
  runtimeValue<LegacyValue>('focusSoon')('#stockColorHex');
  return true;
}

export function updateStockColorDraft(value: LegacyValue): boolean {
  if (runtimeValue<LegacyValue>('stockModal').mode !== 'row-color') return false;
  runtimeValue<LegacyValue>('stockModal').color = String(value || '').toUpperCase();
  runtimeValue<LegacyValue>('stockModal').error = '';
  const preview = document.getElementById('stockColorPreview');
  const color = runtimeValue<LegacyValue>('stockModal').color;
  if (preview) {
    preview.style.setProperty(
      '--stock-row-tint',
      /^#[0-9A-F]{6}$/.test(color) ? color + '24' : 'transparent',
    );
  }
  return true;
}

export async function saveStockRowColor(clear = false): Promise<boolean> {
  const modal = runtimeValue<LegacyValue>('stockModal');
  const item = spreadsheetItem(modal.itemId);
  if (!item || modal.mode !== 'row-color' || modal.submitting) return false;
  const color = clear ? '' : String(modal.color || '').trim().toUpperCase();
  if (color && !/^#[0-9A-F]{6}$/.test(color)) {
    modal.error = 'Enter a full six-digit hex color, for example #FFD0DB.';
    renderStockSpreadsheetModal();
    return false;
  }
  modal.submitting = true;
  modal.error = '';
  renderStockSpreadsheetModal();
  try {
    const row = runtimeValue<LegacyValue>('rpcRows')(
      await runtimeValue<LegacyValue>('cloud').client.rpc(
        'pos_inventory_update_item_row_color',
        {
          p_business_id: String(runtimeValue<LegacyValue>('posContext').businessId),
          p_inventory_item_id: item.id,
          p_row_color: color || null,
          p_expected_revision: Number(item.revision || 0),
        },
      ),
    )[0];
    if (!row) throw new Error('Missing authoritative inventory response');
    applySpreadsheetRow(item, row);
    runtimeValue<LegacyValue>('closeStockModal')(true);
    await loadStocks({ background: true });
    runtimeValue<LegacyValue>('stockState').notice = color
      ? 'Row color saved.'
      : 'Row color cleared.';
    runtimeValue<LegacyValue>('renderStocks')();
    return true;
  } catch (error) {
    modal.submitting = false;
    modal.error = stockErrorText(error);
    renderStockSpreadsheetModal();
    return false;
  }
}

export function openInventoryPeriodStart(): boolean {
  if (stockSpreadsheetLocked() || runtimeValue<LegacyValue>('stockState').activePeriod) {
    return false;
  }
  openSpecialStockModal('period-start');
  const now = new Date();
  runtimeValue<LegacyValue>('stockModal').periodName =
    'Inventory ' + now.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  runtimeValue<LegacyValue>('stockModal').clientPeriodId =
    runtimeValue<LegacyValue>('posUuid')();
  renderStockSpreadsheetModal();
  runtimeValue<LegacyValue>('focusSoon')('#stockPeriodName');
  return true;
}

export async function startInventoryPeriodNow(): Promise<boolean> {
  if (stockSpreadsheetLocked()) return false;
  return ensureActiveInventoryPeriod({ announce: true });
}

export function openInventoryPeriodClose(): boolean {
  if (stockSpreadsheetLocked() || !runtimeValue<LegacyValue>('stockState').activePeriod) {
    return false;
  }
  openSpecialStockModal('period-close');
  runtimeValue<LegacyValue>('stockModal').clientCloseId =
    runtimeValue<LegacyValue>('posUuid')();
  renderStockSpreadsheetModal();
  runtimeValue<LegacyValue>('focusSoon')('#stockPeriodNote');
  return true;
}

export function updateStockPeriodField(
  field: LegacyValue,
  value: LegacyValue,
): boolean {
  const modal = runtimeValue<LegacyValue>('stockModal');
  if (modal.mode !== 'period-start' && modal.mode !== 'period-close') return false;
  if (field !== 'periodName' && field !== 'periodNote') return false;
  modal[field] = String(value || '');
  modal.error = '';
  return true;
}

export async function submitInventoryPeriodStart(): Promise<boolean> {
  const modal = runtimeValue<LegacyValue>('stockModal');
  if (modal.mode !== 'period-start' || modal.submitting) return false;
  const name = String(modal.periodName || '').trim();
  if (!name || name.length > 120) {
    modal.error = 'Enter a period name between 1 and 120 characters.';
    renderStockSpreadsheetModal();
    return false;
  }
  modal.submitting = true;
  modal.clientPeriodId = modal.clientPeriodId || runtimeValue<LegacyValue>('posUuid')();
  renderStockSpreadsheetModal();
  try {
    const rows = runtimeValue<LegacyValue>('rpcRows')(
      await runtimeValue<LegacyValue>('cloud').client.rpc(
        'pos_inventory_start_period',
        {
          p_business_id: String(runtimeValue<LegacyValue>('posContext').businessId),
          p_client_period_id: modal.clientPeriodId,
          p_name: name,
          p_carry_forward: true,
        },
      ),
    );
    if (!rows.length) throw new Error('Missing inventory period response');
    runtimeValue<LegacyValue>('closeStockModal')(true);
    await loadStocks({ background: true });
    runtimeValue<LegacyValue>('stockState').notice = 'Inventory period started. Enter opening stock directly in the table.';
    runtimeValue<LegacyValue>('renderStocks')();
    return true;
  } catch (error) {
    modal.submitting = false;
    modal.error = stockErrorText(error);
    renderStockSpreadsheetModal();
    return false;
  }
}

export async function submitInventoryPeriodClose(): Promise<boolean> {
  const modal = runtimeValue<LegacyValue>('stockModal');
  const period = runtimeValue<LegacyValue>('stockState').activePeriod;
  if (modal.mode !== 'period-close' || modal.submitting || !period) return false;
  const note = String(modal.periodNote || '').trim();
  if (note.length > 1000) {
    modal.error = 'Keep the closing note under 1,000 characters.';
    renderStockSpreadsheetModal();
    return false;
  }
  modal.submitting = true;
  modal.clientCloseId = modal.clientCloseId || runtimeValue<LegacyValue>('posUuid')();
  renderStockSpreadsheetModal();
  try {
    const rows = runtimeValue<LegacyValue>('rpcRows')(
      await runtimeValue<LegacyValue>('cloud').client.rpc(
        'pos_inventory_close_period',
        {
          p_business_id: String(runtimeValue<LegacyValue>('posContext').businessId),
          p_period_id: String(period.id),
          p_client_close_id: modal.clientCloseId,
          p_note: note || null,
        },
      ),
    );
    if (!rows.length) throw new Error('Missing inventory period response');
    runtimeValue<LegacyValue>('closeStockModal')(true);
    await loadStocks({ background: true });
    runtimeValue<LegacyValue>('stockState').notice = 'Inventory period closed.';
    runtimeValue<LegacyValue>('renderStocks')();
    return true;
  } catch (error) {
    modal.submitting = false;
    modal.error = stockErrorText(error);
    renderStockSpreadsheetModal();
    return false;
  }
}

export function renderStockSpreadsheetModal(): boolean {
  const modal = runtimeValue<LegacyValue>('stockModal');
  const content = document.getElementById('stockModalContent');
  if (!modal.open || !content) return false;
  if (modal.mode === 'row-color') {
    const item = spreadsheetItem(modal.itemId);
    if (!item) return false;
    const presets = ['#FFD0DB', '#DCEBFF', '#DDF3E4', '#FFF0B8', '#E9DDFC', '#E5E7EB'];
    const color = String(modal.color || '').toUpperCase();
    content.innerHTML =
      '<div class="modal-head"><div style="flex:1"><h2 id="stockModalTitle">Row color</h2><p class="hint">Mark ' +
      runtimeValue<LegacyValue>('escapeHtml')(item.name) +
      ' without changing its stock status.</p></div><button class="modal-close" data-act="closeStockModal" aria-label="Close row color dialog"' +
      (modal.submitting ? ' disabled' : '') +
      '>x</button></div><div class="stock-color-presets" aria-label="Color presets">' +
      presets.map(function (preset) {
        return '<button type="button" class="stock-color-preset" data-act="chooseStockRowColor" data-color="' + preset + '" aria-label="Use ' + preset + '" aria-pressed="' + (color === preset ? 'true' : 'false') + '" style="--stock-color:' + preset + '"></button>';
      }).join('') +
      '</div><div class="grid2"><div><label class="fld" for="stockColorNative">Choose color</label><input id="stockColorNative" type="color" data-stock-color-input value="' +
      (/^#[0-9A-F]{6}$/.test(color) ? color : '#FFD0DB') +
      '"' + (modal.submitting ? ' disabled' : '') + '></div><div><label class="fld" for="stockColorHex">Hex color</label><input id="stockColorHex" data-stock-color-input maxlength="7" value="' +
      runtimeValue<LegacyValue>('escapeHtml')(color) +
      '" placeholder="#FFD0DB" autocomplete="off"' + (modal.submitting ? ' disabled' : '') + '></div></div><div id="stockColorPreview" class="stock-color-preview" style="--stock-row-tint:' +
      (/^#[0-9A-F]{6}$/.test(color) ? color + '24' : 'transparent') +
      '"><strong>Preview</strong><span>' + runtimeValue<LegacyValue>('escapeHtml')(item.name) + '</span></div><div id="stockModalError" class="modal-error" aria-live="assertive">' +
      runtimeValue<LegacyValue>('escapeHtml')(modal.error) +
      '</div><div class="modal-actions"><button class="btn secondary" data-act="clearStockRowColor"' + (modal.submitting ? ' disabled' : '') + '>Clear color</button><button class="btn secondary" data-act="closeStockModal"' + (modal.submitting ? ' disabled' : '') + '>Cancel</button><button class="btn" data-act="saveStockRowColor"' + (modal.submitting ? ' disabled' : '') + '>' + (modal.submitting ? 'Saving...' : 'Save color') + '</button></div>';
    return true;
  }
  if (modal.mode === 'period-start') {
    content.innerHTML =
      '<div class="modal-head"><div style="flex:1"><h2 id="stockModalTitle">Start inventory period</h2><p class="hint">Use one period for a popup or stock-counting cycle.</p></div><button class="modal-close" data-act="closeStockModal" aria-label="Close start period dialog"' + (modal.submitting ? ' disabled' : '') + '>x</button></div><label class="fld" for="stockPeriodName">Period name</label><input id="stockPeriodName" data-stock-period-field="periodName" maxlength="120" value="' + runtimeValue<LegacyValue>('escapeHtml')(modal.periodName) + '" placeholder="e.g. November popup"' + (modal.submitting ? ' disabled' : '') + '><div class="note stock-phase-note">After starting, enter Opening Stock, purchases, waste, and reorder levels directly in the spreadsheet.</div><div id="stockModalError" class="modal-error" aria-live="assertive">' + runtimeValue<LegacyValue>('escapeHtml')(modal.error) + '</div><div class="modal-actions"><button class="btn secondary" data-act="closeStockModal"' + (modal.submitting ? ' disabled' : '') + '>Cancel</button><button class="btn" data-act="submitInventoryPeriodStart"' + (modal.submitting ? ' disabled' : '') + '>' + (modal.submitting ? 'Starting...' : 'Start period') + '</button></div>';
    return true;
  }
  if (modal.mode === 'period-close') {
    const period = runtimeValue<LegacyValue>('stockState').activePeriod;
    content.innerHTML =
      '<div class="modal-head"><div style="flex:1"><h2 id="stockModalTitle">Close inventory period</h2><p class="hint">' + runtimeValue<LegacyValue>('escapeHtml')((period && period.name) || 'Current inventory') + '</p></div><button class="modal-close" data-act="closeStockModal" aria-label="Close inventory period dialog"' + (modal.submitting ? ' disabled' : '') + '>x</button></div><div class="note stock-phase-note"><strong>Close this period?</strong><br>The final remaining amounts stay in history. Start a new period for the next popup.</div><label class="fld" for="stockPeriodNote">Closing note (optional)</label><textarea id="stockPeriodNote" data-stock-period-field="periodNote" maxlength="1000" placeholder="Count notes or event name"' + (modal.submitting ? ' disabled' : '') + '>' + runtimeValue<LegacyValue>('escapeHtml')(modal.periodNote) + '</textarea><div id="stockModalError" class="modal-error" aria-live="assertive">' + runtimeValue<LegacyValue>('escapeHtml')(modal.error) + '</div><div class="modal-actions"><button class="btn secondary" data-act="closeStockModal"' + (modal.submitting ? ' disabled' : '') + '>Cancel</button><button class="btn danger" data-act="submitInventoryPeriodClose"' + (modal.submitting ? ' disabled' : '') + '>' + (modal.submitting ? 'Closing...' : 'Close period') + '</button></div>';
    return true;
  }
  return false;
}
