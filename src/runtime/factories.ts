export interface PosOpsModalState {
  open: boolean;
  type: string;
  submitting: boolean;
  error: string;
  notice: string;
  step: string;
  mode: string;
  openingCash: string;
  countedCash: string;
  verifiedGcash: string;
  verifiedGotyme: string;
  notes: string;
  sale: unknown | null;
  reason: string;
  result: unknown | null;
  uncertain: boolean;
  rpcArgs: unknown | null;
  cartAction: string;
  cartProductId: string;
  cartProductName: string;
  cartQuantity: number;
  productId: string;
  selectedMatchaOptionId: string;
  mediaRows: unknown[];
  mediaLoading: boolean;
  mediaLoaded: boolean;
  mediaProductId: string;
  mediaRemoveProductId: string;
  mediaEditor: unknown | null;
}

export interface PosSalesHistoryState {
  rows: unknown[];
  summary: unknown | null;
  mode: string;
  view: string;
  loading: boolean;
  loaded: boolean;
  error: string;
  summaryError: string;
  hasMore: boolean;
  cursorCompletedAt: string | null;
  cursorSaleId: string | null;
  tallyRows: unknown[];
  tallyLoading: boolean;
  tallyLoaded: boolean;
  tallyError: string;
  filterDateInput: string;
  filterDate: string;
  filterShiftId: string;
  selectedShiftRow: unknown | null;
  shiftRows: unknown[];
  shiftLoading: boolean;
  shiftLoaded: boolean;
  shiftError: string;
  shiftHasMore: boolean;
  shiftCursorClosedAt: string | null;
  shiftCursorShiftId: string | null;
}

export interface StockState {
  loaded: boolean;
  loading: boolean;
  refreshing: boolean;
  error: string;
  notice: string;
  sourceConflict: string;
  items: unknown[];
  transactions: unknown[];
  search: string;
  status: string;
  kind: string;
  lastUpdatedAt: number;
}

export interface StockModalState {
  open: boolean;
  itemId: string;
  action: string;
  quantity: string;
  unit: string;
  reason: string;
  note: string;
  submitting: boolean;
  error: string;
  notice: string;
  uncertain: boolean;
  pendingRpc: unknown | null;
}

export function freshPosOpsModal(): PosOpsModalState {
  return {
    open: false,
    type: '',
    submitting: false,
    error: '',
    notice: '',
    step: 'edit',
    mode: 'live',
    openingCash: '0.00',
    countedCash: '',
    verifiedGcash: '',
    verifiedGotyme: '',
    notes: '',
    sale: null,
    reason: '',
    result: null,
    uncertain: false,
    rpcArgs: null,
    cartAction: '',
    cartProductId: '',
    cartProductName: '',
    cartQuantity: 0,
    productId: '',
    selectedMatchaOptionId: '',
    mediaRows: [],
    mediaLoading: false,
    mediaLoaded: false,
    mediaProductId: '',
    mediaRemoveProductId: '',
    mediaEditor: null,
  };
}

export function freshPosSalesHistory(): PosSalesHistoryState {
  return {
    rows: [],
    summary: null,
    mode: 'live',
    view: 'receipts',
    loading: false,
    loaded: false,
    error: '',
    summaryError: '',
    hasMore: true,
    cursorCompletedAt: null,
    cursorSaleId: null,
    tallyRows: [],
    tallyLoading: false,
    tallyLoaded: false,
    tallyError: '',
    filterDateInput: '',
    filterDate: '',
    filterShiftId: '',
    selectedShiftRow: null,
    shiftRows: [],
    shiftLoading: false,
    shiftLoaded: false,
    shiftError: '',
    shiftHasMore: true,
    shiftCursorClosedAt: null,
    shiftCursorShiftId: null,
  };
}

export function freshStockState(): StockState {
  return {
    loaded: false,
    loading: false,
    refreshing: false,
    error: '',
    notice: '',
    sourceConflict: '',
    items: [],
    transactions: [],
    search: '',
    status: 'all',
    kind: 'all',
    lastUpdatedAt: 0,
  };
}

export function freshStockModal(): StockModalState {
  return {
    open: false,
    itemId: '',
    action: '',
    quantity: '',
    unit: '',
    reason: '',
    note: '',
    submitting: false,
    error: '',
    notice: '',
    uncertain: false,
    pendingRpc: null,
  };
}
