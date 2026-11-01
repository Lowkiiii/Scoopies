import {
  incrementRuntimeBinding,
  readStocksBinding,
  runtimeValue,
  writeRuntimeBinding,
} from './bindings';
import { stockFormatQuantity } from './formatting';
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
import { renderStocks } from './rendering';
import type { LegacyValue } from './types';

export function stockItemById(id: LegacyValue): LegacyValue {
  return (
    runtimeValue('stockState').items.find(function (item: LegacyValue) {
      return String(item.id) === String(id);
    }) || null
  );
}

export function stockAllowedActions(item: LegacyValue): LegacyValue[] {
  if (!item) return [];
  const actions: LegacyValue[] = [];
  if (!item.initialized) {
    actions.push({ key: 'stock_count', label: 'Set opening count' });
  } else {
    if (item.kind !== 'mixture') {
      actions.push({ key: 'stock_in', label: 'Add purchased stock' });
    }
    actions.push(
      { key: 'waste', label: 'Record waste' },
      { key: 'stock_count', label: 'Count actual stock' },
      { key: 'correction', label: 'Correct by + / -' },
    );
  }
  actions.push({ key: 'threshold', label: 'Set low-stock alert' });
  return actions;
}

export function stockUnitChoices(item: LegacyValue): string[] {
  if (!item) return [];
  if (item.baseUnit === 'g') return ['g', 'kg'];
  if (item.baseUnit === 'ml') return ['ml', 'l'];
  return ['piece'];
}

export function stockInputToBase(
  quantity: LegacyValue,
  unit: LegacyValue,
  item: LegacyValue,
): number {
  const value = Number(quantity);
  if (
    !isFinite(value) ||
    !item ||
    runtimeValue('UNIT_TYPE')[unit] !==
      runtimeValue('UNIT_TYPE')[item.baseUnit]
  ) {
    return NaN;
  }
  return value * (runtimeValue('UNIT_FACTOR')[unit] || 1);
}

export function stockValidateModal(): LegacyValue {
  const item = readStocksBinding(
    'stockItemById',
    stockItemById,
  )(runtimeValue('stockModal').itemId);
  if (!item) {
    return {
      valid: false,
      error: 'This stock item is no longer available.',
    };
  }
  const action = runtimeValue('stockModal').action;
  const allowed = readStocksBinding(
    'stockAllowedActions',
    stockAllowedActions,
  )(item).some(function (option: LegacyValue) {
    return option.key === action;
  });
  if (!allowed) {
    return { valid: false, error: 'Choose an available stock action.' };
  }
  const raw = String(
    runtimeValue('stockModal').quantity == null
      ? ''
      : runtimeValue('stockModal').quantity,
  ).trim();
  const quantity = Number(raw);
  const base = readStocksBinding(
    'stockInputToBase',
    stockInputToBase,
  )(quantity, runtimeValue('stockModal').unit, item);
  if (action === 'threshold') {
    if (raw === '') {
      return {
        valid: true,
        item,
        thresholdBase: null,
        before: item.balance,
        after: item.balance,
      };
    }
    if (!isFinite(base) || base < 0 || base > 1000000000000) {
      return {
        valid: false,
        error: 'Enter a non-negative alert amount in a compatible unit.',
      };
    }
    return {
      valid: true,
      item,
      thresholdBase: base,
      before: item.balance,
      after: item.balance,
    };
  }
  if (raw === '' || !isFinite(base) || Math.abs(base) > 1000000000000) {
    return { valid: false, error: 'Enter a valid stock amount.' };
  }
  if (action === 'stock_count' && base < 0) {
    return {
      valid: false,
      error: 'The physical count cannot be negative.',
    };
  }
  if ((action === 'stock_in' || action === 'waste') && base <= 0) {
    return { valid: false, error: 'Enter an amount greater than zero.' };
  }
  if (action === 'correction' && base === 0) {
    return {
      valid: false,
      error: 'Enter a positive or negative correction.',
    };
  }
  const delta =
    action === 'stock_in'
      ? base
      : action === 'waste'
        ? -base
        : action === 'stock_count'
          ? base - item.balance
          : base;
  const after = item.balance + delta;
  if (after < 0) {
    return {
      valid: false,
      error:
        'This would make stock negative. Count the actual amount instead, or reduce the waste/correction.',
    };
  }
  const reason = String(runtimeValue('stockModal').reason || '').trim();
  const note = String(runtimeValue('stockModal').note || '').trim();
  if (
    (action === 'waste' || action === 'correction') &&
    (reason.length < 3 || reason.length > 500)
  ) {
    return {
      valid: false,
      error: 'Enter a clear reason between 3 and 500 characters.',
    };
  }
  if (note.length > 500) {
    return { valid: false, error: 'Keep the note under 500 characters.' };
  }
  return {
    valid: true,
    item,
    inputQuantity: quantity,
    delta,
    before: item.balance,
    after,
    reason: reason || null,
    note: note || null,
  };
}

