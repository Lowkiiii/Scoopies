import { readStocksBinding, runtimeValue } from './bindings';
import {
  stockFilteredItems,
  stockFormatQuantity,
  stockRowTint,
} from './formatting';
import {
  stockCellFieldState,
  type StockCellField,
} from './cell-edit';
import { stockInlineFieldState, stockInlineLocked } from './inline-edit';
import { stockReorderReason } from './reorder';
import { stockStoredPending } from './storage';
import {
  stockSpreadsheetFieldState,
  stockSpreadsheetLocked,
  type StockSpreadsheetField,
} from './spreadsheet';
import type { LegacyValue } from './types';

export function stockFilterBarHtml(): string {
  const totals: Record<string, number> = {
    all: runtimeValue('stockState').items.length,
    low: 0,
    out: 0,
    not_counted: 0,
  };
  runtimeValue('stockState').items.forEach(function (item: LegacyValue) {
    const key = String(stockSpreadsheetStatus(item).key);
    if (Object.prototype.hasOwnProperty.call(totals, key)) totals[key]++;
  });
  function chip(key: LegacyValue, label: LegacyValue): string {
    const active = runtimeValue('stockState').status === key;
    return (
      '<button class="category-chip' +
      (active ? ' active' : '') +
      '" data-act="setStockStatus" data-status="' +
      key +
      '" aria-pressed="' +
      (active ? 'true' : 'false') +
      '">' +
      label +
      ' (' +
      Number(totals[String(key)] || 0) +
      ')' +
      '</button>'
    );
  }
  return (
    '<div class="stock-filter-bar" aria-label="Stock status filters">' +
    chip('all', 'All') +
    chip('low', 'Low') +
    chip('out', 'Out') +
    chip('not_counted', 'Not counted') +
    '</div>'
  );
}

function stockInlineEditorHtml(
  item: LegacyValue,
  field: 'count' | 'threshold',
  locked: boolean,
  lockReason: string,
): string {
  const edit = stockInlineFieldState(item, field);
  const fallback =
    field === 'count'
      ? item.initialized
        ? String(item.balance)
        : ''
      : item.threshold == null
        ? ''
        : String(item.threshold);
  const value = edit && edit.value != null ? String(edit.value) : fallback;
  const state = String((edit && edit.status) || 'idle');
  const message = String(
    (edit && edit.error) ||
      (state === 'saving'
        ? 'Saving...'
        : state === 'saved'
          ? 'Saved'
          : ''),
  );
  const invalid =
    state === 'error' || state === 'retry' || state === 'uncertain';
  const safeId = String(item.id || '').replace(/[^a-zA-Z0-9_-]/g, '-');
  const feedbackId =
    'stockInlineFeedback-' + safeId + '-' + String(field);
  const fieldLabel = field === 'count' ? 'on hand' : 'low-stock alert';
  const placeholder = field === 'count' ? 'Enter count' : 'Disabled';
  const preferredUnit = String(item.preferredUnit || item.baseUnit || '');
  return (
    '<div class="stock-inline-editor" data-stock-inline-cell data-stock-inline-state="' +
    runtimeValue('escapeHtml')(state) +
    '"><div class="stock-inline-control"><input class="stock-inline-input" type="number" inputmode="decimal" min="0" max="1000000000000" step="any" data-stock-inline-field="' +
    field +
    '" data-id="' +
    runtimeValue('escapeHtml')(item.id) +
    '" value="' +
    runtimeValue('escapeHtml')(value) +
    '" placeholder="' +
    placeholder +
    '" aria-label="' +
    runtimeValue('escapeHtml')(
      String(item.name || 'Stock item') +
        ' ' +
        fieldLabel +
        ' in ' +
        preferredUnit,
    ) +
    '" aria-describedby="' +
    feedbackId +
    '" aria-invalid="' +
    (invalid ? 'true' : 'false') +
    '"' +
    (locked
      ? ' disabled title="' + runtimeValue('escapeHtml')(lockReason) + '"'
      : '') +
    '></div><div id="' +
    feedbackId +
    '" class="stock-inline-feedback ' +
    (invalid ? 'bad' : state === 'saved' ? 'good' : '') +
    '" data-stock-inline-feedback="' +
    field +
    '" aria-live="polite">' +
    runtimeValue('escapeHtml')(message) +
    '</div></div>'
  );
}

