import {
  incrementRuntimeBinding,
  posFunction,
  runtimeFunction,
  runtimeValue,
  writeRuntimeBinding,
  type LegacyValue,
} from '../bindings';

export async function openPosSalesHistory(): Promise<boolean> {
  if (
    !runtimeValue<LegacyValue>('cloud').client ||
    !runtimeValue<LegacyValue>('session') ||
    !runtimeValue<LegacyValue>('session').user ||
    !runtimeValue<LegacyValue>('posContext').businessId ||
    runtimeValue<LegacyValue>('posOpsModal').submitting
  ) {
    return false;
  }
  incrementRuntimeBinding('posHistoryGeneration');
  writeRuntimeBinding(
    'posSalesHistory',
    runtimeFunction('freshPosSalesHistory')(),
  );
  runtimeValue<LegacyValue>('posSalesHistory').mode =
    runtimeValue<LegacyValue>('posCheckout').reportMode === 'training'
      ? 'training'
      : 'live';
  posFunction('posOpenOpsModal')('salesHistory');
  runtimeFunction('focusSoon')('#posOpsModalTitle');
  return posFunction('loadPosSalesHistoryPage')(false);
}

export async function reloadPosSalesHistory(): Promise<boolean> {
  if (
    !runtimeValue<LegacyValue>('posOpsModal').open ||
    runtimeValue<LegacyValue>('posOpsModal').type !== 'salesHistory' ||
    posFunction('posSalesHistoryBusy')()
  ) {
    return false;
  }
  if (runtimeValue<LegacyValue>('posSalesHistory').view === 'tally') {
    return posFunction('loadPosSalesProductTally')();
  }
  if (runtimeValue<LegacyValue>('posSalesHistory').view === 'shifts') {
    return posFunction('loadPosClosedShiftsPage')(false);
  }
  return posFunction('loadPosSalesHistoryPage')(false);
}

export async function setPosSalesHistoryMode(
  mode: LegacyValue,
): Promise<boolean> {
  if (
    ['live', 'training'].indexOf(mode) < 0 ||
    !posFunction('posCanManageOperations')() ||
    posFunction('posSalesHistoryBusy')() ||
    !runtimeValue<LegacyValue>('posOpsModal').open ||
    runtimeValue<LegacyValue>('posOpsModal').type !== 'salesHistory'
  ) {
    return false;
  }
  const view = ['receipts', 'tally', 'shifts'].indexOf(
      runtimeValue<LegacyValue>('posSalesHistory').view,
    ) >= 0
    ? runtimeValue<LegacyValue>('posSalesHistory').view
    : 'receipts';
  if (
    runtimeValue<LegacyValue>('posSalesHistory').mode === mode &&
    (
      (
        view === 'tally' &&
        runtimeValue<LegacyValue>('posSalesHistory').tallyLoaded
      ) ||
      (
        view === 'shifts' &&
        runtimeValue<LegacyValue>('posSalesHistory').shiftLoaded
      ) ||
      (
        view === 'receipts' &&
        runtimeValue<LegacyValue>('posSalesHistory').loaded
      )
    )
  ) {
    return true;
  }
  const filterDate = runtimeValue<LegacyValue>('posSalesHistory').filterDate;
  const filterDateInput =
    runtimeValue<LegacyValue>('posSalesHistory').filterDateInput;
  incrementRuntimeBinding('posHistoryGeneration');
  writeRuntimeBinding(
    'posSalesHistory',
    runtimeFunction('freshPosSalesHistory')(),
  );
  runtimeValue<LegacyValue>('posSalesHistory').mode = mode;
  runtimeValue<LegacyValue>('posSalesHistory').view = view;
  runtimeValue<LegacyValue>('posSalesHistory').filterDate = filterDate;
  runtimeValue<LegacyValue>('posSalesHistory').filterDateInput =
    filterDateInput;
  posFunction('renderPosOpsModal')();
  if (view === 'tally') return posFunction('loadPosSalesProductTally')();
  if (view === 'shifts') {
    return posFunction('loadPosClosedShiftsPage')(false);
  }
  return posFunction('loadPosSalesHistoryPage')(false);
}