export function openStockModal(itemId: LegacyValue): boolean {
  if (
    !runtimeValue('stockCanManage')() ||
    runtimeValue('stockState').loading ||
    runtimeValue('stockState').refreshing ||
    readStocksBinding('stockStoredPending', stockStoredPending)() ||
    runtimeValue('stockState').sourceConflict
  ) {
    return false;
  }
  const item = readStocksBinding('stockItemById', stockItemById)(itemId);
  if (!item) return false;
  const actions = readStocksBinding(
    'stockAllowedActions',
    stockAllowedActions,
  )(item);
  writeRuntimeBinding('stockModalReturnFocus', document.activeElement);
  writeRuntimeBinding('stockModal', runtimeValue('freshStockModal')());
  runtimeValue('stockModal').open = true;
  runtimeValue('stockModal').itemId = item.id;
  runtimeValue('stockModal').action = actions[0].key;
  runtimeValue('stockModal').unit = item.baseUnit;
  const modal = document.getElementById('stockModal');
  if (modal) modal.hidden = false;
  runtimeValue('refreshModalBodyClass')();
  readStocksBinding('renderStockModal', renderStockModal)();
  runtimeValue('focusSoon')('#stockQuantity');
  return true;
}

export function closeStockModal(force: LegacyValue): boolean {
  if (
    (runtimeValue('stockModal').submitting ||
      runtimeValue('stockModal').uncertain) &&
    !force
  ) {
    return false;
  }
  writeRuntimeBinding('stockModal', runtimeValue('freshStockModal')());
  const modal = document.getElementById('stockModal');
  if (modal) modal.hidden = true;
  runtimeValue('refreshModalBodyClass')();
  const target = runtimeValue('stockModalReturnFocus');
  writeRuntimeBinding('stockModalReturnFocus', null);
  setTimeout(function () {
    if (target && document.contains(target)) target.focus();
  }, 0);
  return true;
}

export function setStockModalAction(action: LegacyValue): boolean {
  const item = readStocksBinding(
    'stockItemById',
    stockItemById,
  )(runtimeValue('stockModal').itemId);
  if (
    !item ||
    runtimeValue('stockModal').submitting ||
    runtimeValue('stockModal').uncertain
  ) {
    return false;
  }
  if (
    !readStocksBinding(
      'stockAllowedActions',
      stockAllowedActions,
    )(item).some(function (option: LegacyValue) {
      return option.key === action;
    })
  ) {
    return false;
  }
  runtimeValue('stockModal').action = action;
  runtimeValue('stockModal').unit = item.baseUnit;
  runtimeValue('stockModal').reason = '';
  runtimeValue('stockModal').note = '';
  runtimeValue('stockModal').error = '';
  runtimeValue('stockModal').pendingRpc = null;
  runtimeValue('stockModal').quantity =
    action === 'threshold' && item.threshold != null
      ? String(item.threshold)
      : '';
  readStocksBinding('renderStockModal', renderStockModal)();
  runtimeValue('focusSoon')('#stockQuantity');
  return true;
}

