import { readStocksBinding, runtimeValue } from './bindings';
import {
  stockFilteredItems,
  stockFormatQuantity,
  stockSourceForItem,
  stockStatus,
  stockSummaryHtml,
} from './formatting';
import { stockStoredPending } from './storage';
import type { LegacyValue } from './types';

export function stockFilterBarHtml(): string {
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

export function stockItemCardsHtml(): string {
  const items = readStocksBinding(
    'stockFilteredItems',
    stockFilteredItems,
  )();
  if (!items.length) {
    return (
      '<div class="card"><p class="empty">' +
      (runtimeValue('stockState').items.length
        ? 'No stock items match these filters.'
        : 'No ingredients are tracked yet. Add named ingredients in Costing, then refresh Stocks.') +
      '</p></div>'
    );
  }
  const pendingRecovery = !!readStocksBinding(
    'stockStoredPending',
    stockStoredPending,
  )();
  const sourceConflict = !!runtimeValue('stockState').sourceConflict;
  return (
    '<div class="stock-inventory"><table class="stock-table"><caption class="stock-table-caption">Physical ingredient and prepared mixture inventory</caption><thead><tr>' +
    '<th scope="col" data-stock-field="item">Item</th><th scope="col" data-stock-field="status">Status</th><th scope="col" data-stock-field="on-hand">On hand</th><th scope="col" data-stock-field="threshold">Low-stock alert</th><th scope="col" data-stock-field="updated">Last updated</th><th scope="col" data-stock-field="action">Action</th>' +
    '</tr></thead><tbody>' +
    items
      .map(function (item: LegacyValue) {
        const status = readStocksBinding('stockStatus', stockStatus)(item);
        const source = readStocksBinding(
          'stockSourceForItem',
          stockSourceForItem,
        )(item);
        const threshold =
          item.threshold == null
            ? 'Disabled'
            : readStocksBinding(
                'stockFormatQuantity',
                stockFormatQuantity,
              )(item.threshold, item.baseUnit, false);
        const last = item.lastMovementAt
          ? new Date(item.lastMovementAt).toLocaleString('en-PH', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })
          : 'No count yet';
        const disabledReason = pendingRecovery
          ? 'Recover the pending stock update first'
          : 'Resolve the costing and stock identity conflict first';
        // `stock-card` is a selector-only compatibility alias for the protected
        // legacy browser baseline; the element remains one semantic table row.
        return (
          '<tr class="stock-row stock-card" data-stock-item="' +
          runtimeValue('escapeHtml')(item.id) +
          '"><th scope="row" class="stock-item-cell" data-stock-field="item" data-label="Item"><div class="stock-item-name">' +
          runtimeValue('escapeHtml')(item.name) +
          '</div><div class="stock-item-category">' +
          runtimeValue('escapeHtml')(item.categoryName) +
          '</div><div class="stock-badges"><span class="stock-badge ' +
          (item.kind === 'mixture' ? 'mixture' : '') +
          '">' +
          (item.kind === 'mixture' ? 'Prepared mixture' : 'Purchased') +
          '</span>' +
          (!source
            ? '<span class="stock-badge warn">Removed from costing</span>'
            : '') +
          '</div></th>' +
          '<td class="stock-status-cell" data-stock-field="status" data-label="Status"><span class="stock-badge ' +
          status.cls +
          '">' +
          runtimeValue('escapeHtml')(status.label) +
          '</span></td>' +
          '<td class="stock-on-hand-cell" data-stock-field="on-hand" data-label="On hand"><span class="stock-on-hand ' +
          (status.key === 'out' ? 'bad' : '') +
          '">' +
          (item.initialized
            ? readStocksBinding(
                'stockFormatQuantity',
                stockFormatQuantity,
              )(item.balance, item.baseUnit, false)
            : 'Not counted') +
          '</span></td>' +
          '<td class="stock-threshold-cell" data-stock-field="threshold" data-label="Low-stock alert">' +
          runtimeValue('escapeHtml')(threshold) +
          '</td>' +
          '<td class="stock-updated-cell" data-stock-field="updated" data-label="Last updated">' +
          runtimeValue('escapeHtml')(last) +
          '</td><td class="stock-action-cell" data-stock-field="action" data-label="Action">' +
          (runtimeValue('stockCanManage')()
            ? '<button class="btn small secondary stock-update-button" data-act="openStockModal" data-id="' +
              runtimeValue('escapeHtml')(item.id) +
              '"' +
              (pendingRecovery || sourceConflict
                ? ' disabled title="' +
                  runtimeValue('escapeHtml')(disabledReason) +
                  '"'
                : '') +
              '>Update stock</button>'
            : '<span class="stock-read-only">Read only</span>') +
          '</td></tr>'
        );
      })
      .join('') +
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
  if (type === 'stock_count') {
    return row && row.itemSequence === 1 ? 'Opening count' : 'Stock count';
  }
  return 'Stock update';
}

export function stockHistoryHtml(): string {
  if (!runtimeValue('stockCanManage')()) return '';
  if (!runtimeValue('stockState').transactions.length) {
    return '<div class="card"><h2>Movement history</h2><p class="empty">No stock movements yet. Your first physical count will appear here.</p></div>';
  }
  return (
    '<div class="card"><div class="row"><div><h2 style="margin:0">Movement history</h2><p class="hint">Latest 100 append-only records</p></div></div><div class="stock-history">' +
    runtimeValue('stockState')
      .transactions.map(function (row: LegacyValue) {
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
          (detail ? '<br>' + runtimeValue('escapeHtml')(detail) : '') +
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
      })
      .join('') +
    '</div></div>'
  );
}

export function renderStockResults(): void {
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
}

export function renderStocks(): void {
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
    '<div class="stock-head"><div style="flex:1"><h2>Stocks</h2><p class="hint">Physical ingredient amounts in grams, mL, or pieces — never ingredient prices.</p><div class="stock-sync">' +
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
  const note =
    '<div class="note stock-phase-note"><strong>Manual inventory — Phase 1.</strong> Enter a real opening count before using an item. POS sales do not subtract stock yet. Prepared mixtures cannot use Add stock until batch production is built. Packaging stock comes later.</div>';
  const toolbar =
    '<div class="card">' +
    readStocksBinding('stockSummaryHtml', stockSummaryHtml)() +
    '<div class="stock-toolbar"><div><label class="fld" for="stockSearch">Search ingredients and mixtures</label><input id="stockSearch" type="search" value="' +
    runtimeValue('escapeHtml')(runtimeValue('stockState').search) +
    '" placeholder="Search by name or category..." autocomplete="off"></div><div><label class="fld" for="stockKindFilter">Item type</label><select id="stockKindFilter"><option value="all"' +
    (runtimeValue('stockState').kind === 'all' ? ' selected' : '') +
    '>All types</option><option value="purchased"' +
    (runtimeValue('stockState').kind === 'purchased' ? ' selected' : '') +
    '>Purchased ingredients</option><option value="mixture"' +
    (runtimeValue('stockState').kind === 'mixture' ? ' selected' : '') +
    '>Prepared mixtures</option></select></div></div>' +
    readStocksBinding('stockFilterBarHtml', stockFilterBarHtml)() +
    '<div id="stockVisibleCount" class="search-status" role="status" aria-live="polite" aria-atomic="true">' +
    readStocksBinding('stockFilteredItems', stockFilteredItems)().length +
    ' of ' +
    runtimeValue('stockState').items.length +
    ' items</div><div id="stockResults">' +
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
}