export async function setPosSalesHistoryView(
  view: LegacyValue,
): Promise<boolean> {
  if (
    ['receipts', 'tally', 'shifts'].indexOf(view) < 0 ||
    (view === 'shifts' && !posFunction('posCanManageOperations')()) ||
    !runtimeValue<LegacyValue>('posOpsModal').open ||
    runtimeValue<LegacyValue>('posOpsModal').type !== 'salesHistory' ||
    posFunction('posSalesHistoryBusy')()
  ) {
    return false;
  }
  if (
    view === 'shifts' &&
    runtimeValue<LegacyValue>('posSalesHistory').filterShiftId
  ) {
    runtimeValue<LegacyValue>('posSalesHistory').filterShiftId = '';
    runtimeValue<LegacyValue>('posSalesHistory').selectedShiftRow = null;
    runtimeValue<LegacyValue>('posSalesHistory').tallyRows = [];
    runtimeValue<LegacyValue>('posSalesHistory').tallyLoaded = false;
    runtimeValue<LegacyValue>('posSalesHistory').tallyError = '';
    runtimeValue<LegacyValue>('posSalesHistory').shiftRows = [];
    runtimeValue<LegacyValue>('posSalesHistory').shiftLoaded = false;
    runtimeValue<LegacyValue>('posSalesHistory').shiftError = '';
    runtimeValue<LegacyValue>('posSalesHistory').shiftHasMore = true;
    runtimeValue<LegacyValue>('posSalesHistory').shiftCursorClosedAt = null;
    runtimeValue<LegacyValue>('posSalesHistory').shiftCursorShiftId = null;
  }
  runtimeValue<LegacyValue>('posSalesHistory').view = view;
  posFunction('renderPosHistoryPreservingScroll')(view);
  if (
    view === 'tally' &&
    !runtimeValue<LegacyValue>('posSalesHistory').tallyLoaded
  ) {
    return posFunction('loadPosSalesProductTally')();
  }
  if (
    view === 'shifts' &&
    !runtimeValue<LegacyValue>('posSalesHistory').shiftLoaded
  ) {
    return posFunction('loadPosClosedShiftsPage')(false);
  }
  if (
    view === 'receipts' &&
    !runtimeValue<LegacyValue>('posSalesHistory').loaded
  ) {
    return posFunction('loadPosSalesHistoryPage')(false);
  }
  return true;
}