function stockCellEditorHtml(
  item: LegacyValue,
  field: StockCellField,
  locked: boolean,
  lockReason: string,
): string {
  const edit = stockCellFieldState(item, field);
  const value = String((edit && edit.value) || '');
  const state = String((edit && edit.status) || 'idle');
  const message = String(
    (edit && edit.error) ||
      (state === 'saving' ? 'Saving...' : state === 'saved' ? 'Saved' : ''),
  );
  const invalid = state === 'error' || state === 'uncertain';
  const safeId = String(item.id || '').replace(/[^a-zA-Z0-9_-]/g, '-');
  const feedbackId = 'stockCellFeedback-' + safeId + '-' + field;
  const labels: Record<StockCellField, string> = {
    categoryName: 'category',
    purchasedFrom: 'purchased from',
    lastStockedOn:
      item.kind === 'mixture' ? 'last batch made date' : 'date purchased',
    notes: 'notes',
    preferredUnit: 'measurement unit',
  };
  const disabled = locked
    ? ' disabled title="' + runtimeValue('escapeHtml')(lockReason) + '"'
    : '';
  let control: string;
  if (field === 'preferredUnit') {
    control =
      '<select class="stock-cell-control stock-cell-select" data-stock-cell-field="preferredUnit" data-id="' +
      runtimeValue('escapeHtml')(item.id) +
      '" aria-label="' +
      runtimeValue('escapeHtml')(item.name + ' ' + labels[field]) +
      '" aria-describedby="' +
      feedbackId +
      '" aria-invalid="' +
      (invalid ? 'true' : 'false') +
      '"' +
      disabled +
      '>' +
      stockPreferredUnitOptions(item, value) +
      '</select>';
  } else {
    const maxLength =
      field === 'categoryName' ? 120 : field === 'purchasedFrom' ? 160 : 1000;
    const placeholder =
      field === 'categoryName'
        ? 'Uncategorized'
        : field === 'purchasedFrom'
          ? 'Supplier'
          : field === 'notes'
            ? 'Notes'
            : '';
    control =
      '<input class="stock-cell-control stock-cell-input" type="' +
      (field === 'lastStockedOn' ? 'date' : 'text') +
      '" data-stock-cell-field="' +
      field +
      '" data-id="' +
      runtimeValue('escapeHtml')(item.id) +
      '" value="' +
      runtimeValue('escapeHtml')(value) +
      '"' +
      (field === 'lastStockedOn'
        ? ''
        : ' maxlength="' + maxLength + '" placeholder="' + placeholder + '"') +
      ' autocomplete="off" aria-label="' +
      runtimeValue('escapeHtml')(item.name + ' ' + labels[field]) +
      '" aria-describedby="' +
      feedbackId +
      '" aria-invalid="' +
      (invalid ? 'true' : 'false') +
      '"' +
      disabled +
      '>';
  }
  return (
    '<div class="stock-cell-editor" data-stock-cell-editor data-stock-cell-state="' +
    runtimeValue('escapeHtml')(state) +
    '">' +
    control +
    '<div id="' +
    feedbackId +
    '" class="stock-cell-feedback ' +
    (invalid ? 'bad' : state === 'saved' ? 'good' : '') +
    '" data-stock-cell-feedback aria-live="polite">' +
    runtimeValue('escapeHtml')(message) +
    '</div></div>'
  );
}

function stockInventoryScrollPosition(): { top: number; left: number } | null {
  const inventory = document.querySelector('.stock-inventory') as HTMLElement | null;
  return inventory
    ? { top: inventory.scrollTop, left: inventory.scrollLeft }
    : null;
}

function restoreStockInventoryScroll(
  position: { top: number; left: number } | null,
): void {
  if (!position) return;
  const inventory = document.querySelector('.stock-inventory') as HTMLElement | null;
  if (!inventory) return;
  inventory.scrollTop = position.top;
  inventory.scrollLeft = position.left;
}

