import {
  incrementRuntimeBinding,
  posFunction,
  runtimeFunction,
  runtimeValue,
  type LegacyValue,
} from '../bindings';

function checkout(): LegacyValue {
  return runtimeValue<LegacyValue>('posCheckout');
}

function modal(): LegacyValue {
  return runtimeValue<LegacyValue>('posOpsModal');
}

export async function submitPosOpenShift(): Promise<boolean> {
  if (
    modal().submitting || checkout().shift || checkout().pending ||
    !runtimeValue<LegacyValue>('session') ||
    !runtimeValue<LegacyValue>('session').user ||
    !posFunction('requirePosOpsVerification')()
  ) {
    return false;
  }
  const status = checkout().shiftStatus || {};
  const training = modal().mode === 'training';
  if (
    (training && !status.can_open_training) ||
    (!training && !status.can_open_live)
  ) {
    return false;
  }
  const opening = training
    ? 0
    : runtimeFunction('strictPesoCentavos')(modal().openingCash);
  if (opening == null) {
    modal().error =
      'Enter starting cash using pesos and up to 2 decimal places.';
    posFunction('renderPosOpsModal')();
    return false;
  }
  const generation = incrementRuntimeBinding('posOpsGeneration');
  const userId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('session').user.id || '',
  );
  const businessId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('posContext').businessId || '',
  );
  const args = modal().rpcArgs || {
    p_business_id: businessId,
    p_is_training: training,
    p_opening_cash_centavos: opening,
  };
  modal().rpcArgs = args;
  modal().submitting = true;
  modal().error = '';
  modal().uncertain = false;
  posFunction('renderPosOpsModal')();
  try {
    const rows = runtimeFunction('rpcRows')(
      await runtimeValue<LegacyValue>('cloud').client.rpc(
        'pos_open_shift',
        args,
      ),
    );
    const opened = rows[0];
    if (
      !posFunction('posOpsRequestStillCurrent')(
        generation,
        userId,
        businessId,
      )
    ) {
      return false;
    }
    if (!opened || !opened.shift_id) {
      const ErrorConstructor = runtimeValue<LegacyValue>('Error');
      throw new ErrorConstructor('Missing shift response');
    }
    modal().submitting = false;
    checkout().shift = runtimeValue<LegacyValue>('Object').assign(
      { has_open_shift: true },
      opened,
    );
    checkout().reportMode = opened.is_training ? 'training' : 'live';
    checkout().lastReceipt = null;
    runtimeValue<LegacyValue>('document').body.classList.toggle(
      'pos-training',
      !!opened.is_training,
    );
    posFunction('posCloseOpsModal')(true);
    await runtimeFunction('refreshPosAfterMutation')();
    return true;
  } catch (error) {
    if (
      !posFunction('posOpsRequestStillCurrent')(
        generation,
        userId,
        businessId,
      )
    ) {
      return false;
    }
    modal().submitting = false;
    modal().error = posFunction('posOperationErrorText')(
      error,
      'shift opening',
    );
    if (posFunction('posOperationDeterministic')(error)) {
      if (
        ['22023', '23514'].indexOf(
          runtimeFunction('String')(
            (error as LegacyValue) && (error as LegacyValue).code || '',
          ),
        ) >= 0
      ) {
        modal().rpcArgs = null;
      }
      posFunction('renderPosOpsModal')();
      return false;
    }
    modal().uncertain = true;
    posFunction('renderPosOpsModal')();
    const verified = await runtimeFunction('loadPosCheckoutData')();
    if (
      !posFunction('posOpsRequestStillCurrent')(
        generation,
        userId,
        businessId,
      ) || !modal().open
    ) {
      return false;
    }
    if (!verified || checkout().shiftError) {
      modal().uncertain = true;
      modal().error =
        'The shift opening could not be verified because the status check also failed. Keep these exact details and retry after reconnecting.';
      posFunction('renderPosOpsModal')();
      return false;
    }
    if (
      checkout().shift &&
      !!checkout().shift.is_training === training &&
      runtimeFunction('Number')(checkout().shift.opening_cash_centavos) ===
        runtimeFunction('Number')(args.p_opening_cash_centavos)
    ) {
      posFunction('posCloseOpsModal')(true);
      checkout().notice = 'The ' + posFunction('posModeName')(training) +
        ' shift was found open after the connection recovered.';
      runtimeFunction('renderPos')();
      return true;
    }
    if (checkout().shift) {
      posFunction('posCloseOpsModal')(true);
      checkout().notice = 'Another ' +
        posFunction('posModeName')(!!checkout().shift.is_training) +
        ' shift is already open with different opening details. The authoritative shift was loaded; review it before continuing.';
      runtimeFunction('renderPos')();
      return false;
    }
    modal().uncertain = false;
    modal().rpcArgs = null;
    modal().error =
      'The server check found no open shift. Review the details and try again.';
    posFunction('renderPosOpsModal')();
    return false;
  }
}

