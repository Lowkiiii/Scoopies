import {
  runtimeFunction,
  runtimeValue,
  workspaceFunction,
  type LegacyValue,
} from './bindings';

export function posCheckoutValidation(): LegacyValue {
  if (runtimeValue<LegacyValue>('posCheckout').pending) {
    return {
      valid: true,
      error: '',
      cashCentavos:
        runtimeValue<LegacyValue>('posCheckout').pending.rpcArgs
          .p_cash_tendered_centavos,
    };
  }
  const shift = runtimeValue<LegacyValue>('posCheckout').shift;
  if (runtimeValue<LegacyValue>('posCheckout').refreshing) {
    return {
      valid: false,
      error:
        'The register is syncing. Wait for the latest shift check before confirming payment.',
    };
  }
  if (runtimeValue<LegacyValue>('posCheckout').checkoutRefreshRequired) {
    return {
      valid: false,
      error: 'Refresh the register before confirming payment.',
    };
  }
  if (runtimeValue<LegacyValue>('posCheckout').shiftLoading) {
    return {
      valid: false,
      error: 'The register shift is still loading.',
    };
  }
  if (!shift || !shift.shift_id) {
    return {
      valid: false,
      error: 'Open a shift before accepting a payment.',
    };
  }
  if (
    runtimeFunction('String')(shift.shift_id || '') !==
      runtimeFunction('String')(
        runtimeValue<LegacyValue>('posCheckout').shiftStatus &&
          runtimeValue<LegacyValue>('posCheckout').shiftStatus.shift_id || '',
      )
  ) {
    return {
      valid: false,
      error: 'The active shift changed. Refresh before accepting payment.',
    };
  }
  const lines = runtimeFunction('posCartLines')();
  const total = runtimeFunction('posCartTotalCentavos')();
  if (!lines.length) {
    return {
      valid: false,
      error: 'Add at least one product to the sale.',
    };
  }
  if (
    runtimeValue<LegacyValue>('posCheckout').catalogChanged ||
    lines.some(function (line: LegacyValue) {
      return line.stale;
    })
  ) {
    return {
      valid: false,
      error: 'The menu changed. Review the cart before charging the customer.',
    };
  }
  if (
    !runtimeValue<LegacyValue>('Number').isSafeInteger(total) ||
    total <= 0 ||
    total > 100000000000
  ) {
    return {
      valid: false,
      error: 'This order total is outside the supported range.',
    };
  }
  const reference = runtimeFunction('String')(
    runtimeValue<LegacyValue>('posCheckout').referenceNumber || '',
  ).trim();
  if (reference.length > 120) {
    return {
      valid: false,
      error: 'Keep the payment reference under 120 characters.',
    };
  }
  if (runtimeValue<LegacyValue>('posCheckout').paymentMethod === 'cash') {
    const cash = runtimeFunction('strictPesoCentavos')(
      runtimeValue<LegacyValue>('posCheckout').cashReceived,
    );
    if (cash == null) {
      return {
        valid: false,
        error: 'Enter cash received using pesos and up to 2 decimal places.',
      };
    }
    if (cash < total) {
      return {
        valid: false,
        error: 'Cash received is less than the order total.',
      };
    }
    return { valid: true, error: '', cashCentavos: cash };
  }
  if (
    runtimeValue<LegacyValue>('posCheckout').paymentMethod !== 'gcash' &&
    runtimeValue<LegacyValue>('posCheckout').paymentMethod !== 'gotyme'
  ) {
    return { valid: false, error: 'Choose Cash, GCash, or GoTyme.' };
  }
  return { valid: true, error: '', cashCentavos: null };
}

export function buildPosPendingSale(validation: LegacyValue): LegacyValue {
  const userId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('session') &&
      runtimeValue<LegacyValue>('session').user &&
      runtimeValue<LegacyValue>('session').user.id || '',
  );
  const businessId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('posContext').businessId || '',
  );
  const items = runtimeFunction('posCartLines')().map(
    function (line: LegacyValue) {
      return {
        product_id: runtimeFunction('String')(line.productId),
        product_version_id: runtimeFunction('String')(line.productVersionId),
        quantity: runtimeFunction('Number')(line.quantity),
        matcha_option_id: line.matchaOptionId
          ? runtimeFunction('String')(line.matchaOptionId)
          : null,
        matcha_option_revision: line.matchaOptionId
          ? runtimeFunction('Number')(line.matchaOptionRevision)
          : null,
      };
    },
  );
  const args = {
    p_business_id: businessId,
    p_shift_id: runtimeFunction('String')(
      runtimeValue<LegacyValue>('posCheckout').shift.shift_id,
    ),
    p_is_training:
      !!runtimeValue<LegacyValue>('posCheckout').shift.is_training,
    p_client_sale_id: runtimeFunction('posUuid')(),
    p_items: items,
    p_payment_method:
      runtimeValue<LegacyValue>('posCheckout').paymentMethod,
    p_cash_tendered_centavos:
      runtimeValue<LegacyValue>('posCheckout').paymentMethod === 'cash'
        ? validation.cashCentavos
        : null,
    p_reference_number:
      runtimeFunction('String')(
        runtimeValue<LegacyValue>('posCheckout').referenceNumber || '',
      ).trim() || null,
    p_note: null,
  };
  return {
    schemaVersion: 3,
    rpcName: 'pos_complete_shift_sale_v3',
    userId: userId,
    businessId: businessId,
    createdAt: new (runtimeValue<LegacyValue>('Date'))().toISOString(),
    rpcArgs: args,
    cartSnapshot: runtimeFunction('posCartLines')().map(
      function (line: LegacyValue) {
        return {
          key: line.key,
          productId: line.productId,
          productVersionId: line.productVersionId,
          name: line.name,
          size: line.size,
          basePriceCentavos: line.basePriceCentavos,
          priceCentavos: line.priceCentavos,
          quantity: line.quantity,
          matchaOptionId: line.matchaOptionId || '',
          matchaOptionRevision: line.matchaOptionRevision,
          matchaOptionCode: line.matchaOptionCode || '',
          matchaOptionName: line.matchaOptionName || '',
          matchaSurchargeCentavos: line.matchaSurchargeCentavos || 0,
        };
      },
    ),
  };
}

export function reviewPosSale(): LegacyValue {
  if (runtimeValue<LegacyValue>('posCheckout').pending) {
    return workspaceFunction('submitPosSale')();
  }
  if (runtimeValue<LegacyValue>('posCheckout').submitting) return false;
  const validation = workspaceFunction('posCheckoutValidation')();
  if (!validation.valid) {
    runtimeValue<LegacyValue>('posCheckout').confirming = false;
    runtimeValue<LegacyValue>('posCheckout').error = validation.error;
    runtimeFunction('renderPos')();
    return false;
  }
  runtimeValue<LegacyValue>('posCheckout').confirming = true;
  runtimeValue<LegacyValue>('posCheckout').error = '';
  runtimeFunction('renderPos')();
  return true;
}

export function cancelPosConfirmation(): boolean {
  if (
    runtimeValue<LegacyValue>('posCheckout').submitting ||
    runtimeValue<LegacyValue>('posCheckout').pending
  ) {
    return false;
  }
  runtimeValue<LegacyValue>('posCheckout').confirming = false;
  runtimeFunction('renderPos')();
  return true;
}