function stockPreferredQuantity(
  value: LegacyValue,
  item: LegacyValue,
  signed = false,
): string {
  const unit = String(item.preferredUnit || item.baseUnit || '');
  const amount = Number(value || 0) / (runtimeValue('UNIT_FACTOR')[unit] || 1);
  const prefix = signed && amount > 0 ? '+' : '';
  const label = unit === 'l' ? 'L' : unit === 'piece' && amount !== 1 ? 'pieces' : unit;
  return (
    prefix +
    amount.toLocaleString('en-PH', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    }) +
    ' ' +
    label
  );
}

function stockPreferredUnitOptions(
  item: LegacyValue,
  selectedValue?: LegacyValue,
): string {
  const choices =
    item.baseUnit === 'g'
      ? ['g', 'kg']
      : item.baseUnit === 'ml'
        ? ['ml', 'l']
        : ['piece'];
  return choices
    .map(function (unit) {
      return (
        '<option value="' +
        unit +
        '"' +
        (unit === String(selectedValue || item.preferredUnit) ? ' selected' : '') +
        '>' +
        (unit === 'l' ? 'L' : unit) +
        '</option>'
      );
    })
    .join('');
}

function stockSpreadsheetEditorHtml(
  item: LegacyValue,
  field: StockSpreadsheetField,
  label: string,
  locked: boolean,
  lockReason: string,
): string {
  const edit = stockSpreadsheetFieldState(item, field);
  const state = String((edit && edit.status) || 'idle');
  const invalid = state === 'error';
  const safeId = String(item.id || '').replace(/[^a-zA-Z0-9_-]/g, '-');
  const feedbackId = 'stockSheetFeedback-' + safeId + '-' + field;
  const step = field === 'purchasePrice' ? '0.01' : 'any';
  return (
    '<div class="stock-sheet-editor" data-stock-sheet-editor data-stock-sheet-state="' +
    state +
    '"><input class="stock-sheet-input" type="number" inputmode="decimal" min="0" step="' +
    step +
    '" data-stock-sheet-field="' +
    field +
    '" data-id="' +
    runtimeValue('escapeHtml')(item.id) +
    '" value="' +
    runtimeValue('escapeHtml')((edit && edit.value) || '') +
    '" placeholder="0" aria-label="' +
    runtimeValue('escapeHtml')(item.name + ' ' + label) +
    '" aria-describedby="' +
    feedbackId +
    '" aria-invalid="' +
    (invalid ? 'true' : 'false') +
    '"' +
    (locked
      ? ' disabled title="' + runtimeValue('escapeHtml')(lockReason) + '"'
      : '') +
    '><span id="' +
    feedbackId +
    '" class="stock-cell-feedback ' +
    (invalid ? 'bad' : state === 'saved' ? 'good' : '') +
    '" data-stock-sheet-feedback aria-live="polite">' +
    runtimeValue('escapeHtml')(
      (edit && edit.error) ||
        (state === 'saving' ? 'Saving...' : state === 'saved' ? 'Saved' : ''),
    ) +
    '</span></div>'
  );
}

function stockSpreadsheetQuantity(value: LegacyValue, item: LegacyValue): string {
  return value == null ? '\u2014' : stockPreferredQuantity(value, item);
}

function stockSpreadsheetMoney(centavos: LegacyValue): string {
  return centavos == null
    ? '\u2014'
    : runtimeValue('peso')(Number(centavos) / 100);
}

function stockDragGripIcon(): string {
  return (
    '<svg class="stock-control-icon stock-grip-icon" viewBox="0 0 12 18" aria-hidden="true" focusable="false">' +
    '<circle cx="3" cy="3" r="1.25"></circle><circle cx="9" cy="3" r="1.25"></circle>' +
    '<circle cx="3" cy="9" r="1.25"></circle><circle cx="9" cy="9" r="1.25"></circle>' +
    '<circle cx="3" cy="15" r="1.25"></circle><circle cx="9" cy="15" r="1.25"></circle>' +
    '</svg>'
  );
}