export function posCloseValidation(): LegacyValue {
  if (
    runtimeFunction('posCartLines')().length || checkout().confirming ||
    checkout().submitting || checkout().pending
  ) {
    return {
      valid: false,
      error:
        'Finish, retry, or clear the current sale before closing the shift.',
    };
  }
  if (modal().mode === 'training') {
    return { valid: true, cash: null, gcash: null, gotyme: null, error: '' };
  }
  const cash = runtimeFunction('strictPesoCentavos')(modal().countedCash);
  const gcash = runtimeFunction('strictPesoCentavos')(modal().verifiedGcash);
  const gotyme = runtimeFunction('strictPesoCentavos')(modal().verifiedGotyme);
  if (cash == null || gcash == null || gotyme == null) {
    return {
      valid: false,
      error:
        'Enter counted Cash, verified GCash, and verified GoTyme using pesos and up to 2 decimal places.',
    };
  }
  if (
    runtimeFunction('String')(modal().notes || '').trim().length > 500
  ) {
    return { valid: false, error: 'Keep the closing note under 500 characters.' };
  }
  return { valid: true, cash, gcash, gotyme, error: '' };
}

export function reviewPosCloseShift(): boolean {
  if (
    modal().type !== 'closeShift' || modal().submitting ||
    !posFunction('requirePosOpsVerification')()
  ) {
    return false;
  }
  const validation = posFunction('posCloseValidation')();
  if (!validation.valid) {
    modal().error = validation.error;
    posFunction('renderPosOpsModal')();
    return false;
  }
  modal().step = 'confirm';
  modal().error = '';
  posFunction('renderPosOpsModal')();
  return true;
}

export function backPosCloseShift(): boolean {
  if (modal().submitting || modal().uncertain) return false;
  modal().step = 'edit';
  modal().error = '';
  posFunction('renderPosOpsModal')();
  return true;
}

export async function submitPosCloseShift(): Promise<boolean> {
  if (
    modal().submitting || !runtimeValue<LegacyValue>('session') ||
    !runtimeValue<LegacyValue>('session').user ||
    modal().type !== 'closeShift' ||
    !posFunction('requirePosOpsVerification')()
  ) {
    return false;
  }
  const validation = posFunction('posCloseValidation')();
  if (!modal().rpcArgs && !validation.valid) {
    modal().error = validation.error;
    posFunction('renderPosOpsModal')();
    return false;
  }
  const businessId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('posContext').businessId || '',
  );
  const shiftId = runtimeFunction('String')(
    checkout().shift && checkout().shift.shift_id ||
      modal().rpcArgs && modal().rpcArgs.p_shift_id || '',
  );
  if (!shiftId) return false;
  const args = modal().rpcArgs || {
    p_business_id: businessId,
    p_shift_id: shiftId,
    p_counted_cash_centavos: validation.cash,
    p_verified_gcash_centavos: validation.gcash,
    p_verified_gotyme_centavos: validation.gotyme,
    p_close_notes:
      runtimeFunction('String')(modal().notes || '').trim() || null,
  };
  modal().rpcArgs = args;
  const generation = incrementRuntimeBinding('posOpsGeneration');
  const userId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('session').user.id || '',
  );
  modal().submitting = true;
  modal().uncertain = false;
  modal().error = '';
  posFunction('renderPosOpsModal')();
  try {
    const rows = runtimeFunction('rpcRows')(
      await runtimeValue<LegacyValue>('cloud').client.rpc(
        'pos_close_shift',
        args,
      ),
    );
    const closed = rows[0];
    if (
      !posFunction('posOpsRequestStillCurrent')(
        generation,
        userId,
        businessId,
      )
    ) {
      return false;
    }
    if (!closed || !closed.shift_id) {
      const ErrorConstructor = runtimeValue<LegacyValue>('Error');
      throw new ErrorConstructor('Missing close response');
    }
    modal().submitting = false;
    modal().uncertain = false;
    modal().step = 'result';
    modal().result = closed;
    checkout().shift = null;
    checkout().lastReceipt = null;
    checkout().reportMode = closed.is_training ? 'training' : 'live';
    runtimeValue<LegacyValue>('document').body.classList.remove('pos-training');
    posFunction('renderPosOpsModal')();
    runtimeFunction('refreshPosAfterMutation')().catch(function () {});
    return true;
  } catch (error) {
    if (
      !posFunction('posOpsRequestStillCurrent')(
        generation,
        userId,
        businessId,
      )
    ) {
      return false;
    }
    modal().submitting = false;
    modal().error = posFunction('posOperationErrorText')(
      error,
      'shift close',
    );
    if (posFunction('posOperationDeterministic')(error)) {
      if (
        ['22003', '22023', '23514'].indexOf(
          runtimeFunction('String')(
            (error as LegacyValue) && (error as LegacyValue).code || '',
          ),
        ) >= 0
      ) {
        modal().rpcArgs = null;
        modal().step = 'edit';
      }
      posFunction('renderPosOpsModal')();
      return false;
    }
    modal().uncertain = true;
    posFunction('renderPosOpsModal')();
    const verified = await runtimeFunction('loadPosCheckoutData')();
    if (
      !posFunction('posOpsRequestStillCurrent')(
        generation,
        userId,
        businessId,
      ) || !modal().open
    ) {
      return false;
    }
    if (!verified || checkout().shiftError) {
      modal().error =
        'The shift close could not be verified because the status check also failed. Keep these exact amounts and retry after reconnecting.';
      posFunction('renderPosOpsModal')();
      return false;
    }
    modal().error = checkout().shift &&
        runtimeFunction('String')(checkout().shift.shift_id) === shiftId
      ? 'The server still shows this shift open. You may retry the exact same close details.'
      : 'The server now shows this shift closed. Use Recover close result to retrieve its official variance.';
    posFunction('renderPosOpsModal')();
    return false;
  }
}