export function validPosBusinessDate(value: LegacyValue): boolean {
  const text = runtimeFunction('String')(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parts = text.split('-').map(runtimeFunction('Number'));
  const date = new (runtimeValue<LegacyValue>('Date'))(
    runtimeValue<LegacyValue>('Date').UTC(
      parts[0],
      parts[1] - 1,
      parts[2],
    ),
  );
  return date.getUTCFullYear() === parts[0] &&
    date.getUTCMonth() === parts[1] - 1 &&
    date.getUTCDate() === parts[2];
}

export async function applyPosHistoryDateFilter(): Promise<boolean> {
  if (
    !runtimeValue<LegacyValue>('posOpsModal').open ||
    runtimeValue<LegacyValue>('posOpsModal').type !== 'salesHistory' ||
    posFunction('posSalesHistoryBusy')() ||
    runtimeValue<LegacyValue>('posSalesHistory').view === 'receipts'
  ) {
    return false;
  }
  const date = runtimeFunction('String')(
    runtimeValue<LegacyValue>('posSalesHistory').filterDateInput || '',
  ).trim();
  if (date && !posFunction('validPosBusinessDate')(date)) {
    if (runtimeValue<LegacyValue>('posSalesHistory').view === 'tally') {
      runtimeValue<LegacyValue>('posSalesHistory').tallyError =
        'Choose a valid business date.';
    } else {
      runtimeValue<LegacyValue>('posSalesHistory').shiftError =
        'Choose a valid business date.';
    }
    posFunction('renderPosHistoryPreservingScroll')();
    return false;
  }
  incrementRuntimeBinding('posHistoryGeneration');
  runtimeValue<LegacyValue>('posSalesHistory').filterDate = date;
  runtimeValue<LegacyValue>('posSalesHistory').filterShiftId = '';
  runtimeValue<LegacyValue>('posSalesHistory').selectedShiftRow = null;
  runtimeValue<LegacyValue>('posSalesHistory').tallyRows = [];
  runtimeValue<LegacyValue>('posSalesHistory').tallyLoaded = false;
  runtimeValue<LegacyValue>('posSalesHistory').tallyError = '';
  runtimeValue<LegacyValue>('posSalesHistory').shiftRows = [];
  runtimeValue<LegacyValue>('posSalesHistory').shiftLoaded = false;
  runtimeValue<LegacyValue>('posSalesHistory').shiftError = '';
  runtimeValue<LegacyValue>('posSalesHistory').shiftHasMore = true;
  runtimeValue<LegacyValue>('posSalesHistory').shiftCursorClosedAt = null;
  runtimeValue<LegacyValue>('posSalesHistory').shiftCursorShiftId = null;
  posFunction('renderPosHistoryPreservingScroll')();
  return runtimeValue<LegacyValue>('posSalesHistory').view === 'tally'
    ? posFunction('loadPosSalesProductTally')()
    : posFunction('loadPosClosedShiftsPage')(false);
}

export async function clearPosHistoryDateFilter(): Promise<boolean> {
  if (posFunction('posSalesHistoryBusy')()) return false;
  runtimeValue<LegacyValue>('posSalesHistory').filterDateInput = '';
  return posFunction('applyPosHistoryDateFilter')();
}

export async function setPosHistoryShiftFilter(
  shiftId: LegacyValue,
): Promise<boolean> {
  if (
    !posFunction('posCanManageOperations')() ||
    !runtimeValue<LegacyValue>('posOpsModal').open ||
    runtimeValue<LegacyValue>('posOpsModal').type !== 'salesHistory' ||
    runtimeValue<LegacyValue>('posSalesHistory').view !== 'tally' ||
    posFunction('posSalesHistoryBusy')()
  ) {
    return false;
  }
  const value = runtimeFunction('String')(shiftId || '');
  const selectedRow = value
    ? runtimeValue<LegacyValue>('posSalesHistory').shiftRows.find(
      function (row: LegacyValue) {
        return runtimeFunction('String')(row.shift_id || '') === value;
      },
    )
    : null;
  if (value && !selectedRow) return false;
  if (
    runtimeValue<LegacyValue>('posSalesHistory').filterShiftId === value &&
    runtimeValue<LegacyValue>('posSalesHistory').tallyLoaded
  ) {
    return true;
  }
  const previousShift =
    runtimeValue<LegacyValue>('posSalesHistory').filterShiftId;
  incrementRuntimeBinding('posHistoryGeneration');
  runtimeValue<LegacyValue>('posSalesHistory').filterShiftId = value;
  if (value) {
    runtimeValue<LegacyValue>('posSalesHistory').selectedShiftRow = selectedRow;
    runtimeValue<LegacyValue>('posSalesHistory').filterDate = '';
    runtimeValue<LegacyValue>('posSalesHistory').filterDateInput = '';
    runtimeValue<LegacyValue>('posSalesHistory').shiftRows = [];
    runtimeValue<LegacyValue>('posSalesHistory').shiftLoaded = false;
    runtimeValue<LegacyValue>('posSalesHistory').shiftError = '';
    runtimeValue<LegacyValue>('posSalesHistory').shiftHasMore = true;
    runtimeValue<LegacyValue>('posSalesHistory').shiftCursorClosedAt = null;
    runtimeValue<LegacyValue>('posSalesHistory').shiftCursorShiftId = null;
  } else if (previousShift) {
    runtimeValue<LegacyValue>('posSalesHistory').selectedShiftRow = null;
    runtimeValue<LegacyValue>('posSalesHistory').shiftRows = [];
    runtimeValue<LegacyValue>('posSalesHistory').shiftLoaded = false;
    runtimeValue<LegacyValue>('posSalesHistory').shiftError = '';
    runtimeValue<LegacyValue>('posSalesHistory').shiftHasMore = true;
    runtimeValue<LegacyValue>('posSalesHistory').shiftCursorClosedAt = null;
    runtimeValue<LegacyValue>('posSalesHistory').shiftCursorShiftId = null;
  }
  runtimeValue<LegacyValue>('posSalesHistory').tallyRows = [];
  runtimeValue<LegacyValue>('posSalesHistory').tallyLoaded = false;
  runtimeValue<LegacyValue>('posSalesHistory').tallyError = '';
  posFunction('renderPosHistoryPreservingScroll')();
  return posFunction('loadPosSalesProductTally')();
}

export async function viewPosShiftTally(
  shiftId: LegacyValue,
): Promise<boolean> {
  if (
    !posFunction('posCanManageOperations')() ||
    !runtimeValue<LegacyValue>('posOpsModal').open ||
    runtimeValue<LegacyValue>('posOpsModal').type !== 'salesHistory' ||
    runtimeValue<LegacyValue>('posSalesHistory').view !== 'shifts' ||
    posFunction('posSalesHistoryBusy')()
  ) {
    return false;
  }
  const value = runtimeFunction('String')(shiftId || '');
  const row = runtimeValue<LegacyValue>('posSalesHistory').shiftRows.find(
    function (item: LegacyValue) {
      return runtimeFunction('String')(item.shift_id || '') === value;
    },
  );
  if (!row) return false;
  incrementRuntimeBinding('posHistoryGeneration');
  runtimeValue<LegacyValue>('posSalesHistory').view = 'tally';
  runtimeValue<LegacyValue>('posSalesHistory').filterShiftId = value;
  runtimeValue<LegacyValue>('posSalesHistory').selectedShiftRow = row;
  runtimeValue<LegacyValue>('posSalesHistory').filterDate = '';
  runtimeValue<LegacyValue>('posSalesHistory').filterDateInput = '';
  runtimeValue<LegacyValue>('posSalesHistory').tallyRows = [];
  runtimeValue<LegacyValue>('posSalesHistory').tallyLoaded = false;
  runtimeValue<LegacyValue>('posSalesHistory').tallyError = '';
  runtimeValue<LegacyValue>('posSalesHistory').shiftRows = [];
  runtimeValue<LegacyValue>('posSalesHistory').shiftLoaded = false;
  runtimeValue<LegacyValue>('posSalesHistory').shiftError = '';
  runtimeValue<LegacyValue>('posSalesHistory').shiftHasMore = true;
  runtimeValue<LegacyValue>('posSalesHistory').shiftCursorClosedAt = null;
  runtimeValue<LegacyValue>('posSalesHistory').shiftCursorShiftId = null;
  posFunction('renderPosHistoryPreservingScroll')('tally');
  return posFunction('loadPosSalesProductTally')();
}

export function requestPosHistoryRpc(
  name: LegacyValue,
  args: LegacyValue,
): Promise<LegacyValue> {
  try {
    return runtimeValue<LegacyValue>('Promise').resolve(
      runtimeValue<LegacyValue>('cloud').client.rpc(name, args),
    ).then(function (result: LegacyValue) {
      return { rows: runtimeFunction('rpcRows')(result), error: null };
    }).catch(function (error: LegacyValue) {
      return { rows: [], error: error };
    });
  } catch (error) {
    return runtimeValue<LegacyValue>('Promise').resolve({
      rows: [],
      error: error,
    });
  }
}

export function applyPosClosedShiftRows(
  rows: LegacyValue,
  loadOlder: LegacyValue,
): boolean {
  const page = (rows || []).slice(
    0,
    runtimeValue<LegacyValue>('POS_SHIFT_HISTORY_PAGE_SIZE'),
  );
  const last = page[page.length - 1] || null;
  if (last && (!last.closed_at || !last.shift_id)) return false;
  if (!loadOlder) runtimeValue<LegacyValue>('posSalesHistory').shiftRows = [];
  const seen: LegacyValue = {};
  runtimeValue<LegacyValue>('posSalesHistory').shiftRows.forEach(
    function (row: LegacyValue) {
      seen[runtimeFunction('String')(row.shift_id || '')] = true;
    },
  );
  page.forEach(function (row: LegacyValue) {
    const key = runtimeFunction('String')(row.shift_id || '');
    if (key && !seen[key]) {
      seen[key] = true;
      runtimeValue<LegacyValue>('posSalesHistory').shiftRows.push(row);
    }
  });
  runtimeValue<LegacyValue>('posSalesHistory').shiftHasMore = page.some(
    function (row: LegacyValue) {
      return row.has_more === true;
    },
  );
  runtimeValue<LegacyValue>('posSalesHistory').shiftCursorClosedAt = last
    ? last.closed_at
    : runtimeValue<LegacyValue>('posSalesHistory').shiftCursorClosedAt;
  runtimeValue<LegacyValue>('posSalesHistory').shiftCursorShiftId = last
    ? last.shift_id
    : runtimeValue<LegacyValue>('posSalesHistory').shiftCursorShiftId;
  if (
    runtimeValue<LegacyValue>('posSalesHistory').selectedShiftRow &&
    !runtimeValue<LegacyValue>('posSalesHistory').shiftRows.some(
      function (row: LegacyValue) {
        return runtimeFunction('String')(row.shift_id || '') ===
          runtimeFunction('String')(
            runtimeValue<LegacyValue>('posSalesHistory').selectedShiftRow
              .shift_id || '',
          );
      },
    )
  ) {
    runtimeValue<LegacyValue>('posSalesHistory').shiftRows.unshift(
      runtimeValue<LegacyValue>('posSalesHistory').selectedShiftRow,
    );
  }
  runtimeValue<LegacyValue>('posSalesHistory').shiftLoaded = true;
  return true;
}

export async function loadPosSalesProductTally(): Promise<boolean> {
  if (
    !runtimeValue<LegacyValue>('cloud').client ||
    !runtimeValue<LegacyValue>('session') ||
    !runtimeValue<LegacyValue>('session').user ||
    !runtimeValue<LegacyValue>('posContext').businessId ||
    !runtimeValue<LegacyValue>('posOpsModal').open ||
    runtimeValue<LegacyValue>('posOpsModal').type !== 'salesHistory' ||
    runtimeValue<LegacyValue>('posSalesHistory').view !== 'tally' ||
    posFunction('posSalesHistoryBusy')()
  ) {
    return false;
  }
  const generation = incrementRuntimeBinding('posHistoryGeneration');
  const userId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('session').user.id || '',
  );
  const businessId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('posContext').businessId || '',
  );
  const mode = runtimeValue<LegacyValue>('posSalesHistory').mode;
  const selectedShift =
    runtimeValue<LegacyValue>('posSalesHistory').filterShiftId || null;
  const date = selectedShift
    ? null
    : runtimeValue<LegacyValue>('posSalesHistory').filterDate || null;
  const needsShifts = posFunction('posCanManageOperations')() &&
    (
      !runtimeValue<LegacyValue>('posSalesHistory').shiftLoaded ||
      !!runtimeValue<LegacyValue>('posSalesHistory').shiftError
    );
  runtimeValue<LegacyValue>('posSalesHistory').tallyLoading = true;
  runtimeValue<LegacyValue>('posSalesHistory').tallyError = '';
  if (needsShifts) {
    runtimeValue<LegacyValue>('posSalesHistory').shiftLoading = true;
    runtimeValue<LegacyValue>('posSalesHistory').shiftError = '';
  }
  posFunction('renderPosHistoryPreservingScroll')();
  const tallyArgs = {
    p_business_id: businessId,
    p_is_training: mode === 'training',
    p_date_from: date,
    p_date_to: date,
    p_shift_id: selectedShift,
  };
  const requests = [
    posFunction('requestPosHistoryRpc')(
      'pos_get_sales_product_tally_v2',
      tallyArgs,
    ),
  ];
  if (needsShifts) {
    requests.push(posFunction('requestPosHistoryRpc')(
      'pos_get_closed_shifts_page',
      {
        p_business_id: businessId,
        p_is_training: mode === 'training',
        p_date_from: date,
        p_date_to: date,
        p_before_closed_at: null,
        p_before_shift_id: null,
        p_limit: runtimeValue<LegacyValue>('POS_SHIFT_HISTORY_PAGE_SIZE'),
      },
    ));
  }
  const responses = await runtimeValue<LegacyValue>('Promise').all(requests);
  const result = responses[0];
  const shiftResult = responses[1] || null;
  if (
    !posFunction('posHistoryRequestStillCurrent')(
      generation,
      userId,
      businessId,
      mode,
      'tally',
    )
  ) {
    return false;
  }
  if (
    runtimeFunction('posHandleAccessDenied')(
      result.error || (shiftResult && shiftResult.error),
    )
  ) {
    return false;
  }
  runtimeValue<LegacyValue>('posSalesHistory').tallyLoading = false;
  if (shiftResult) {
    runtimeValue<LegacyValue>('posSalesHistory').shiftLoading = false;
    if (shiftResult.error) {
      runtimeValue<LegacyValue>('posSalesHistory').shiftLoaded = false;
      runtimeValue<LegacyValue>('posSalesHistory').shiftError =
        'Closed shifts could not load, so shift filtering is temporarily unavailable.';
    } else if (
      !posFunction('applyPosClosedShiftRows')(shiftResult.rows, false)
    ) {
      runtimeValue<LegacyValue>('posSalesHistory').shiftLoaded = false;
      runtimeValue<LegacyValue>('posSalesHistory').shiftError =
        'The server returned an incomplete shift-history cursor.';
    } else {
      runtimeValue<LegacyValue>('posSalesHistory').shiftError = '';
    }
  }
  if (result.error) {
    runtimeValue<LegacyValue>('posSalesHistory').tallyLoaded = false;
    runtimeValue<LegacyValue>('posSalesHistory').tallyError =
      'Could not load the drink tally. Check your connection and try again.';
    posFunction('renderPosHistoryPreservingScroll')();
    return false;
  }
  runtimeValue<LegacyValue>('posSalesHistory').tallyRows =
    (result.rows || []).filter(function (row: LegacyValue) {
      return row && typeof row === 'object';
    });
  runtimeValue<LegacyValue>('posSalesHistory').tallyLoaded = true;
  runtimeValue<LegacyValue>('posSalesHistory').tallyError = '';
  posFunction('renderPosHistoryPreservingScroll')();
  return true;
}