function stockSpreadsheetStatus(item: LegacyValue): LegacyValue {
  const serverStatus = String(item.stockStatus || '').toUpperCase();
  if (!item.periodId || serverStatus === 'NOT COUNTED' || item.openingStock == null) {
    return { key: 'not_counted', label: 'Not counted', cls: 'warn' };
  }
  const remaining = Number(item.remainingStock || 0);
  if (remaining <= 0) {
    return { key: 'out', label: 'Out of stock', cls: 'bad' };
  }
  if (serverStatus === 'RESTOCK' || (item.threshold != null && remaining <= Number(item.threshold))) {
    return { key: 'low', label: 'Restock', cls: 'warn' };
  }
  return { key: 'good', label: 'OK', cls: 'good' };
}

export function stockItemCardsHtml(): string {
  const items = readStocksBinding('stockFilteredItems', stockFilteredItems)();
  if (!items.length) {
    return '<p class="empty">' +
      (runtimeValue('stockState').items.length
        ? 'No stock items match these filters.'
        : 'No ingredients are tracked yet. Add named ingredients in Costing, then refresh Stocks.') +
      '</p>';
  }
  const canManage = runtimeValue('stockCanManage')();
  const period = runtimeValue('stockState').activePeriod;
  const locked = stockSpreadsheetLocked() || !period;
  const unitLocked = stockInlineLocked();
  const lockReason = !period
    ? 'Start an inventory period before entering quantities'
    : 'Wait for the current inventory update to finish';
  const reorderReason = stockReorderReason(false);
  return (
    '<p class="stock-mobile-scroll-hint">Swipe sideways to view every inventory column.</p>' +
    '<div class="stock-inventory" tabindex="0" aria-label="Scrollable inventory spreadsheet"><table class="stock-table stock-spreadsheet"><caption class="stock-table-caption">Inventory period spreadsheet</caption><thead><tr>' +
    '<th scope="col" data-stock-field="category">Category</th>' +
    '<th scope="col" data-stock-field="item">Item</th>' +
    '<th scope="col" data-stock-field="unit">Unit</th>' +
    '<th scope="col" data-stock-field="opening">Opening Stock</th>' +
    '<th scope="col" data-stock-field="added">Stock Added</th>' +
    '<th scope="col" data-stock-field="used">Stock Used</th>' +
    '<th scope="col" data-stock-field="wasted">Wasted/Damaged</th>' +
    '<th scope="col" data-stock-field="remaining">Remaining Stock</th>' +
    '<th scope="col" data-stock-field="reorder">Reorder Level</th>' +
    '<th scope="col" data-stock-field="purchase-quantity">Purchase Quantity</th>' +
    '<th scope="col" data-stock-field="purchase-price">Purchase Price (&#8369;)</th>' +
    '<th scope="col" data-stock-field="unit-cost">Cost per Unit</th>' +
    '<th scope="col" data-stock-field="remaining-value">Remaining Value (&#8369;)</th>' +
    '<th scope="col" data-stock-field="status">Status</th>' +
    '</tr></thead><tbody>' +
    items.map(function (item: LegacyValue, itemIndex: number) {
      const status = stockSpreadsheetStatus(item);
      const preferredUnit = String(item.preferredUnit || item.baseUnit || '');
      const unitCost = item.costPerUnitCentavos == null
        ? null
        : Number(item.costPerUnitCentavos) *
          Number(runtimeValue('UNIT_FACTOR')[preferredUnit] || 1);
      const color = /^#[0-9A-F]{6}$/i.test(String(item.rowColor || ''))
        ? String(item.rowColor).toUpperCase()
        : '';
      const rowStyle = color
        ? ' style="--stock-row-tint:' + stockRowTint(color) + ';--stock-row-accent:' + color + '"'
        : '';
      const orderId = item.sourceType === 'packaging'
        ? 'packaging:' + String(item.sourceId || item.id)
        : String(item.sourceId || item.id);
      return (
        '<tr class="stock-row stock-card" data-stock-item="' + runtimeValue('escapeHtml')(item.id) + '" data-stock-order-id="' + runtimeValue('escapeHtml')(orderId) + '" data-entity="' + (item.sourceType === 'packaging' ? 'packaging' : 'ingredient') + '" data-id="' + runtimeValue('escapeHtml')(item.sourceId || '') + '"' + rowStyle + '>' +
        '<td data-stock-field="category"><div class="stock-category-entry">' +
        (canManage
          ? stockCellEditorHtml(
              item,
              'categoryName',
              unitLocked,
              'Wait for the current inventory update to finish',
            )
          : runtimeValue('escapeHtml')(item.categoryName || 'Uncategorized')) +
        '</div></td>' +
        '<th scope="row" data-stock-field="item"><div class="stock-item-line">' +
        (canManage
          ? '<button class="stock-drag-handle" type="button" data-stock-drag-handle data-id="' + runtimeValue('escapeHtml')(item.id) + '" data-stock-order-id="' + runtimeValue('escapeHtml')(orderId) + '" aria-label="Move ' + runtimeValue('escapeHtml')(item.name) + ', position ' + (itemIndex + 1) + ' of ' + items.length + '" aria-describedby="stockReorderInstructions" aria-keyshortcuts="ArrowUp ArrowDown Home End" title="' + runtimeValue('escapeHtml')(reorderReason || 'Drag to arrange this row') + '"' + (reorderReason ? ' disabled' : '') + '>' + stockDragGripIcon() + '</button>'
          : '') +
        '<span class="stock-item-name">' + runtimeValue('escapeHtml')(item.name) + '</span><span class="stock-kind-marker' + (item.kind === 'mixture' ? ' mixture' : '') + '">' + (item.kind === 'mixture' ? 'Mix' : item.sourceType === 'packaging' ? 'Pack' : 'Item') + '</span>' +
        (canManage
          ? '<button class="stock-color-swatch" type="button" data-act="openStockColor" data-id="' + runtimeValue('escapeHtml')(item.id) + '" aria-label="Choose row color for ' + runtimeValue('escapeHtml')(item.name) + '" title="Choose row color" style="--stock-color:' + (color || '#FFFFFF') + '"><span class="stock-color-dot" aria-hidden="true"></span></button>'
          : '') +
        '</div></th>' +
        '<td class="stock-unit-cell" data-stock-field="unit">' +
        (canManage
          ? stockCellEditorHtml(item, 'preferredUnit', unitLocked, lockReason)
          : runtimeValue('escapeHtml')(preferredUnit === 'l' ? 'L' : preferredUnit)) +
        '</td>' +
        '<td data-stock-field="opening">' + (canManage ? stockSpreadsheetEditorHtml(item, 'openingStock', 'opening stock in ' + preferredUnit, locked, lockReason) : stockSpreadsheetQuantity(item.openingStock, item)) + '</td>' +
        '<td data-stock-field="added">' + (canManage ? stockSpreadsheetEditorHtml(item, 'stockAdded', 'stock added in ' + preferredUnit, locked, lockReason) : stockSpreadsheetQuantity(item.stockAdded, item)) + '</td>' +
        '<td class="stock-formula-cell" data-stock-field="used">' + stockSpreadsheetQuantity(item.stockUsed, item) + '</td>' +
        '<td data-stock-field="wasted">' + (canManage ? stockSpreadsheetEditorHtml(item, 'wasted', 'wasted or damaged in ' + preferredUnit, locked, lockReason) : stockSpreadsheetQuantity(item.wasted, item)) + '</td>' +
        '<td class="stock-formula-cell stock-remaining-cell" data-stock-field="remaining">' + stockSpreadsheetQuantity(item.remainingStock, item) + '</td>' +
        '<td data-stock-field="reorder">' + (canManage ? stockSpreadsheetEditorHtml(item, 'reorderLevel', 'reorder level in ' + preferredUnit, locked, lockReason) : stockSpreadsheetQuantity(item.threshold, item)) + '</td>' +
        '<td data-stock-field="purchase-quantity">' + (canManage ? stockSpreadsheetEditorHtml(item, 'purchaseQuantity', 'purchase quantity in ' + preferredUnit, locked, lockReason) : stockSpreadsheetQuantity(item.purchaseQuantity, item)) + '</td>' +
        '<td data-stock-field="purchase-price">' + (canManage ? stockSpreadsheetEditorHtml(item, 'purchasePrice', 'purchase price in pesos', locked, lockReason) : stockSpreadsheetMoney(item.purchasePriceCentavos)) + '</td>' +
        '<td class="stock-formula-cell" data-stock-field="unit-cost">' + stockSpreadsheetMoney(unitCost) + (unitCost == null ? '' : ' / ' + runtimeValue('escapeHtml')(preferredUnit === 'l' ? 'L' : preferredUnit)) + '</td>' +
        '<td class="stock-formula-cell" data-stock-field="remaining-value">' + stockSpreadsheetMoney(item.remainingValueCentavos) + '</td>' +
        '<td class="stock-status-cell" data-stock-field="status"><span class="stock-badge ' + status.cls + '">' + runtimeValue('escapeHtml')(status.label) + '</span></td>' +
        '</tr>'
      );
    }).join('') +
    '</tbody></table></div>'
  );
}

