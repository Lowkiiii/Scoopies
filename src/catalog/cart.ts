import {
  catalogFunction,
  runtimeFunction,
  runtimeValue,
  writeRuntimeBinding,
  type LegacyValue,
} from './bindings';

export function posCartLines(): LegacyValue[] {
  return runtimeValue<LegacyValue>('Object').keys(
    runtimeValue<LegacyValue>('posCheckout').cart,
  ).map(function (id: string) {
    return runtimeValue<LegacyValue>('posCheckout').cart[id];
  }).filter(runtimeFunction('Boolean'));
}

export function posCatalogMatchaOptions(product: LegacyValue): LegacyValue[] {
  let options = product && product.matcha_upgrades;
  if (typeof options === 'string') {
    try {
      options = runtimeValue<LegacyValue>('JSON').parse(options);
    } catch (error) {
      options = [];
    }
  }
  return runtimeValue<LegacyValue>('Array').isArray(options)
    ? options.filter(function (option: LegacyValue) {
      return option &&
        option.id &&
        runtimeFunction('Number')(option.revision) > 0 &&
        runtimeFunction('Number')(option.surcharge_centavos) >= 0;
    }).sort(function (a: LegacyValue, b: LegacyValue) {
      return runtimeFunction('Number')(a.sort_order || 0) -
          runtimeFunction('Number')(b.sort_order || 0) ||
        runtimeFunction('String')(a.display_name || '').localeCompare(
          runtimeFunction('String')(b.display_name || ''),
        );
    })
    : [];
}

export function posVariantKey(
  productId: LegacyValue,
  productVersionId: LegacyValue,
  optionId: LegacyValue,
  optionRevision: LegacyValue,
): string {
  return [
    runtimeFunction('String')(productId || ''),
    runtimeFunction('String')(productVersionId || ''),
    runtimeFunction('String')(optionId || 'standard'),
    runtimeFunction('String')(
      optionRevision == null ? 'standard' : optionRevision,
    ),
  ].join('|');
}

export function posProductCartLines(productId: LegacyValue): LegacyValue[] {
  return catalogFunction('posCartLines')().filter(function (line: LegacyValue) {
    return runtimeFunction('String')(line.productId || '') ===
      runtimeFunction('String')(productId || '');
  });
}

export function posProductCartQuantity(productId: LegacyValue): number {
  return catalogFunction('posProductCartLines')(productId).reduce(
    function (total: number, line: LegacyValue) {
      return total + (runtimeFunction('Number')(line.quantity) || 0);
    },
    0,
  );
}

export function posCartTotalCentavos(): number {
  return catalogFunction('posCartLines')().reduce(
    function (total: number, line: LegacyValue) {
      return total +
        (runtimeFunction('Number')(line.priceCentavos) || 0) *
        (runtimeFunction('Number')(line.quantity) || 0);
    },
    0,
  );
}

export function posCartUnits(): number {
  return catalogFunction('posCartLines')().reduce(
    function (total: number, line: LegacyValue) {
      return total + (runtimeFunction('Number')(line.quantity) || 0);
    },
    0,
  );
}