export function reviewPosVoidSale(): boolean {
  if (
    modal().submitting || modal().type !== 'voidSale' ||
    !posFunction('requirePosOpsVerification')()
  ) {
    return false;
  }
  const reason = runtimeFunction('String')(modal().reason || '').trim();
  if (reason.length < 3 || reason.length > 500) {
    modal().error = 'Enter a clear reason between 3 and 500 characters.';
    posFunction('renderPosOpsModal')();
    return false;
  }
  modal().reason = reason;
  modal().step = 'confirm';
  modal().error = '';
  posFunction('renderPosOpsModal')();
  return true;
}

export function backPosVoidSale(): boolean {
  if (modal().submitting || modal().uncertain) return false;
  modal().step = 'edit';
  modal().error = '';
  posFunction('renderPosOpsModal')();
  return true;
}

export async function submitPosVoidSale(): Promise<boolean> {
  if (
    modal().submitting || !posFunction('posCanManageOperations')() ||
    !runtimeValue<LegacyValue>('session') ||
    !runtimeValue<LegacyValue>('session').user || !modal().sale ||
    !posFunction('requirePosOpsVerification')()
  ) {
    return false;
  }
  const reason = runtimeFunction('String')(modal().reason || '').trim();
  if (reason.length < 3 || reason.length > 500) {
    modal().error = 'Enter a clear reason between 3 and 500 characters.';
    posFunction('renderPosOpsModal')();
    return false;
  }
  const businessId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('posContext').businessId || '',
  );
  const saleId = runtimeFunction('String')(modal().sale.sale_id || '');
  const args = modal().rpcArgs || {
    p_business_id: businessId,
    p_sale_id: saleId,
    p_reason: reason,
  };
  modal().rpcArgs = args;
  const generation = incrementRuntimeBinding('posOpsGeneration');
  const userId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('session').user.id || '',
  );
  modal().submitting = true;
  modal().uncertain = false;
  modal().error = '';
  posFunction('renderPosOpsModal')();
  try {
    const rows = runtimeFunction('rpcRows')(
      await runtimeValue<LegacyValue>('cloud').client.rpc(
        'pos_void_sale',
        args,
      ),
    );
    const voided = rows[0];
    if (
      !posFunction('posOpsRequestStillCurrent')(
        generation,
        userId,
        businessId,
      )
    ) {
      return false;
    }
    if (!voided || !voided.sale_id) {
      const ErrorConstructor = runtimeValue<LegacyValue>('Error');
      throw new ErrorConstructor('Missing void response');
    }
    modal().submitting = false;
    modal().uncertain = false;
    modal().step = 'result';
    modal().result = voided;
    posFunction('renderPosOpsModal')();
    runtimeFunction('refreshPosAfterMutation')().catch(function () {});
    return true;
  } catch (error) {
    if (
      !posFunction('posOpsRequestStillCurrent')(
        generation,
        userId,
        businessId,
      )
    ) {
      return false;
    }
    modal().submitting = false;
    modal().error = posFunction('posOperationErrorText')(error, 'void');
    if (posFunction('posOperationDeterministic')(error)) {
      if (
        ['22003', '22023', '23514'].indexOf(
          runtimeFunction('String')(
            (error as LegacyValue) && (error as LegacyValue).code || '',
          ),
        ) >= 0
      ) {
        modal().rpcArgs = null;
        modal().step = 'edit';
      }
      posFunction('renderPosOpsModal')();
      return false;
    }
    modal().uncertain = true;
    posFunction('renderPosOpsModal')();
    const verified = await runtimeFunction('loadPosCheckoutData')();
    if (
      !posFunction('posOpsRequestStillCurrent')(
        generation,
        userId,
        businessId,
      ) || !modal().open
    ) {
      return false;
    }
    if (!verified || checkout().shiftError || checkout().reportsError) {
      modal().error =
        'The void could not be verified because the receipt check also failed. Keep this exact reason and retry after reconnecting.';
      posFunction('renderPosOpsModal')();
      return false;
    }
    const latest = (checkout().recent || []).find(function (
      row: LegacyValue,
    ) {
      return runtimeFunction('String')(row.sale_id || '') === saleId;
    });
    if (latest && latest.sale_state === 'voided') {
      modal().sale = latest;
      modal().result = latest;
      modal().step = 'result';
      modal().uncertain = false;
      modal().error = '';
      posFunction('renderPosOpsModal')();
      return true;
    }
    modal().error =
      'The server still shows this receipt completed. You may retry the exact same void reason.';
    posFunction('renderPosOpsModal')();
    return false;
  }
}
