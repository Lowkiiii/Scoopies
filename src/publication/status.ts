import {
  readPublicationBinding,
  runtimeFunction,
  runtimeValue,
  type LegacyFunction,
  type LegacyValue,
} from './bindings';

function livePublication(
  name: string,
  fallback: LegacyFunction,
): LegacyFunction {
  return readPublicationBinding<LegacyFunction>(name, fallback);
}

export function publicationStatusFor(product: LegacyValue): LegacyValue {
  const record = runtimeValue<LegacyValue>('posContext').publications[
    runtimeFunction('String')(product && product.id || '')
  ];
  const validation = runtimeFunction('validateProductForPublish')(product);
  if (record && record.archived_at) {
    return {
      key: 'archived',
      label: 'Archived in POS',
      detail: 'This POS item is archived.',
      record,
      validation,
    };
  }
  if (!validation.valid) {
    return {
      key: 'invalid',
      label: 'Not ready',
      detail: validation.error,
      record: record || null,
      validation,
    };
  }
  if (!record) {
    return {
      key: 'unpublished',
      label: 'Not in POS',
      detail: 'Publish when this product is ready to sell.',
      record: null,
      validation,
    };
  }
  const built = runtimeFunction('buildProductCostingSnapshot')(
    product,
    record.size_snapshot || '',
  );
  const unchanged =
    runtimeFunction('String')(record.name_snapshot || '') ===
      runtimeFunction('String')(product.name || '').trim() &&
    runtimeFunction('String')(record.source_costing_recipe_id || '') ===
      runtimeFunction('String')(product.recipeId || '') &&
    runtimeFunction('Number')(record.selling_price_centavos) ===
      built.sellingPriceCentavos &&
    runtimeFunction('Number')(record.ingredient_cost_centavos) ===
      built.ingredientCostCentavos &&
    runtimeFunction('Number')(record.packaging_cost_centavos) ===
      built.packagingCostCentavos &&
    runtimeFunction('stableSerialize')(record.costing_snapshot || {}) ===
      runtimeFunction('stableSerialize')(built.snapshot);
  if (unchanged) {
    const when = record.published_at
      ? new (runtimeValue<LegacyValue>('Date'))(record.published_at).toLocaleString(
          'en-PH',
          { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
        )
      : '';
    if (record.available === false) {
      return {
        key: 'unavailable',
        label: 'Published v' + record.version_number + ' · unavailable',
        detail: 'This version is saved but hidden from the cashier menu.',
        record,
        validation,
      };
    }
    return {
      key: 'published',
      label: 'Published v' + record.version_number,
      detail:
        (record.category_name || 'Uncategorized') +
        (when ? ' · ' + when : ''),
      record,
      validation,
    };
  }
  return {
    key: 'changes',
    label: 'Changes not published',
    detail: 'The POS still uses version ' + record.version_number + '.',
    record,
    validation,
  };
}

export function posPublicationHtml(product: LegacyValue): string {
  const stateInfo = livePublication(
    'publicationStatusFor',
    publicationStatusFor,
  )(product);
  let badgeClass = stateInfo.key === 'published'
    ? ' good'
    : (
        stateInfo.key === 'changes' || stateInfo.key === 'unavailable'
          ? ' warn'
          : (
              stateInfo.key === 'invalid' || stateInfo.key === 'archived'
                ? ' bad'
                : ''
            )
      );
  const readOnly = !!(
    runtimeValue<LegacyValue>('posContext').businessId &&
    runtimeValue<LegacyValue>('posContext').role !== 'owner' &&
    runtimeValue<LegacyValue>('posContext').role !== 'manager'
  );
  let button = '';
  if (runtimeValue<LegacyValue>('posContext').loading) {
    button = '<button class="btn small secondary" disabled>Checking POS...</button>';
  } else if (
    runtimeValue<LegacyValue>('posContext').error ||
    !runtimeValue<LegacyValue>('posContext').businessId
  ) {
    button = runtimeValue<LegacyValue>('session')
      ? '<button class="btn small secondary" data-act="retryPosContext">Retry POS</button>'
      : '<button class="btn small secondary" disabled>Sign in to publish</button>';
  } else if (!runtimeValue<LegacyValue>('costingCloudReady')) {
    button = '<button class="btn small secondary" disabled>Costing cloud unavailable</button>';
  } else if (!runtimeFunction('posCanPublish')()) {
    button = '<button class="btn small secondary" disabled>Owner / manager only</button>';
  } else if (stateInfo.key === 'archived') {
    button = '<button class="btn small secondary" disabled>Archived</button>';
  } else {
    const disabled = stateInfo.validation.valid ? '' : ' disabled';
    const text = stateInfo.record ? 'Update POS' : 'Publish to POS';
    button =
      '<button class="btn small" data-act="openPublishModal" data-id="' +
      runtimeFunction('escapeHtml')(product.id) +
      '"' +
      disabled +
      '>' +
      text +
      '</button>';
  }
  const label = readOnly
    ? 'POS managed by owner'
    : (
        runtimeValue<LegacyValue>('posContext').loading
          ? 'Checking POS'
          : (
              runtimeValue<LegacyValue>('posContext').error
                ? runtimeValue<LegacyValue>('posContext').error
                : stateInfo.label
            )
      );
  const detail = readOnly
    ? 'Publication details are available only to an owner or manager.'
    : (
        runtimeValue<LegacyValue>('posContext').loading
          ? 'Loading the shared menu status...'
          : (
              runtimeValue<LegacyValue>('posContext').error
                ? 'Costing still works; POS publishing is temporarily unavailable.'
                : (
                    !runtimeValue<LegacyValue>('costingCloudReady')
                      ? 'Refresh after the costing cloud reconnects before publishing.'
                      : stateInfo.detail
                  )
            )
      );
  const key = readOnly
    ? 'readonly'
    : (
        runtimeValue<LegacyValue>('posContext').loading
          ? 'loading'
          : (
              runtimeValue<LegacyValue>('posContext').error
                ? 'error'
                : stateInfo.key
            )
      );
  if (readOnly) badgeClass = '';
  return (
    '<div class="pos-publish-row" data-pos-status="' +
    runtimeFunction('escapeHtml')(key) +
    '"><div class="pos-publish-copy">' +
    '<div class="pos-publish-title"><span class="pos-state' +
    badgeClass +
    '">' +
    runtimeFunction('escapeHtml')(label) +
    '</span> Shared POS menu</div>' +
    '<div class="pos-publish-detail">' +
    runtimeFunction('escapeHtml')(detail) +
    '</div></div>' +
    button +
    '</div>'
  );
}