export function strictPesoCentavos(value: LegacyValue): number | null {
  const text = runtimeFunction('String')(value == null ? '' : value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const parts = text.split('.');
  const whole = runtimeFunction('Number')(parts[0]);
  const fraction = (parts[1] || '').padEnd(2, '0');
  const cents = whole * 100 + runtimeFunction('Number')(fraction || 0);
  return runtimeValue<LegacyValue>('Number').isSafeInteger(cents) &&
      cents >= 0 &&
      cents <= 100000000000
    ? cents
    : null;
}

export function posDrinkGroupKey(item?: LegacyValue): string {
  const text = (
    runtimeFunction('String')(item && item.product_name || '') + ' ' +
    runtimeFunction('String')(item && item.category_name || '')
  ).toLowerCase();
  return text.indexOf('hojicha') >= 0 ? 'hojicha' : 'matcha';
}

export function normalizePosCategory(): boolean {
  if (runtimeValue<LegacyValue>('posCheckout').category === 'all') return false;
  const exists = (runtimeValue<LegacyValue>('posCheckout').catalog || []).some(
    function (item: LegacyValue) {
      return catalogFunction('posDrinkGroupKey')(item) ===
        runtimeValue<LegacyValue>('posCheckout').category;
    },
  );
  if (exists) return false;
  runtimeValue<LegacyValue>('posCheckout').category = 'all';
  return true;
}

export function posLatestCatalogProduct(productId: LegacyValue): LegacyValue {
  return runtimeValue<LegacyValue>('posCheckout').catalog.find(
    function (item: LegacyValue) {
      return runtimeFunction('String')(item.product_id || '') ===
        runtimeFunction('String')(productId || '');
    },
  ) || null;
}

export function posLatestMatchaOption(
  product: LegacyValue,
  optionId: LegacyValue,
): LegacyValue {
  return catalogFunction('posCatalogMatchaOptions')(product).find(
    function (option: LegacyValue) {
      return runtimeFunction('String')(option.id || '') ===
        runtimeFunction('String')(optionId || '');
    },
  ) || null;
}

export function markPosCartAgainstCatalog(): boolean {
  let changed = false;
  catalogFunction('posCartLines')().forEach(function (line: LegacyValue) {
    const latest = catalogFunction('posLatestCatalogProduct')(line.productId);
    const option = line.matchaOptionId
      ? catalogFunction('posLatestMatchaOption')(latest, line.matchaOptionId)
      : null;
    line.latest = latest;
    line.stale = !latest ||
      runtimeFunction('String')(latest.active_version_id || '') !==
        runtimeFunction('String')(line.productVersionId || '') ||
      runtimeFunction('Number')(latest.selling_price_centavos || 0) !==
        runtimeFunction('Number')(
          line.basePriceCentavos == null
            ? line.priceCentavos
            : line.basePriceCentavos,
        ) ||
      runtimeFunction('String')(latest.product_name || 'Product') !==
        runtimeFunction('String')(line.name || 'Product') ||
      runtimeFunction('String')(latest.size_snapshot || '') !==
        runtimeFunction('String')(line.size || '') ||
      !!line.matchaOptionId &&
        (
          !option ||
          runtimeFunction('Number')(option.revision) !==
            runtimeFunction('Number')(line.matchaOptionRevision) ||
          runtimeFunction('Number')(option.surcharge_centavos || 0) !==
            runtimeFunction('Number')(line.matchaSurchargeCentavos || 0)
        );
    if (line.stale) changed = true;
  });
  if (changed) {
    runtimeValue<LegacyValue>('posCheckout').catalogChanged = true;
    runtimeValue<LegacyValue>('posCheckout').confirming = false;
  }
  return changed;
}

export function acceptPosCatalogChanges(): boolean {
  if (
    runtimeValue<LegacyValue>('posCheckout').pending ||
    runtimeValue<LegacyValue>('posCheckout').submitting ||
    runtimeValue<LegacyValue>('posCheckout').confirming
  ) {
    return false;
  }
  const next: LegacyValue = {};
  let removed = 0;
  let updated = 0;
  catalogFunction('posCartLines')().forEach(function (line: LegacyValue) {
    const latest = catalogFunction('posLatestCatalogProduct')(line.productId);
    const option = line.matchaOptionId
      ? catalogFunction('posLatestMatchaOption')(latest, line.matchaOptionId)
      : null;
    if (!latest) {
      removed++;
      return;
    }
    if (line.matchaOptionId && !option) {
      removed++;
      return;
    }
    const optionId = option ? runtimeFunction('String')(option.id) : '';
    const optionRevision = option
      ? runtimeFunction('Number')(option.revision)
      : null;
    const basePrice =
      runtimeFunction('Number')(latest.selling_price_centavos) || 0;
    const surcharge = option
      ? runtimeFunction('Number')(option.surcharge_centavos) || 0
      : 0;
    const key = catalogFunction('posVariantKey')(
      latest.product_id,
      latest.active_version_id,
      optionId,
      optionRevision,
    );
    if (
      runtimeFunction('String')(latest.active_version_id || '') !==
        runtimeFunction('String')(line.productVersionId || '') ||
      basePrice !== runtimeFunction('Number')(
        line.basePriceCentavos == null
          ? line.priceCentavos
          : line.basePriceCentavos,
      ) ||
      surcharge !==
        runtimeFunction('Number')(line.matchaSurchargeCentavos || 0) ||
      optionRevision !== line.matchaOptionRevision
    ) {
      updated++;
    }
    const rebuilt: LegacyValue = {
      key,
      productId: runtimeFunction('String')(latest.product_id),
      productVersionId: runtimeFunction('String')(latest.active_version_id),
      name: runtimeFunction('String')(latest.product_name || 'Product'),
      size: runtimeFunction('String')(latest.size_snapshot || ''),
      basePriceCentavos: basePrice,
      priceCentavos: basePrice + surcharge,
      quantity: runtimeFunction('Number')(line.quantity) || 1,
      matchaOptionId: optionId,
      matchaOptionRevision: optionRevision,
      matchaOptionCode: runtimeFunction('String')(option && option.code || ''),
      matchaOptionName: runtimeFunction('String')(
        option && option.display_name || '',
      ),
      matchaSurchargeCentavos: surcharge,
      stale: false,
      latest: null,
    };
    if (next[key]) {
      next[key].quantity = runtimeValue<LegacyValue>('Math').min(
        10000,
        next[key].quantity + rebuilt.quantity,
      );
    } else {
      next[key] = rebuilt;
    }
  });
  runtimeValue<LegacyValue>('posCheckout').cart = next;
  runtimeValue<LegacyValue>('posCheckout').catalogChanged = false;
  runtimeValue<LegacyValue>('posCheckout').error = '';
  runtimeValue<LegacyValue>('posCheckout').notice =
    (updated
      ? updated + ' price' + (updated === 1 ? ' was' : 's were') +
        ' updated. '
      : '') +
    (removed
      ? removed + ' unavailable item' + (removed === 1 ? ' was' : 's were') +
        ' removed.'
      : '');
  runtimeFunction('renderPos')();
  return true;
}

export function addPosProduct(productId: LegacyValue): boolean {
  if (
    runtimeValue<LegacyValue>('posCheckout').pending ||
    runtimeValue<LegacyValue>('posCheckout').submitting ||
    runtimeValue<LegacyValue>('posCheckout').confirming
  ) {
    return false;
  }
  const product = catalogFunction('posLatestCatalogProduct')(productId);
  if (!product) return false;
  const existing = catalogFunction('posProductCartLines')(productId);
  if (existing.some(function (line: LegacyValue) {
    return line.stale ||
      runtimeFunction('String')(line.productVersionId || '') !==
        runtimeFunction('String')(product.active_version_id || '');
  })) {
    runtimeValue<LegacyValue>('posCheckout').catalogChanged = true;
    runtimeValue<LegacyValue>('posCheckout').error =
      'This drink has a newer menu version. Review the cart update before adding more.';
    runtimeFunction('renderPos')();
    return false;
  }
  if (catalogFunction('posCatalogMatchaOptions')(product).length) {
    runtimeFunction('posOpenOpsModal')('productOptions', {
      productId: runtimeFunction('String')(product.product_id),
      selectedMatchaOptionId: '',
    });
    runtimeFunction('focusSoon')('#posMatchaOptionStandard');
    return true;
  }
  return catalogFunction('addPosProductVariant')(product, null);
}

export function addPosProductVariant(
  product: LegacyValue,
  option: LegacyValue,
): boolean {
  if (
    !product ||
    runtimeValue<LegacyValue>('posCheckout').pending ||
    runtimeValue<LegacyValue>('posCheckout').submitting ||
    runtimeValue<LegacyValue>('posCheckout').confirming
  ) {
    return false;
  }
  const optionId = option ? runtimeFunction('String')(option.id || '') : '';
  const optionRevision = option
    ? runtimeFunction('Number')(option.revision)
    : null;
  const key = catalogFunction('posVariantKey')(
    product.product_id,
    product.active_version_id,
    optionId,
    optionRevision,
  );
  const line = runtimeValue<LegacyValue>('posCheckout').cart[key];
  const basePrice =
    runtimeFunction('Number')(product.selling_price_centavos) || 0;
  const surcharge = option
    ? runtimeFunction('Number')(option.surcharge_centavos) || 0
    : 0;
  if (line) {
    line.quantity = runtimeValue<LegacyValue>('Math').min(
      10000,
      (runtimeFunction('Number')(line.quantity) || 0) + 1,
    );
  } else {
    runtimeValue<LegacyValue>('posCheckout').cart[key] = {
      key,
      productId: runtimeFunction('String')(product.product_id),
      productVersionId: runtimeFunction('String')(product.active_version_id),
      name: runtimeFunction('String')(product.product_name || 'Product'),
      size: runtimeFunction('String')(product.size_snapshot || ''),
      basePriceCentavos: basePrice,
      priceCentavos: basePrice + surcharge,
      quantity: 1,
      matchaOptionId: optionId,
      matchaOptionRevision: optionRevision,
      matchaOptionCode: runtimeFunction('String')(option && option.code || ''),
      matchaOptionName: runtimeFunction('String')(
        option && option.display_name || '',
      ),
      matchaSurchargeCentavos: surcharge,
      stale: false,
      latest: null,
    };
  }
  runtimeValue<LegacyValue>('posCheckout').lastReceipt = null;
  runtimeValue<LegacyValue>('posCheckout').error = '';
  runtimeValue<LegacyValue>('posCheckout').notice = '';
  runtimeFunction('renderPos')();
  return true;
}

export function confirmPosProductOption(): boolean {
  if (
    !runtimeValue<LegacyValue>('posOpsModal').open ||
    runtimeValue<LegacyValue>('posOpsModal').type !== 'productOptions' ||
    runtimeValue<LegacyValue>('posOpsModal').submitting
  ) {
    return false;
  }
  const product = catalogFunction('posLatestCatalogProduct')(
    runtimeValue<LegacyValue>('posOpsModal').productId,
  );
  if (!product) {
    runtimeValue<LegacyValue>('posOpsModal').error =
      'This drink is no longer available. Refresh the menu.';
    runtimeFunction('renderPosOpsModal')();
    return false;
  }
  const optionId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('posOpsModal').selectedMatchaOptionId || '',
  );
  const option = optionId
    ? catalogFunction('posLatestMatchaOption')(product, optionId)
    : null;
  if (optionId && !option) {
    runtimeValue<LegacyValue>('posOpsModal').error =
      'That matcha upgrade changed. Close this window and try again.';
    runtimeFunction('renderPosOpsModal')();
    return false;
  }
  const productId = runtimeFunction('String')(product.product_id);
  if (!catalogFunction('addPosProductVariant')(product, option)) return false;
  writeRuntimeBinding('posOpsModalReturnFocus', null);
  runtimeFunction('posCloseOpsModal')(true);
  runtimeFunction('renderPos')();
  runtimeFunction('focusSoon')(
    '[data-act="addPosProduct"][data-id="' + productId + '"]',
  );
  return true;
}