export function stockPreviewHtml(
  validation: LegacyValue,
  item: LegacyValue,
): string {
  const threshold = runtimeValue('stockModal').action === 'threshold';
  const formatQuantity = (
    value: LegacyValue,
    unit: LegacyValue,
    signed: LegacyValue,
  ): string =>
    readStocksBinding(
      'stockFormatQuantity',
      stockFormatQuantity,
    )(value, unit, signed);
  const before = threshold
    ? item.threshold == null
      ? 'Disabled'
      : formatQuantity(item.threshold, item.baseUnit, false)
    : formatQuantity(item.balance, item.baseUnit, false);
  const after = validation.valid
    ? threshold
      ? validation.thresholdBase == null
        ? 'Disabled'
        : formatQuantity(validation.thresholdBase, item.baseUnit, false)
      : formatQuantity(validation.after, item.baseUnit, false)
    : '\u2014';
  return (
    '<div class="stock-modal-preview"><div class="metric"><div class="lbl">' +
    (threshold ? 'Current alert' : 'Before') +
    '</div><div id="stockPreviewBefore" class="val">' +
    runtimeValue('escapeHtml')(before) +
    '</div></div><div class="stock-preview-arrow" aria-hidden="true">&rarr;</div><div class="metric"><div class="lbl">' +
    (threshold ? 'New alert' : 'After') +
    '</div><div id="stockPreviewAfter" class="val">' +
    runtimeValue('escapeHtml')(after) +
    '</div></div></div>'
  );
}

export function renderStockModal(): void {
  if (!runtimeValue('stockModal').open) return;
  const item = readStocksBinding(
    'stockItemById',
    stockItemById,
  )(runtimeValue('stockModal').itemId);
  const content = document.getElementById('stockModalContent');
  if (!item || !content) {
    readStocksBinding('closeStockModal', closeStockModal)(true);
    return;
  }
  const actions = readStocksBinding(
    'stockAllowedActions',
    stockAllowedActions,
  )(item);
  const validation = readStocksBinding(
    'stockValidateModal',
    stockValidateModal,
  )();
  const locked =
    runtimeValue('stockModal').submitting ||
    runtimeValue('stockModal').uncertain;
  const action = runtimeValue('stockModal').action;
  const actionOptions = actions
    .map(function (option: LegacyValue) {
      return (
        '<option value="' +
        option.key +
        '"' +
        (option.key === action ? ' selected' : '') +
        '>' +
        option.label +
        '</option>'
      );
    })
    .join('');
  const unitOptions = readStocksBinding(
    'stockUnitChoices',
    stockUnitChoices,
  )(item)
    .map(function (unit: string) {
      return (
        '<option value="' +
        unit +
        '"' +
        (unit === runtimeValue('stockModal').unit ? ' selected' : '') +
        '>' +
        unit +
        '</option>'
      );
    })
    .join('');
  const quantityLabel =
    action === 'threshold'
      ? 'Alert at or below (blank disables)'
      : action === 'stock_count'
        ? item.initialized
          ? 'Actual amount physically counted'
          : 'Opening amount physically counted'
        : action === 'correction'
          ? 'Change stock by (+ or -)'
          : 'Amount';
  const actionLabel =
    action === 'threshold'
      ? 'Save alert'
      : action === 'stock_count'
        ? item.initialized
          ? 'Save count'
          : 'Set opening count'
        : action === 'stock_in'
          ? 'Add stock'
          : action === 'waste'
            ? 'Record waste'
            : 'Save correction';
  const formatQuantity = (
    value: LegacyValue,
    unit: LegacyValue,
    signed: LegacyValue,
  ): string =>
    readStocksBinding(
      'stockFormatQuantity',
      stockFormatQuantity,
    )(value, unit, signed);
  content.setAttribute(
    'aria-busy',
    runtimeValue('stockModal').submitting ? 'true' : 'false',
  );
  content.innerHTML =
    '<div class="modal-head"><div style="flex:1"><h2 id="stockModalTitle">' +
    runtimeValue('escapeHtml')(item.name) +
    '</h2><p class="hint">' +
    (item.kind === 'mixture' ? 'Prepared mixture' : 'Purchased ingredient') +
    ' &middot; current ' +
    (item.initialized
      ? formatQuantity(item.balance, item.baseUnit, false)
      : 'not counted') +
    '</p></div><button class="modal-close" data-act="closeStockModal" aria-label="Close stock dialog"' +
    (locked ? ' disabled' : '') +
    '>x</button></div>' +
    (item.kind === 'mixture'
      ? '<div class="note" style="margin-bottom:12px">Prepared mixtures use physical counts, waste, and corrections in Phase 1. \u201cAdd stock\u201d waits for the future batch-production workflow so raw ingredients are not double-counted.</div>'
      : '') +
    '<label class="fld" for="stockAction">Action</label><select id="stockAction" data-stock-field="action"' +
    (locked ? ' disabled' : '') +
    '>' +
    actionOptions +
    '</select>' +
    '<div class="grid2" style="margin-top:10px"><div><label class="fld" for="stockQuantity">' +
    quantityLabel +
    '</label><input id="stockQuantity" data-stock-field="quantity" type="number" step="any" value="' +
    runtimeValue('escapeHtml')(runtimeValue('stockModal').quantity) +
    '"' +
    (locked ? ' disabled' : '') +
    '></div><div><label class="fld" for="stockUnit">Unit</label><select id="stockUnit" data-stock-field="unit"' +
    (locked ? ' disabled' : '') +
    '>' +
    unitOptions +
    '</select></div></div>' +
    readStocksBinding('stockPreviewHtml', stockPreviewHtml)(validation, item) +
    (action === 'waste' || action === 'correction'
      ? '<label class="fld" for="stockReason">Reason (required)</label><input id="stockReason" data-stock-field="reason" maxlength="500" value="' +
        runtimeValue('escapeHtml')(runtimeValue('stockModal').reason) +
        '" placeholder="e.g. Spilled during preparation"' +
        (locked ? ' disabled' : '') +
        '>'
      : '') +
    (action !== 'threshold'
      ? '<label class="fld" for="stockNote" style="margin-top:10px">Note (optional)</label><textarea id="stockNote" data-stock-field="note" maxlength="500" placeholder="Supplier, delivery, or count detail"' +
        (locked ? ' disabled' : '') +
        '>' +
        runtimeValue('escapeHtml')(runtimeValue('stockModal').note) +
        '</textarea>'
      : '') +
    '<div id="stockModalError" class="modal-error" aria-live="assertive">' +
    runtimeValue('escapeHtml')(runtimeValue('stockModal').error) +
    '</div>' +
    (runtimeValue('stockModal').uncertain
      ? '<div class="note"><strong>Result not confirmed.</strong> Keep these exact details and retry; the request ID prevents a duplicate stock movement.</div>'
      : '') +
    '<div class="modal-actions"><button class="btn secondary" data-act="closeStockModal"' +
    (locked ? ' disabled' : '') +
    '>Cancel</button><button class="btn" data-act="submitStockModal"' +
    (runtimeValue('stockModal').submitting ? ' disabled' : '') +
    '>' +
    (runtimeValue('stockModal').submitting
      ? 'Saving...'
      : runtimeValue('stockModal').uncertain
        ? 'Retry exact action'
        : actionLabel) +
    '</button></div>';
}