export function stockTransactionLabel(
  type: LegacyValue,
  row: LegacyValue,
): string {
  if (type === 'stock_in') return 'Stock received';
  if (type === 'waste') return 'Waste';
  if (type === 'correction') return 'Correction';
  if (type === 'period_cell_adjustment') return 'Spreadsheet adjustment';
  if (type === 'sale_usage') return 'Used by POS sale';
  if (type === 'sale_reversal') return 'POS sale reversed';
  if (type === 'stock_count') {
    return row && row.itemSequence === 1 ? 'Opening count' : 'Stock count';
  }
  return 'Stock update';
}

export function stockHistoryHtml(): string {
  if (!runtimeValue('stockCanManage')()) return '';
  const transactions = runtimeValue('stockState').transactions || [];
  const rowHtml = function (row: LegacyValue): string {
    const detail = [row.reason, row.note].filter(Boolean).join(' · ');
    const when = row.occurredAt
      ? new Date(row.occurredAt).toLocaleString('en-PH', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : '';
    return (
      '<div class="stock-history-row"><div><strong>' +
      runtimeValue('escapeHtml')(row.itemName) +
      '</strong><div class="stock-card-meta">' +
      runtimeValue('escapeHtml')(
        readStocksBinding(
          'stockTransactionLabel',
          stockTransactionLabel,
        )(row.type, row),
      ) +
      ' &middot; ' +
      runtimeValue('escapeHtml')(row.actor) +
      ' &middot; ' +
      runtimeValue('escapeHtml')(when) +
      (detail ? ' &middot; ' + runtimeValue('escapeHtml')(detail) : '') +
      '</div></div><div class="stock-history-delta ' +
      (row.delta < 0 ? 'bad' : row.delta > 0 ? 'good' : '') +
      '">' +
      readStocksBinding(
        'stockFormatQuantity',
        stockFormatQuantity,
      )(row.delta, row.unit, true) +
      '<div class="stock-card-meta">After ' +
      readStocksBinding(
        'stockFormatQuantity',
        stockFormatQuantity,
      )(row.after, row.unit, false) +
      '</div></div></div>'
    );
  };
  if (!transactions.length) {
    return '<details class="card stock-history-card"><summary class="stock-history-toggle"><span>Movement history (0)</span><span>No movements</span></summary></details>';
  }
  const first = transactions.slice(0, 5);
  const remaining = transactions.slice(5);
  const latest = transactions[0] && transactions[0].occurredAt
    ? new Date(transactions[0].occurredAt).toLocaleString('en-PH', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';
  return (
    '<details class="card stock-history-card"><summary class="stock-history-toggle"><span>Movement history (' +
    transactions.length +
    ')</span><span>View</span></summary><div class="stock-history-summary">Latest update ' +
    runtimeValue('escapeHtml')(latest) +
    '</div><div class="stock-history">' +
    first.map(rowHtml).join('') +
    '</div>' +
    (remaining.length
      ? '<details class="stock-history-more"><summary class="stock-history-actions">View all ' +
        transactions.length +
        ' records</summary><div class="stock-history">' +
        remaining.map(rowHtml).join('') +
        '</div></details>'
      : '') +
    '</details>'
  );
}

export function renderStockResults(): void {
  const scrollPosition = stockInventoryScrollPosition();
  const results = document.getElementById('stockResults');
  const count = document.getElementById('stockVisibleCount');
  if (results) {
    results.innerHTML = readStocksBinding(
      'stockItemCardsHtml',
      stockItemCardsHtml,
    )();
  }
  if (count) {
    count.textContent =
      readStocksBinding('stockFilteredItems', stockFilteredItems)().length +
      ' of ' +
      runtimeValue('stockState').items.length +
      ' items';
  }
  document
    .querySelectorAll('#stocks [data-act="setStockStatus"]')
    .forEach(function (button) {
      const element = button as HTMLElement;
      const active =
        String(element.dataset.status) ===
        String(runtimeValue('stockState').status);
      element.classList.toggle('active', active);
      element.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  restoreStockInventoryScroll(scrollPosition);
}

function stockPeriodBarHtml(readOnly: boolean): string {
  const period = runtimeValue('stockState').activePeriod;
  if (!period) {
    return (
      '<div class="stock-period-bar empty-period"><div><strong>Stock editing is off</strong><span>Start inventory to edit quantities.</span></div>' +
      (readOnly
        ? ''
        : '<button class="btn small" data-act="startInventoryPeriodNow"' +
          (runtimeValue('stockState').startingPeriod ? ' disabled' : '') +
          '>' +
          (runtimeValue('stockState').startingPeriod
            ? 'Starting...'
            : 'Start inventory') +
          '</button>') +
      '</div>'
    );
  }
  const opened = period.openedAt
    ? new Date(period.openedAt).toLocaleDateString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';
  return (
    '<div class="stock-period-bar"><div><span class="stock-period-state">Active</span><strong>' +
    runtimeValue('escapeHtml')(period.name || 'Inventory period') +
    '</strong><span>' +
    runtimeValue('escapeHtml')(opened ? 'Opened ' + opened : 'Shared inventory period') +
    '</span></div>' +
    (readOnly
      ? ''
      : '<button class="btn small secondary" data-act="openInventoryPeriodClose">Close period</button>') +
    '</div>'
  );
}

export function renderStocks(): void {
  const scrollPosition = stockInventoryScrollPosition();
  const root = document.getElementById('stockRoot');
  if (!root) return;
  if (!runtimeValue('session')) {
    root.innerHTML =
      '<div class="card"><h2>Stocks</h2><p class="hint">Sign in to load the shared physical inventory.</p></div>';
    return;
  }
  if (
    (!runtimeValue('posContext').loaded ||
      runtimeValue('posContext').loading) &&
    !runtimeValue('posContext').businessId
  ) {
    root.innerHTML =
      '<div class="card"><div class="pos-loading">Opening the inventory workspace...</div></div>';
    return;
  }
  if (
    runtimeValue('posContext').error ||
    !runtimeValue('posContext').businessId
  ) {
    root.innerHTML =
      '<div class="card"><h2>Stocks</h2><div class="note">' +
      runtimeValue('escapeHtml')(
        runtimeValue('posContext').error ||
          'The shared workspace is unavailable.',
      ) +
      '</div><button class="btn secondary" data-act="refreshStocks" style="margin-top:10px">Retry</button></div>';
    return;
  }
  const readOnly = !runtimeValue('stockCanManage')();
  const top =
    '<div class="stock-head"><div class="stock-head-title"><h2>Stocks</h2><div class="stock-sync">' +
    (runtimeValue('stockState').refreshing
      ? 'Refreshing...'
      : runtimeValue('stockState').lastUpdatedAt
        ? 'Updated ' +
          new Date(
            runtimeValue('stockState').lastUpdatedAt,
          ).toLocaleTimeString('en-PH', {
            hour: 'numeric',
            minute: '2-digit',
          })
        : 'Not loaded yet') +
    '</div></div><span class="pos-role">' +
    runtimeValue('escapeHtml')(
      readOnly ? 'Read only' : runtimeValue('posRoleLabel')(),
    ) +
    '</span><button class="btn small secondary" data-act="refreshStocks"' +
    (runtimeValue('stockState').loading ||
    runtimeValue('stockState').refreshing
      ? ' disabled'
      : '') +
    '>Refresh</button></div>';
  if (
    runtimeValue('stockState').loading &&
    !runtimeValue('stockState').items.length
  ) {
    root.innerHTML =
      top +
      '<div class="card"><div class="pos-loading">Loading physical stock...</div></div>';
    return;
  }
  if (
    runtimeValue('stockState').error &&
    !runtimeValue('stockState').items.length
  ) {
    root.innerHTML =
      top +
      '<div class="card"><div class="note">' +
      runtimeValue('escapeHtml')(runtimeValue('stockState').error) +
      '</div><button class="btn secondary" data-act="refreshStocks" style="margin-top:10px">Retry Stocks</button></div>';
    return;
  }
  const reorderHelp = readOnly
    ? ''
    : ' Drag the grip beside an item to arrange rows; the order saves to the cloud. Clear search and filters before arranging.';
  const note =
    '<details class="stock-help"><summary>How editing works</summary><p>Type directly in a cell, then press Enter, Tab, or tap away to save; press Escape to undo.' +
    reorderHelp +
    ' Used, remaining, cost, value, and status are calculated automatically.</p></details>';
  const toolbar =
    '<div class="card">' +
    stockPeriodBarHtml(readOnly) +
    '<div class="stock-toolbar"><div><label class="fld" for="stockSearch">Search ingredients and mixtures</label><input id="stockSearch" type="search" value="' +
    runtimeValue('escapeHtml')(runtimeValue('stockState').search) +
    '" placeholder="Search name, category, supplier, or notes..." autocomplete="off"></div><div><label class="fld" for="stockKindFilter">Item type</label><select id="stockKindFilter"><option value="all"' +
    (runtimeValue('stockState').kind === 'all' ? ' selected' : '') +
    '>All types</option><option value="purchased"' +
    (runtimeValue('stockState').kind === 'purchased' ? ' selected' : '') +
    '>Purchased ingredients</option><option value="mixture"' +
    (runtimeValue('stockState').kind === 'mixture' ? ' selected' : '') +
    '>Prepared mixtures</option></select></div></div>' +
    readStocksBinding('stockFilterBarHtml', stockFilterBarHtml)() +
    '<div class="stock-list-meta"><div id="stockVisibleCount" class="search-status" role="status" aria-live="polite" aria-atomic="true">' +
    readStocksBinding('stockFilteredItems', stockFilteredItems)().length +
    ' of ' +
    runtimeValue('stockState').items.length +
    ' items</div>' +
    (readOnly
      ? ''
      : '<div id="stockReorderInstructions" class="stock-reorder-instructions">Drag the grip to arrange rows. Keyboard: Arrow Up or Down, Home, or End.</div>') +
    '<div id="stockOrderStatus" class="stock-order-status" role="status" aria-live="polite" aria-atomic="true"></div></div><div id="stockResults">' +
    readStocksBinding('stockItemCardsHtml', stockItemCardsHtml)() +
    '</div></div>';
  const connectionWarning = runtimeValue('stockState').error
    ? '<div class="note" style="margin-bottom:10px"><strong>Refresh incomplete.</strong> ' +
      runtimeValue('escapeHtml')(runtimeValue('stockState').error) +
      ' The last confirmed amounts remain visible.</div>'
    : '';
  const sourceWarning = runtimeValue('stockState').sourceConflict
    ? '<div class="note" style="margin-bottom:10px"><strong>Stock updates locked.</strong> ' +
      runtimeValue('escapeHtml')(runtimeValue('stockState').sourceConflict) +
      '</div>'
    : '';
  const recoveryWarning = readStocksBinding(
    'stockStoredPending',
    stockStoredPending,
  )()
    ? '<div class="note" style="margin-bottom:10px"><strong>Exact retry protected.</strong> Finish recovering the previous stock update before starting another one.</div>'
    : '';
  root.innerHTML =
    top +
    connectionWarning +
    sourceWarning +
    recoveryWarning +
    (runtimeValue('stockState').notice
      ? '<div class="note" style="margin-bottom:10px">' +
        runtimeValue('escapeHtml')(runtimeValue('stockState').notice) +
        '</div>'
      : '') +
    note +
    toolbar +
    readStocksBinding('stockHistoryHtml', stockHistoryHtml)();
  restoreStockInventoryScroll(scrollPosition);
}