export function changePosQuantity(
  lineKey: LegacyValue,
  delta: LegacyValue,
): boolean {
  if (
    runtimeValue<LegacyValue>('posCheckout').pending ||
    runtimeValue<LegacyValue>('posCheckout').submitting ||
    runtimeValue<LegacyValue>('posCheckout').confirming
  ) {
    return false;
  }
  const key = runtimeFunction('String')(lineKey || '');
  const line = runtimeValue<LegacyValue>('posCheckout').cart[key];
  if (!line) return false;
  line.quantity = (runtimeFunction('Number')(line.quantity) || 0) + delta;
  if (line.quantity <= 0) {
    delete runtimeValue<LegacyValue>('posCheckout').cart[key];
  } else {
    line.quantity = runtimeValue<LegacyValue>('Math').min(10000, line.quantity);
  }
  runtimeValue<LegacyValue>('posCheckout').error = '';
  runtimeValue<LegacyValue>('posCheckout').notice = '';
  runtimeFunction('renderPos')();
  return true;
}

export function removePosLine(lineKey: LegacyValue): boolean {
  if (
    runtimeValue<LegacyValue>('posCheckout').pending ||
    runtimeValue<LegacyValue>('posCheckout').submitting ||
    runtimeValue<LegacyValue>('posCheckout').confirming ||
    runtimeValue<LegacyValue>('posOpsModal').open
  ) {
    return false;
  }
  const key = runtimeFunction('String')(lineKey || '');
  const line = runtimeValue<LegacyValue>('posCheckout').cart[key];
  if (!line) return false;
  const label = runtimeFunction('String')(line.name || 'this drink') +
    (line.matchaOptionName ? ' with ' + line.matchaOptionName : '');
  runtimeFunction('posOpenOpsModal')('cartConfirm', {
    cartAction: 'removeLine',
    cartProductId: key,
    cartProductName: label,
    cartQuantity: runtimeFunction('Number')(line.quantity) || 1,
  });
  runtimeFunction('focusSoon')('#posCartConfirmCancel');
  return true;
}

