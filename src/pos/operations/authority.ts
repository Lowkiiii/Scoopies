import {
  posFunction,
  runtimeFunction,
  runtimeValue,
  type LegacyValue,
} from '../bindings';

export function posStatusCanManage(status?: LegacyValue): boolean {
  status = status || runtimeValue<LegacyValue>('posCheckout').shiftStatus;
  return !!(
    status &&
    (
      status.can_view_costs ||
      status.can_open_training ||
      status.can_void_sales
    )
  );
}

export function posCanManageOperations(): boolean {
  if (
    runtimeValue<LegacyValue>('posCheckout').loaded &&
    runtimeValue<LegacyValue>('posCheckout').shiftStatus
  ) {
    return posFunction('posStatusCanManage')(
      runtimeValue<LegacyValue>('posCheckout').shiftStatus,
    );
  }
  return runtimeValue<LegacyValue>('posContext').role === 'owner' ||
    runtimeValue<LegacyValue>('posContext').role === 'manager';
}

export function posRoleLabel(): LegacyValue {
  if (
    runtimeValue<LegacyValue>('posCheckout').loaded &&
    runtimeValue<LegacyValue>('posCheckout').shiftStatus
  ) {
    if (
      !posFunction('posStatusCanManage')(
        runtimeValue<LegacyValue>('posCheckout').shiftStatus,
      )
    ) {
      return 'cashier';
    }
    if (
      runtimeValue<LegacyValue>('posContext').role !== 'owner' &&
      runtimeValue<LegacyValue>('posContext').role !== 'manager'
    ) {
      return 'manager';
    }
  }
  return runtimeValue<LegacyValue>('posContext').role || 'member';
}

export function posModeName(isTraining: LegacyValue): string {
  return isTraining ? 'Training' : 'Live';
}

export function posModeFromPending(): string {
  if (!runtimeValue<LegacyValue>('posCheckout').pending) return '';
  return runtimeValue<LegacyValue>('posCheckout').pending.rpcArgs &&
    runtimeValue<LegacyValue>('posCheckout').pending.rpcArgs.p_is_training ===
      true
    ? 'training'
    : 'live';
}

export function posOpsRequestStillCurrent(
  generation: LegacyValue,
  userId: LegacyValue,
  businessId: LegacyValue,
): boolean {
  return generation === runtimeValue<LegacyValue>('posOpsGeneration') &&
    !!runtimeValue<LegacyValue>('session') &&
    !!runtimeValue<LegacyValue>('session').user &&
    runtimeFunction('String')(
      runtimeValue<LegacyValue>('session').user.id || '',
    ) === runtimeFunction('String')(userId || '') &&
    runtimeFunction('String')(
      runtimeValue<LegacyValue>('posContext').businessId || '',
    ) === runtimeFunction('String')(businessId || '');
}

export function posOperationErrorText(
  error: LegacyValue,
  action: LegacyValue,
): string {
  const code = runtimeFunction('String')(error && error.code || '');
  if (code === 'P0002') {
    return 'That shift or sale was not found. Refresh the POS before trying again.';
  }
  if (code === '42501') {
    return 'Your account does not have permission for this ' + action + '.';
  }
  if (code === '55000') {
    return action === 'void'
      ? 'This sale cannot be voided because its shift is already closed.'
      : 'The register shift changed. Refresh before trying again.';
  }
  if (code === '23505') {
    return 'These details conflict with an operation already recorded. Refresh and review the server result.';
  }
  if (code === '22023' || code === '23514') {
    return 'Review the entered amounts and required details, then try again.';
  }
  return 'The connection stopped before the ' + action +
    ' result came back. The server will be checked before another attempt.';
}

export function posOperationDeterministic(error: LegacyValue): boolean {
  const code = runtimeFunction('String')(error && error.code || '');
  return [
    'P0002',
    '42501',
    '55000',
    '23505',
    '22003',
    '22023',
    '23514',
  ].indexOf(code) >= 0 || /^PGRST/.test(code);
}
