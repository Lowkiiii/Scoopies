import {
  catalogFunction,
  runtimeFunction,
  runtimeValue,
  type LegacyValue,
} from './bindings';

export function posSubmitRequestStillCurrent(
  generation: LegacyValue,
  userId: LegacyValue,
  businessId: LegacyValue,
): boolean {
  return generation ===
      runtimeValue<LegacyValue>('posCheckoutSubmitGeneration') &&
    !!runtimeValue<LegacyValue>('session') &&
    !!runtimeValue<LegacyValue>('session').user &&
    runtimeFunction('String')(
      runtimeValue<LegacyValue>('session').user.id || '',
    ) ===
      runtimeFunction('String')(userId || '') &&
    runtimeFunction('String')(
      runtimeValue<LegacyValue>('posContext').businessId || '',
    ) === runtimeFunction('String')(businessId || '');
}

export function posPendingScope(
  userId: LegacyValue,
  businessId: LegacyValue,
): string {
  return runtimeFunction('String')(userId || '') + '|' +
    runtimeFunction('String')(businessId || '');
}

export function posPendingRecords(): LegacyValue {
  try {
    const saved = runtimeValue<LegacyValue>('JSON').parse(
      runtimeValue<LegacyValue>('localStorage').getItem(
        runtimeValue<LegacyValue>('POS_PENDING_KEY'),
      ),
    );
    if (!saved || typeof saved !== 'object') return {};
    if (saved.rpcArgs && saved.userId && saved.businessId) {
      const migrated: LegacyValue = {};
      migrated[catalogFunction('posPendingScope')(
        saved.userId,
        saved.businessId,
      )] = saved;
      return migrated;
    }
    return saved;
  } catch (error) {
    return {};
  }
}

export function posSavePending(record: LegacyValue): void {
  runtimeValue<LegacyValue>('posCheckout').pending = record;
  const records = catalogFunction('posPendingRecords')();
  records[catalogFunction('posPendingScope')(
    record.userId,
    record.businessId,
  )] = record;
  try {
    runtimeValue<LegacyValue>('localStorage').setItem(
      runtimeValue<LegacyValue>('POS_PENDING_KEY'),
      runtimeValue<LegacyValue>('JSON').stringify(records),
    );
  } catch (error) {}
}

export function posClearPending(): void {
  const record = runtimeValue<LegacyValue>('posCheckout').pending;
  const records = catalogFunction('posPendingRecords')();
  const userId = record && record.userId ||
    runtimeValue<LegacyValue>('session') &&
      runtimeValue<LegacyValue>('session').user &&
      runtimeValue<LegacyValue>('session').user.id || '';
  const businessId = record && record.businessId ||
    runtimeValue<LegacyValue>('posContext').businessId || '';
  delete records[catalogFunction('posPendingScope')(userId, businessId)];
  runtimeValue<LegacyValue>('posCheckout').pending = null;
  try {
    if (runtimeValue<LegacyValue>('Object').keys(records).length) {
      runtimeValue<LegacyValue>('localStorage').setItem(
        runtimeValue<LegacyValue>('POS_PENDING_KEY'),
        runtimeValue<LegacyValue>('JSON').stringify(records),
      );
    } else {
      runtimeValue<LegacyValue>('localStorage').removeItem(
        runtimeValue<LegacyValue>('POS_PENDING_KEY'),
      );
    }
  } catch (error) {}
}

export function posStoredPending(): LegacyValue {
  if (
    !runtimeValue<LegacyValue>('session') ||
    !runtimeValue<LegacyValue>('session').user ||
    !runtimeValue<LegacyValue>('posContext').businessId
  ) {
    return null;
  }
  const record = catalogFunction('posPendingRecords')()[
    catalogFunction('posPendingScope')(
      runtimeValue<LegacyValue>('session').user.id,
      runtimeValue<LegacyValue>('posContext').businessId,
    )
  ];
  return record &&
      record.rpcArgs &&
      runtimeValue<LegacyValue>('Array').isArray(record.cartSnapshot)
    ? record
    : null;
}