export function clearPosCart(): boolean {
  if (
    runtimeValue<LegacyValue>('posCheckout').pending ||
    runtimeValue<LegacyValue>('posCheckout').submitting ||
    runtimeValue<LegacyValue>('posCheckout').confirming ||
    runtimeValue<LegacyValue>('posOpsModal').open
  ) {
    return false;
  }
  const lines = catalogFunction('posCartLines')();
  if (!lines.length) return false;
  const quantity = lines.reduce(function (
    total: number,
    line: LegacyValue,
  ) {
    return total + (runtimeFunction('Number')(line.quantity) || 0);
  }, 0);
  runtimeFunction('posOpenOpsModal')('cartConfirm', {
    cartAction: 'clear',
    cartQuantity: quantity,
  });
  runtimeFunction('focusSoon')('#posCartConfirmCancel');
  return true;
}

export function confirmPosCartAction(): boolean {
  if (
    !runtimeValue<LegacyValue>('posOpsModal').open ||
    runtimeValue<LegacyValue>('posOpsModal').type !== 'cartConfirm' ||
    runtimeValue<LegacyValue>('posCheckout').pending ||
    runtimeValue<LegacyValue>('posCheckout').submitting ||
    runtimeValue<LegacyValue>('posCheckout').confirming
  ) {
    return false;
  }
  const action = runtimeValue<LegacyValue>('posOpsModal').cartAction;
  const key = runtimeFunction('String')(
    runtimeValue<LegacyValue>('posOpsModal').cartProductId || '',
  );
  if (action === 'removeLine') {
    if (!runtimeValue<LegacyValue>('posCheckout').cart[key]) {
      runtimeFunction('posCloseOpsModal')(true);
      runtimeFunction('renderPos')();
      return false;
    }
    delete runtimeValue<LegacyValue>('posCheckout').cart[key];
  } else if (action === 'clear') {
    if (!catalogFunction('posCartLines')().length) {
      runtimeFunction('posCloseOpsModal')(true);
      runtimeFunction('renderPos')();
      return false;
    }
    runtimeValue<LegacyValue>('posCheckout').cart = {};
    runtimeValue<LegacyValue>('posCheckout').catalogChanged = false;
  } else {
    return false;
  }
  runtimeValue<LegacyValue>('posCheckout').error = '';
  runtimeValue<LegacyValue>('posCheckout').notice = '';
  writeRuntimeBinding('posOpsModalReturnFocus', null);
  runtimeFunction('posCloseOpsModal')(true);
  runtimeFunction('renderPos')();
  runtimeFunction('focusSoon')('#posCartPanel');
  return true;
}