export async function loadPosClosedShiftsPage(
  loadOlder: LegacyValue,
): Promise<boolean> {
  if (
    !posFunction('posCanManageOperations')() ||
    !runtimeValue<LegacyValue>('cloud').client ||
    !runtimeValue<LegacyValue>('session') ||
    !runtimeValue<LegacyValue>('session').user ||
    !runtimeValue<LegacyValue>('posContext').businessId ||
    !runtimeValue<LegacyValue>('posOpsModal').open ||
    runtimeValue<LegacyValue>('posOpsModal').type !== 'salesHistory' ||
    runtimeValue<LegacyValue>('posSalesHistory').view !== 'shifts' ||
    posFunction('posSalesHistoryBusy')() ||
    (
      loadOlder &&
      !runtimeValue<LegacyValue>('posSalesHistory').shiftHasMore
    )
  ) {
    return false;
  }
  if (!loadOlder) {
    runtimeValue<LegacyValue>('posSalesHistory').shiftRows = [];
    runtimeValue<LegacyValue>('posSalesHistory').shiftLoaded = false;
    runtimeValue<LegacyValue>('posSalesHistory').shiftError = '';
    runtimeValue<LegacyValue>('posSalesHistory').shiftHasMore = true;
    runtimeValue<LegacyValue>('posSalesHistory').shiftCursorClosedAt = null;
    runtimeValue<LegacyValue>('posSalesHistory').shiftCursorShiftId = null;
  }
  const generation = incrementRuntimeBinding('posHistoryGeneration');
  const userId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('session').user.id || '',
  );
  const businessId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('posContext').businessId || '',
  );
  const mode = runtimeValue<LegacyValue>('posSalesHistory').mode;
  const date = runtimeValue<LegacyValue>('posSalesHistory').filterDate || null;
  runtimeValue<LegacyValue>('posSalesHistory').shiftLoading = true;
  runtimeValue<LegacyValue>('posSalesHistory').shiftError = '';
  posFunction('renderPosHistoryPreservingScroll')();
  const result = await posFunction('requestPosHistoryRpc')(
    'pos_get_closed_shifts_page',
    {
      p_business_id: businessId,
      p_is_training: mode === 'training',
      p_date_from: date,
      p_date_to: date,
      p_before_closed_at: loadOlder
        ? runtimeValue<LegacyValue>('posSalesHistory').shiftCursorClosedAt
        : null,
      p_before_shift_id: loadOlder
        ? runtimeValue<LegacyValue>('posSalesHistory').shiftCursorShiftId
        : null,
      p_limit: runtimeValue<LegacyValue>('POS_SHIFT_HISTORY_PAGE_SIZE'),
    },
  );
  if (
    !posFunction('posHistoryRequestStillCurrent')(
      generation,
      userId,
      businessId,
      mode,
      'shifts',
    )
  ) {
    return false;
  }
  if (runtimeFunction('posHandleAccessDenied')(result.error)) return false;
  runtimeValue<LegacyValue>('posSalesHistory').shiftLoading = false;
  if (result.error) {
    runtimeValue<LegacyValue>('posSalesHistory').shiftLoaded = true;
    runtimeValue<LegacyValue>('posSalesHistory').shiftError =
      'Could not load closed shifts. Already loaded shift records are still shown.';
    posFunction('renderPosHistoryPreservingScroll')();
    return false;
  }
  if (!posFunction('applyPosClosedShiftRows')(result.rows, loadOlder)) {
    runtimeValue<LegacyValue>('posSalesHistory').shiftLoaded = true;
    runtimeValue<LegacyValue>('posSalesHistory').shiftError =
      'The server returned an incomplete shift-history cursor. Close this window and try again.';
    posFunction('renderPosHistoryPreservingScroll')();
    return false;
  }
  runtimeValue<LegacyValue>('posSalesHistory').shiftError = '';
  posFunction('renderPosHistoryPreservingScroll')();
  return true;
}