export function updateStockModalPreview(): void {
  if (!runtimeValue('stockModal').open) return;
  const item = readStocksBinding(
    'stockItemById',
    stockItemById,
  )(runtimeValue('stockModal').itemId);
  const validation = readStocksBinding(
    'stockValidateModal',
    stockValidateModal,
  )();
  const after = document.getElementById('stockPreviewAfter');
  const error = document.getElementById('stockModalError');
  if (after && item) {
    const formatQuantity = (
      value: LegacyValue,
      unit: LegacyValue,
      signed: LegacyValue,
    ): string =>
      readStocksBinding(
        'stockFormatQuantity',
        stockFormatQuantity,
      )(value, unit, signed);
    after.textContent = validation.valid
      ? runtimeValue('stockModal').action === 'threshold'
        ? validation.thresholdBase == null
          ? 'Disabled'
          : formatQuantity(
              validation.thresholdBase,
              item.baseUnit,
              false,
            )
        : formatQuantity(validation.after, item.baseUnit, false)
      : '\u2014';
  }
  if (error) error.textContent = '';
  runtimeValue('stockModal').error = '';
}

export async function submitStockModal(): Promise<boolean> {
  if (
    !runtimeValue('stockModal').open ||
    runtimeValue('stockModal').submitting ||
    !runtimeValue('stockCanManage')() ||
    !runtimeValue('cloud').client ||
    !runtimeValue('session') ||
    !runtimeValue('session').user ||
    !runtimeValue('posContext').businessId
  ) {
    return false;
  }
  const validation = readStocksBinding(
    'stockValidateModal',
    stockValidateModal,
  )();
  if (!runtimeValue('stockModal').pendingRpc && !validation.valid) {
    runtimeValue('stockModal').error = validation.error;
    readStocksBinding('renderStockModal', renderStockModal)();
    return false;
  }
  let request = runtimeValue('stockModal').pendingRpc;
  if (!request) {
    if (runtimeValue('stockModal').action === 'threshold') {
      request = {
        name: 'pos_inventory_set_threshold',
        args: {
          p_business_id: String(runtimeValue('posContext').businessId),
          p_inventory_item_id: validation.item.id,
          p_threshold_base: validation.thresholdBase,
          p_expected_revision: validation.item.revision,
        },
      };
    } else {
      request = {
        name: 'pos_inventory_record_transaction',
        args: {
          p_business_id: String(runtimeValue('posContext').businessId),
          p_client_transaction_id: runtimeValue('posUuid')(),
          p_transaction_type: runtimeValue('stockModal').action,
          p_lines: [
            {
              inventoryItemId: validation.item.id,
              quantity: validation.inputQuantity,
              unit: runtimeValue('stockModal').unit,
              expectedRevision: validation.item.revision,
            },
          ],
          p_reason: validation.reason,
          p_note: validation.note,
        },
      };
    }
    if (
      request.name === 'pos_inventory_record_transaction' &&
      !readStocksBinding('stockSavePending', stockSavePending)(
        readStocksBinding('stockBuildPending', stockBuildPending)(
          request,
          validation.item.id,
        ),
      )
    ) {
      runtimeValue('stockModal').error =
        'Another tab may already have a protected stock update, or this browser could not save retry protection. Recover that update first; no new stock update was sent.';
      readStocksBinding('renderStockModal', renderStockModal)();
      return false;
    }
    runtimeValue('stockModal').pendingRpc = request;
  }
  const storedPending =
    request.name === 'pos_inventory_record_transaction'
      ? readStocksBinding(
          'stockStoredPendings',
          stockStoredPendings,
        )().find(function (record: LegacyValue) {
          return (
            String(record.rpcArgs.p_client_transaction_id) ===
            String(request.args.p_client_transaction_id)
          );
        })
      : null;
  const generation = incrementRuntimeBinding('stockMutationGeneration');
  const userId = String(runtimeValue('session').user.id || '');
  const businessId = String(runtimeValue('posContext').businessId || '');
  const itemId = runtimeValue('stockModal').itemId;
  runtimeValue('stockModal').submitting = true;
  runtimeValue('stockModal').error = '';
  runtimeValue('stockModal').uncertain = false;
  readStocksBinding('renderStockModal', renderStockModal)();
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
    if (request.name === 'pos_inventory_record_transaction') {
      readStocksBinding('stockClearPending', stockClearPending)(storedPending);
    }
    runtimeValue('stockModal').pendingRpc = null;
    runtimeValue('stockModal').submitting = false;
    runtimeValue('stockModal').uncertain = false;
    readStocksBinding('closeStockModal', closeStockModal)(true);
    const refreshed = await readStocksBinding('loadStocks', loadStocks)({
      background: true,
    });
    runtimeValue('stockState').notice = refreshed
      ? 'Stock update saved to the shared ledger.'
      : 'Stock update was saved and the confirmed new balance is shown, but the full list and history could not refresh. Use Refresh before the next count if the connection is unstable.';
    readStocksBinding(
      'renderStocks',
      renderStocks,
    )();
    runtimeValue('focusSoon')(
      '[data-act="openStockModal"][data-id="' + itemId + '"]',
    );
    return true;
  } catch (error) {
    if (
      generation !== runtimeValue('stockMutationGeneration') ||
      !runtimeValue('session') ||
      String(runtimeValue('session').user.id || '') !== userId ||
      String(runtimeValue('posContext').businessId || '') !== businessId
    ) {
      return false;
    }
    runtimeValue('stockModal').submitting = false;
    runtimeValue('stockModal').error = readStocksBinding(
      'stockErrorText',
      stockErrorText,
    )(error);
    if (
      readStocksBinding(
        'stockMutationDeterministic',
        stockMutationDeterministic,
      )(error)
    ) {
      if (request.name === 'pos_inventory_record_transaction') {
        readStocksBinding(
          'stockClearPending',
          stockClearPending,
        )(storedPending);
      }
      runtimeValue('stockModal').pendingRpc = null;
      runtimeValue('stockModal').uncertain = false;
    } else {
      runtimeValue('stockModal').uncertain = true;
    }
    readStocksBinding('renderStockModal', renderStockModal)();
    return false;
  }
}
