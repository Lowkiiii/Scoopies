import { runtimeValue } from './bindings';
import { stockFilteredItems } from './formatting';
import { stockInlineLocked } from './inline-edit';
import { stockStoredPending } from './storage';
import type { LegacyValue } from './types';

type StockDragSession = {
  pointerId: number;
  itemId: string;
  orderId: string;
  itemName: string;
  startX: number;
  startY: number;
  moved: boolean;
  targetOrderId: string;
  after: boolean;
  handle: HTMLElement;
};

let dragSession: StockDragSession | null = null;

function stockDocument(): Document {
  return runtimeValue<Document>('document') || document;
}

function stockWindow(): Window {
  return runtimeValue<Window>('window') || window;
}

export function stockReorderFiltersClear(): boolean {
  const stockState = runtimeValue<LegacyValue>('stockState') || {};
  return (
    !String(stockState.search || '').trim() &&
    String(stockState.status || 'all') === 'all' &&
    String(stockState.kind || 'all') === 'all'
  );
}

export function stockReorderReason(includeActiveEditing = true): string {
  const canManage = runtimeValue<LegacyValue>('stockCanManage');
  if (typeof canManage !== 'function' || !canManage()) {
    return 'Only an owner or manager can arrange stock rows';
  }
  if (!stockReorderFiltersClear()) {
    return 'Clear the search and filters before arranging rows';
  }
  const active = stockDocument().activeElement as HTMLElement | null;
  if (
    includeActiveEditing &&
    active &&
    active.matches &&
    active.matches('[data-stock-cell-field],[data-stock-inline-field]')
  ) {
    return 'Finish the current cell edit before arranging rows';
  }
  const stockState = runtimeValue<LegacyValue>('stockState') || {};
  if (includeActiveEditing && stockState.inlineMutationChain) {
    return 'Wait for the current stock value to finish saving';
  }
  if (stockState.loading || stockState.refreshing) {
    return 'Wait for the stock list to finish refreshing';
  }
  if (stockState.sourceConflict) {
    return 'Resolve the costing and stock identity conflict first';
  }
  if (stockStoredPending()) {
    return 'Recover the pending stock update first';
  }
  const sourceDeletes = runtimeValue<LegacyValue>('stockScopedSourceDeletes');
  if (typeof sourceDeletes === 'function' && sourceDeletes().length) {
    return 'Refresh Stocks to finish the pending source recovery first';
  }
  if (stockInlineLocked()) {
    return 'Wait for the current stock value to finish saving';
  }
  return '';
}

export function stockCanReorderRows(): boolean {
  return !stockReorderReason();
}

export function stockMoveOrder(
  order: string[],
  itemId: string,
  targetId: string,
  after: boolean,
): string[] {
  const next = order.filter(function (id) { return id !== itemId; });
  const targetIndex = next.indexOf(targetId);
  if (targetIndex < 0 || itemId === targetId) return order.slice();
  next.splice(targetIndex + (after ? 1 : 0), 0, itemId);
  return next;
}

function stockOrderId(item: LegacyValue): string {
  if (!item) return '';
  const sourceId = String(item.sourceId || item.id || '');
  return item.sourceType === 'packaging' && sourceId
    ? 'packaging:' + sourceId
    : sourceId;
}

function stockVisibleOrder(): string[] {
  return stockFilteredItems().map(function (item: LegacyValue) {
    return stockOrderId(item);
  }).filter(Boolean);
}

function sameOrder(first: string[], second: string[]): boolean {
  return first.length === second.length && first.every(function (id, index) {
    return id === second[index];
  });
}