export async function loadPosSalesHistoryPage(
  loadOlder: LegacyValue,
): Promise<boolean> {
  if (
    !runtimeValue<LegacyValue>('cloud').client ||
    !runtimeValue<LegacyValue>('session') ||
    !runtimeValue<LegacyValue>('session').user ||
    !runtimeValue<LegacyValue>('posContext').businessId ||
    !runtimeValue<LegacyValue>('posOpsModal').open ||
    runtimeValue<LegacyValue>('posOpsModal').type !== 'salesHistory' ||
    runtimeValue<LegacyValue>('posSalesHistory').view !== 'receipts' ||
    posFunction('posSalesHistoryBusy')() ||
    (loadOlder && !runtimeValue<LegacyValue>('posSalesHistory').hasMore)
  ) {
    return false;
  }
  if (!loadOlder) {
    runtimeValue<LegacyValue>('posSalesHistory').rows = [];
    runtimeValue<LegacyValue>('posSalesHistory').summary = null;
    runtimeValue<LegacyValue>('posSalesHistory').loaded = false;
    runtimeValue<LegacyValue>('posSalesHistory').error = '';
    runtimeValue<LegacyValue>('posSalesHistory').summaryError = '';
    runtimeValue<LegacyValue>('posSalesHistory').hasMore = true;
    runtimeValue<LegacyValue>('posSalesHistory').cursorCompletedAt = null;
    runtimeValue<LegacyValue>('posSalesHistory').cursorSaleId = null;
  }
  const generation = incrementRuntimeBinding('posHistoryGeneration');
  const userId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('session').user.id || '',
  );
  const businessId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('posContext').businessId || '',
  );
  const mode = runtimeValue<LegacyValue>('posSalesHistory').mode;
  runtimeValue<LegacyValue>('posSalesHistory').loading = true;
  runtimeValue<LegacyValue>('posSalesHistory').error = '';
  posFunction('renderPosHistoryPreservingScroll')();
  function request(
    name: LegacyValue,
    args: LegacyValue,
  ): Promise<LegacyValue> {
    try {
      return runtimeValue<LegacyValue>('Promise').resolve(
        runtimeValue<LegacyValue>('cloud').client.rpc(name, args),
      ).then(function (result: LegacyValue) {
        return { rows: runtimeFunction('rpcRows')(result), error: null };
      }).catch(function (error: LegacyValue) {
        return { rows: [], error: error };
      });
    } catch (error) {
      return runtimeValue<LegacyValue>('Promise').resolve({
        rows: [],
        error: error,
      });
    }
  }
  const pageArgs = {
    p_business_id: businessId,
    p_is_training: mode === 'training',
    p_before_completed_at: loadOlder
      ? runtimeValue<LegacyValue>('posSalesHistory').cursorCompletedAt
      : null,
    p_before_sale_id: loadOlder
      ? runtimeValue<LegacyValue>('posSalesHistory').cursorSaleId
      : null,
    p_limit: runtimeValue<LegacyValue>('POS_HISTORY_PAGE_SIZE'),
  };
  const requests = [request('pos_get_sales_history_page', pageArgs)];
  if (!loadOlder) {
    requests.push(request('pos_get_sales_history_summary', {
      p_business_id: businessId,
      p_is_training: mode === 'training',
    }));
  }
  const responses = await runtimeValue<LegacyValue>('Promise').all(requests);
  if (
    !posFunction('posHistoryRequestStillCurrent')(
      generation,
      userId,
      businessId,
      mode,
      'receipts',
    )
  ) {
    return false;
  }
  const pageResult = responses[0];
  const summaryResult = responses[1] || null;
  if (
    runtimeFunction('posHandleAccessDenied')(
      pageResult.error || (summaryResult && summaryResult.error),
    )
  ) {
    return false;
  }
  if (pageResult.error) {
    runtimeValue<LegacyValue>('posSalesHistory').loading = false;
    runtimeValue<LegacyValue>('posSalesHistory').loaded = true;
    runtimeValue<LegacyValue>('posSalesHistory').error =
      posFunction('posHistoryErrorText')(pageResult.error);
    posFunction('renderPosHistoryPreservingScroll')();
    return false;
  }
  const page = (pageResult.rows || []).slice(
    0,
    runtimeValue<LegacyValue>('POS_HISTORY_PAGE_SIZE'),
  );
  const last = page[page.length - 1] || null;
  if (last && (!last.completed_at || !last.sale_id)) {
    runtimeValue<LegacyValue>('posSalesHistory').loading = false;
    runtimeValue<LegacyValue>('posSalesHistory').loaded = true;
    runtimeValue<LegacyValue>('posSalesHistory').error =
      'The server returned an incomplete history cursor. Close this window and try again.';
    posFunction('renderPosHistoryPreservingScroll')();
    return false;
  }
  const seen: LegacyValue = {};
  runtimeValue<LegacyValue>('posSalesHistory').rows.forEach(
    function (row: LegacyValue) {
      seen[runtimeFunction('String')(row.sale_id || '')] = true;
    },
  );
  page.forEach(function (row: LegacyValue) {
    const key = runtimeFunction('String')(row.sale_id || '');
    if (key && !seen[key]) {
      seen[key] = true;
      runtimeValue<LegacyValue>('posSalesHistory').rows.push(row);
    }
  });
  runtimeValue<LegacyValue>('posSalesHistory').hasMore = page.some(
    function (row: LegacyValue) {
      return row.has_more === true;
    },
  );
  runtimeValue<LegacyValue>('posSalesHistory').cursorCompletedAt = last
    ? last.completed_at
    : runtimeValue<LegacyValue>('posSalesHistory').cursorCompletedAt;
  runtimeValue<LegacyValue>('posSalesHistory').cursorSaleId = last
    ? last.sale_id
    : runtimeValue<LegacyValue>('posSalesHistory').cursorSaleId;
  if (summaryResult) {
    if (summaryResult.error) {
      runtimeValue<LegacyValue>('posSalesHistory').summaryError =
        'All-time totals could not load. Receipt history is still available.';
    } else {
      runtimeValue<LegacyValue>('posSalesHistory').summary =
        summaryResult.rows[0] || null;
      runtimeValue<LegacyValue>('posSalesHistory').summaryError = '';
    }
  }
  runtimeValue<LegacyValue>('posSalesHistory').loading = false;
  runtimeValue<LegacyValue>('posSalesHistory').loaded = true;
  runtimeValue<LegacyValue>('posSalesHistory').error = '';
  posFunction('renderPosHistoryPreservingScroll')();
  return true;
}
