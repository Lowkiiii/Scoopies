import {
  runtimeFunction,
  runtimeValue,
  workspaceFunction,
  writeRuntimeBinding,
  type LegacyValue,
} from './bindings';

export function posDeterministicError(error: LegacyValue): boolean {
  const code = runtimeFunction('String')(error && error.code || '');
  return [
    '40001',
    '42501',
    '22003',
    '22023',
    '23514',
    '23505',
    '55000',
  ].indexOf(code) >= 0 || /^PGRST/.test(code);
}

export function posCheckoutErrorText(error: LegacyValue): string {
  const code = runtimeFunction('String')(error && error.code || '');
  if (code === '40001') {
    return 'The menu changed while this sale was open. Review the updated prices before trying again.';
  }
  if (code === '42501') {
    return 'Your account cannot complete sales in this workspace.';
  }
  if (code === '23505') {
    return 'This retry ID belongs to different sale details. Check Recent sales before starting a new checkout.';
  }
  if (code === '55000') {
    return 'The register is not ready to accept sales. Ask an owner to check the POS setup.';
  }
  if (code === '22003' || code === '22023' || code === '23514') {
    return 'The sale details were rejected or exceed the supported range. Review the cart and payment, then try again.';
  }
  return 'The sale could not be completed. Nothing was cleared; review it and try again.';
}

export async function submitPosSale(): Promise<boolean> {
  if (
    runtimeValue<LegacyValue>('posCheckout').submitting ||
    !runtimeValue<LegacyValue>('session') ||
    !runtimeValue<LegacyValue>('session').user ||
    !runtimeValue<LegacyValue>('posContext').businessId
  ) {
    return false;
  }
  const validation = workspaceFunction('posCheckoutValidation')();
  if (!validation.valid) {
    runtimeValue<LegacyValue>('posCheckout').confirming = false;
    runtimeValue<LegacyValue>('posCheckout').error = validation.error;
    runtimeFunction('renderPos')();
    return false;
  }
  const record = runtimeValue<LegacyValue>('posCheckout').pending ||
    workspaceFunction('buildPosPendingSale')(validation);
  if (!runtimeValue<LegacyValue>('posCheckout').pending) {
    runtimeFunction('posSavePending')(record);
  }
  let generation = runtimeValue<LegacyValue>('posCheckoutSubmitGeneration');
  generation++;
  writeRuntimeBinding('posCheckoutSubmitGeneration', generation);
  const userId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('session').user.id || '',
  );
  const businessId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('posContext').businessId || '',
  );
  runtimeValue<LegacyValue>('posCheckout').confirming = false;
  runtimeValue<LegacyValue>('posCheckout').submitting = true;
  runtimeValue<LegacyValue>('posCheckout').error = '';
  runtimeFunction('renderPos')();
  try {
    const result = await runtimeValue<LegacyValue>('cloud').client.rpc(
      record.rpcName || 'pos_complete_sale',
      record.rpcArgs,
    );
    const rows = runtimeFunction('rpcRows')(result);
    if (
      !runtimeFunction('posSubmitRequestStillCurrent')(
        generation,
        userId,
        businessId,
      )
    ) {
      return false;
    }
    const receipt = rows[0];
    if (!receipt || !receipt.sale_id || !receipt.receipt_number) {
      const ErrorConstructor = runtimeValue<LegacyValue>('Error');
      throw new ErrorConstructor('Missing receipt response');
    }
    runtimeValue<LegacyValue>('posCheckout').submitting = false;
    runtimeFunction('posClearPending')();
    runtimeValue<LegacyValue>('posCheckout').cart = {};
    runtimeValue<LegacyValue>('posCheckout').catalogChanged = false;
    runtimeValue<LegacyValue>('posCheckout').paymentMethod = 'cash';
    runtimeValue<LegacyValue>('posCheckout').cashReceived = '';
    runtimeValue<LegacyValue>('posCheckout').referenceNumber = '';
    runtimeValue<LegacyValue>('posCheckout').confirming = false;
    runtimeValue<LegacyValue>('posCheckout').error = '';
    runtimeValue<LegacyValue>('posCheckout').notice = '';
    runtimeValue<LegacyValue>('posCheckout').lastReceipt = receipt;
    runtimeFunction('renderPos')();
    workspaceFunction('refreshPosAfterMutation')().catch(function () {});
    return true;
  } catch (error) {
    if (
      !runtimeFunction('posSubmitRequestStillCurrent')(
        generation,
        userId,
        businessId,
      )
    ) {
      return false;
    }
    runtimeValue<LegacyValue>('posCheckout').submitting = false;
    if (
      runtimeFunction('String')(
        (error as LegacyValue) && (error as LegacyValue).code || '',
      ) === '40001'
    ) {
      runtimeFunction('posClearPending')();
      runtimeValue<LegacyValue>('posCheckout').confirming = false;
      runtimeValue<LegacyValue>('posCheckout').catalogChanged = true;
      runtimeValue<LegacyValue>('posCheckout').error =
        workspaceFunction('posCheckoutErrorText')(error);
      runtimeFunction('renderPos')();
      workspaceFunction('refreshPosAfterMutation')().catch(function () {});
      return false;
    }
    if (!workspaceFunction('posDeterministicError')(error)) {
      runtimeValue<LegacyValue>('posCheckout').confirming = false;
      runtimeValue<LegacyValue>('posCheckout').notice =
        'The connection stopped before a receipt came back. Retry this exact sale safely—do not create a new sale.';
      runtimeValue<LegacyValue>('posCheckout').error = '';
      runtimeFunction('renderPos')();
      return false;
    }
    runtimeFunction('posClearPending')();
    runtimeValue<LegacyValue>('posCheckout').confirming = false;
    runtimeValue<LegacyValue>('posCheckout').error =
      workspaceFunction('posCheckoutErrorText')(error);
    runtimeFunction('renderPos')();
    return false;
  }
}