function escapeAttribute(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function announceStockOrder(message: string, focusId?: string): void {
  const setTimeoutValue = runtimeValue<LegacyValue>('setTimeout') || setTimeout;
  setTimeoutValue(function () {
    const documentValue = stockDocument();
    const status = documentValue.getElementById('stockOrderStatus');
    if (status) status.textContent = message;
    if (focusId) {
      const handle = documentValue.querySelector(
        '[data-stock-drag-handle][data-id="' +
          escapeAttribute(focusId) +
          '"]',
      ) as HTMLElement | null;
      if (handle) handle.focus();
    }
  }, 0);
}

export function stockCommitOrder(
  nextOrder: string[],
  itemName: string,
  focusId?: string,
): boolean {
  if (!stockCanReorderRows()) return false;
  const currentOrder = stockVisibleOrder();
  const validIds = new Set(currentOrder);
  const seen = new Set<string>();
  const normalized = nextOrder.filter(function (id) {
    if (!validIds.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  currentOrder.forEach(function (id) {
    if (!seen.has(id)) normalized.push(id);
  });
  if (sameOrder(currentOrder, normalized)) return false;

  runtimeValue<LegacyValue>('state').stockOrder = normalized;
  const save = runtimeValue<LegacyValue>('save');
  if (typeof save === 'function') save();
  const renderStocks = runtimeValue<LegacyValue>('renderStocks');
  if (typeof renderStocks === 'function') renderStocks();
  const focusedItem = focusId
    ? (runtimeValue<LegacyValue>('stockState').items || []).find(
        function (item: LegacyValue) {
          return String(item.id || '') === focusId;
        },
      )
    : null;
  const focusedOrderId = String(
    stockOrderId(focusedItem),
  );
  const position = normalized.indexOf(focusedOrderId);
  announceStockOrder(
    itemName +
      (position >= 0
        ? ' moved to position ' + (position + 1) + ' of ' + normalized.length +
          '. '
        : ' moved. ') +
      'The row order is saving to the cloud.',
    focusId,
  );
  return true;
}

function clearDropIndicators(): void {
  stockDocument()
    .querySelectorAll('.stock-row-drop-before,.stock-row-drop-after')
    .forEach(function (row) {
      row.classList.remove('stock-row-drop-before', 'stock-row-drop-after');
    });
}

function finishDragVisuals(session: StockDragSession): void {
  clearDropIndicators();
  const documentValue = stockDocument();
  documentValue.body.classList.remove('stock-row-reordering');
  const row = documentValue.querySelector(
    '.stock-row[data-stock-item="' + escapeAttribute(session.itemId) + '"]',
  );
  if (row) row.classList.remove('stock-row-dragging');
}

export function beginStockRowDrag(event: LegacyValue): boolean {
  const target = event && event.target as HTMLElement | null;
  const handle = target && target.closest
    ? target.closest('[data-stock-drag-handle]') as HTMLElement | null
    : null;
  if (!handle || handle.hasAttribute('disabled')) return false;
  if (event.isPrimary === false || (event.button != null && event.button !== 0)) {
    return false;
  }
  if (!stockCanReorderRows()) return true;
  const itemId = String(handle.dataset.id || '');
  if (!itemId) return true;
  const item = (runtimeValue<LegacyValue>('stockState').items || []).find(
    function (candidate: LegacyValue) {
      return String(candidate.id || '') === itemId;
    },
  );
  dragSession = {
    pointerId: Number(event.pointerId || 0),
    itemId,
    orderId: stockOrderId(item) || itemId,
    itemName: String(item && item.name || 'Stock item'),
    startX: Number(event.clientX || 0),
    startY: Number(event.clientY || 0),
    moved: false,
    targetOrderId: '',
    after: false,
    handle,
  };
  if (handle.setPointerCapture && event.pointerId != null) {
    try { handle.setPointerCapture(event.pointerId); } catch (_error) {}
  }
  return true;
}

export function moveStockRowDrag(event: LegacyValue): boolean {
  const session = dragSession;
  if (!session || Number(event.pointerId || 0) !== session.pointerId) {
    return false;
  }
  const deltaX = Number(event.clientX || 0) - session.startX;
  const deltaY = Number(event.clientY || 0) - session.startY;
  if (!session.moved && Math.hypot(deltaX, deltaY) < 5) return true;
  if (!session.moved) {
    session.moved = true;
    const documentValue = stockDocument();
    documentValue.body.classList.add('stock-row-reordering');
    const draggedRow = documentValue.querySelector(
      '.stock-row[data-stock-item="' + escapeAttribute(session.itemId) + '"]',
    );
    if (draggedRow) draggedRow.classList.add('stock-row-dragging');
  }
  if (event.preventDefault) event.preventDefault();

  const documentValue = stockDocument();
  const hit = documentValue.elementFromPoint(
    Number(event.clientX || 0),
    Number(event.clientY || 0),
  ) as HTMLElement | null;
  const row = hit && hit.closest
    ? hit.closest('.stock-row[data-stock-item]') as HTMLElement | null
    : null;
  clearDropIndicators();
  if (row && String(row.dataset.stockItem || '') !== session.itemId) {
    const box = row.getBoundingClientRect();
    session.targetOrderId = String(
      row.dataset.stockOrderId || row.dataset.stockItem || '',
    );
    session.after = Number(event.clientY || 0) > box.top + box.height / 2;
    row.classList.add(
      session.after ? 'stock-row-drop-after' : 'stock-row-drop-before',
    );
  } else {
    session.targetOrderId = '';
  }

  const windowValue = stockWindow();
  const edge = 56;
  const clientY = Number(event.clientY || 0);
  if (clientY < edge) windowValue.scrollBy(0, -10);
  else if (clientY > windowValue.innerHeight - edge) windowValue.scrollBy(0, 10);
  return true;
}

export function endStockRowDrag(event: LegacyValue): boolean {
  const session = dragSession;
  if (!session || Number(event.pointerId || 0) !== session.pointerId) {
    return false;
  }
  dragSession = null;
  finishDragVisuals(session);
  if (event.preventDefault && session.moved) event.preventDefault();
  if (
    event.type === 'pointerup' &&
    session.moved &&
    session.targetOrderId
  ) {
    const consumePending = runtimeValue<LegacyValue>(
      'consumePendingRemoteForCommit',
    );
    if (typeof consumePending === 'function') consumePending(false);
    const next = stockMoveOrder(
      stockVisibleOrder(),
      session.orderId,
      session.targetOrderId,
      session.after,
    );
    stockCommitOrder(next, session.itemName, session.itemId);
  } else {
    const applyPending = runtimeValue<LegacyValue>('applyPendingAfterModal');
    if (typeof applyPending === 'function') applyPending();
  }
  return true;
}

export function handleStockRowReorderKeydown(event: LegacyValue): boolean {
  const target = event && event.target as HTMLElement | null;
  const handle = target && target.closest
    ? target.closest('[data-stock-drag-handle]') as HTMLElement | null
    : null;
  if (!handle) return false;
  const keys = ['ArrowUp', 'ArrowDown', 'Home', 'End'];
  if (keys.indexOf(String(event.key)) < 0) return false;
  event.preventDefault();
  if (!stockCanReorderRows()) return true;

  const itemId = String(handle.dataset.id || '');
  const orderId = String(handle.dataset.stockOrderId || itemId);
  const consumePending = runtimeValue<LegacyValue>(
    'consumePendingRemoteForCommit',
  );
  if (typeof consumePending === 'function') consumePending(false);
  const order = stockVisibleOrder();
  const index = order.indexOf(orderId);
  if (index < 0) return true;
  let nextIndex = index;
  if (event.key === 'ArrowUp') nextIndex = Math.max(0, index - 1);
  if (event.key === 'ArrowDown') nextIndex = Math.min(order.length - 1, index + 1);
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = order.length - 1;
  if (nextIndex === index) {
    announceStockOrder(
      'The row is already at the ' + (index === 0 ? 'top.' : 'bottom.'),
      itemId,
    );
    return true;
  }
  const next = order.slice();
  next.splice(index, 1);
  next.splice(nextIndex, 0, orderId);
  const item = (runtimeValue<LegacyValue>('stockState').items || []).find(
    function (candidate: LegacyValue) {
      return String(candidate.id || '') === itemId;
    },
  );
  stockCommitOrder(next, String(item && item.name || 'Stock item'), itemId);
  return true;
}