export function posRestorePending(): boolean {
  if (
    runtimeValue<LegacyValue>('posCheckout').pending ||
    !runtimeValue<LegacyValue>('session') ||
    !runtimeValue<LegacyValue>('session').user ||
    !runtimeValue<LegacyValue>('posContext').businessId
  ) {
    return false;
  }
  const record = catalogFunction('posStoredPending')();
  if (
    !record ||
    runtimeFunction('String')(record.userId || '') !==
      runtimeFunction('String')(
        runtimeValue<LegacyValue>('session').user.id || '',
      ) ||
    runtimeFunction('String')(record.businessId || '') !==
      runtimeFunction('String')(
        runtimeValue<LegacyValue>('posContext').businessId || '',
      )
  ) {
    return false;
  }
  const cart: LegacyValue = {};
  record.cartSnapshot.forEach(function (saved: LegacyValue) {
    if (
      !saved ||
      !saved.productId ||
      !saved.productVersionId ||
      !(runtimeFunction('Number')(saved.quantity) > 0)
    ) {
      return;
    }
    const optionId = saved.matchaOptionId
      ? runtimeFunction('String')(saved.matchaOptionId)
      : '';
    const optionRevision = saved.matchaOptionRevision == null
      ? null
      : runtimeFunction('Number')(saved.matchaOptionRevision);
    const key = runtimeFunction('Number')(record.schemaVersion) >= 3
      ? catalogFunction('posVariantKey')(
        saved.productId,
        saved.productVersionId,
        optionId,
        optionRevision,
      )
      : runtimeFunction('String')(saved.productId);
    cart[key] = {
      key,
      productId: runtimeFunction('String')(saved.productId),
      productVersionId: runtimeFunction('String')(saved.productVersionId),
      name: runtimeFunction('String')(saved.name || 'Product'),
      size: runtimeFunction('String')(saved.size || ''),
      basePriceCentavos: runtimeFunction('Number')(
        saved.basePriceCentavos == null
          ? saved.priceCentavos
          : saved.basePriceCentavos,
      ) || 0,
      priceCentavos: runtimeFunction('Number')(saved.priceCentavos) || 0,
      quantity: runtimeFunction('Number')(saved.quantity) || 1,
      matchaOptionId: optionId,
      matchaOptionRevision: optionRevision,
      matchaOptionCode: runtimeFunction('String')(
        saved.matchaOptionCode || '',
      ),
      matchaOptionName: runtimeFunction('String')(
        saved.matchaOptionName || '',
      ),
      matchaSurchargeCentavos:
        runtimeFunction('Number')(saved.matchaSurchargeCentavos) || 0,
      stale: false,
      latest: null,
    };
  });
  if (!runtimeValue<LegacyValue>('Object').keys(cart).length) return false;
  runtimeValue<LegacyValue>('posCheckout').cart = cart;
  runtimeValue<LegacyValue>('posCheckout').pending = record;
  runtimeValue<LegacyValue>('posCheckout').paymentMethod =
    runtimeFunction('String')(record.rpcArgs.p_payment_method || 'cash');
  runtimeValue<LegacyValue>('posCheckout').cashReceived =
    record.rpcArgs.p_cash_tendered_centavos == null
      ? ''
      : (
        runtimeFunction('Number')(
          record.rpcArgs.p_cash_tendered_centavos,
        ) / 100
      ).toFixed(2);
  runtimeValue<LegacyValue>('posCheckout').referenceNumber =
    runtimeFunction('String')(record.rpcArgs.p_reference_number || '');
  if (record.rpcArgs.p_is_training === true) {
    runtimeValue<LegacyValue>('posCheckout').reportMode = 'training';
  }
  runtimeValue<LegacyValue>('posCheckout').notice =
    'A sale may have reached the server before the connection stopped. Retry the exact same sale to safely get its receipt.';
  catalogFunction('markPosCartAgainstCatalog')();
  return true;
}
