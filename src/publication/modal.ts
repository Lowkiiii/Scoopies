import {
  readPublicationBinding,
  runtimeFunction,
  runtimeValue,
  writeRuntimeBinding,
  type LegacyFunction,
  type LegacyValue,
} from './bindings';

function livePublication(
  name: string,
  fallback: LegacyFunction,
): LegacyFunction {
  return readPublicationBinding<LegacyFunction>(name, fallback);
}

export function openPublishProductModal(id: LegacyValue): boolean {
  if (!runtimeFunction('posCanPublish')()) {
    runtimeFunction('alert')(
      'The POS workspace is not ready, or your account cannot publish products.',
    );
    return false;
  }
  if (runtimeValue<LegacyValue>('pendingRemote')) {
    runtimeFunction('consumePendingRemoteForCommit')(false);
  }
  const product = runtimeFunction('getById')(
    runtimeValue<LegacyValue>('state').products,
    id,
  );
  const validation = runtimeFunction('validateProductForPublish')(product);
  if (!validation.valid) {
    runtimeFunction('alert')(validation.error);
    runtimeFunction('renderProducts')();
    return false;
  }
  const record = runtimeValue<LegacyValue>('posContext').publications[
    runtimeFunction('String')(id)
  ] || null;
  writeRuntimeBinding('publishProductId', runtimeFunction('String')(id));
  writeRuntimeBinding('publishSnapshot', {
    productId: runtimeFunction('String')(id),
    sourceFingerprint: runtimeFunction('stableSerialize')(
      runtimeFunction('buildProductCostingSnapshot')(product, '').snapshot,
    ),
    expectedActiveVersionId:
      record && record.active_version_id
        ? runtimeFunction('String')(record.active_version_id)
        : null,
    categoryName: runtimeFunction('String')(
      record && record.category_name || 'Drinks',
    ),
    size: runtimeFunction('String')(record && record.size_snapshot || ''),
  });
  writeRuntimeBinding('publishSubmitting', false);
  writeRuntimeBinding('publishError', '');
  writeRuntimeBinding('publishNotice', '');
  writeRuntimeBinding('publishModalOpen', true);
  writeRuntimeBinding(
    'modalReturnFocus',
    runtimeValue<LegacyValue>('document').activeElement,
  );
  runtimeValue<LegacyValue>('document').getElementById('publishModal').hidden = false;
  runtimeFunction('refreshModalBodyClass')();
  livePublication('renderPublishProductModal', renderPublishProductModal)();
  runtimeFunction('focusSoon')('#publishCategory');
  return true;
}

export function closePublishProductModal(): boolean {
  if (runtimeValue<LegacyValue>('publishSubmitting')) return false;
  writeRuntimeBinding('publishModalOpen', false);
  writeRuntimeBinding('publishProductId', '');
  writeRuntimeBinding('publishSnapshot', null);
  writeRuntimeBinding('publishError', '');
  writeRuntimeBinding('publishNotice', '');
  runtimeValue<LegacyValue>('document').getElementById('publishModal').hidden = true;
  runtimeFunction('refreshModalBodyClass')();
  const target = runtimeValue<LegacyValue>('modalReturnFocus');
  writeRuntimeBinding('modalReturnFocus', null);
  runtimeFunction('setTimeout')(function () {
    if (
      target &&
      runtimeValue<LegacyValue>('document').contains(target)
    ) {
      target.focus();
    }
    runtimeFunction('applyPendingAfterModal')();
  }, 0);
  return true;
}

export function renderPublishProductModal(): void {
  if (
    !runtimeValue<LegacyValue>('publishModalOpen') ||
    !runtimeValue<LegacyValue>('publishSnapshot')
  ) {
    return;
  }
  const content = runtimeValue<LegacyValue>('document').getElementById(
    'publishModalContent',
  );
  const product = runtimeFunction('getById')(
    runtimeValue<LegacyValue>('state').products,
    runtimeValue<LegacyValue>('publishProductId'),
  );
  if (!content || !product) return;
  const record = runtimeValue<LegacyValue>('posContext').publications[
    runtimeFunction('String')(product.id)
  ] || null;
  const built = runtimeFunction('buildProductCostingSnapshot')(
    product,
    runtimeValue<LegacyValue>('publishSnapshot').size,
  );
  const totalCentavos =
    built.ingredientCostCentavos + built.packagingCostCentavos;
  const profitCentavos = built.sellingPriceCentavos - totalCentavos;
  const title = record ? 'Update POS product' : 'Publish product to POS';
  const action = record ? 'Publish update' : 'Publish to POS';
  const fieldDisabled = runtimeValue<LegacyValue>('publishSubmitting')
    ? ' disabled'
    : '';
  content.setAttribute(
    'aria-busy',
    runtimeValue<LegacyValue>('publishSubmitting') ? 'true' : 'false',
  );
  content.innerHTML =
    '<div class="modal-head"><div style="flex:1"><h2 id="publishModalTitle">' +
    runtimeFunction('escapeHtml')(title) +
    '</h2>' +
    '<p class="hint">Review the exact price and cost snapshot that the POS will use.</p></div>' +
    '<button class="modal-close" data-act="closePublishModal" aria-label="Close publish dialog"' +
    (runtimeValue<LegacyValue>('publishSubmitting') ? ' disabled' : '') +
    '>x</button></div>' +
    '<div class="grid2"><div><label class="fld" for="publishCategory">POS category</label>' +
    '<input id="publishCategory" data-publish-field="categoryName" maxlength="80" value="' +
    runtimeFunction('escapeHtml')(
      runtimeValue<LegacyValue>('publishSnapshot').categoryName,
    ) +
    '" placeholder="e.g. Matcha Drinks"' +
    fieldDisabled +
    '></div>' +
    '<div><label class="fld" for="publishSize">Size / variant (optional)</label>' +
    '<input id="publishSize" data-publish-field="size" maxlength="40" value="' +
    runtimeFunction('escapeHtml')(
      runtimeValue<LegacyValue>('publishSnapshot').size,
    ) +
    '" placeholder="e.g. 12 oz"' +
    fieldDisabled +
    '></div></div>' +
    '<div class="publish-summary">' +
    '<div class="metric"><div class="lbl">Selling price</div><div class="val">' +
    runtimeFunction('peso')(built.sellingPriceCentavos / 100) +
    '</div></div>' +
    '<div class="metric"><div class="lbl">Ingredient cost</div><div class="val">' +
    runtimeFunction('peso')(built.ingredientCostCentavos / 100) +
    '</div></div>' +
    '<div class="metric"><div class="lbl">Packaging cost</div><div class="val">' +
    runtimeFunction('peso')(built.packagingCostCentavos / 100) +
    '</div></div>' +
    '<div class="metric"><div class="lbl">Estimated gross profit</div><div class="val ' +
    (profitCentavos >= 0 ? 'good' : 'bad') +
    '">' +
    runtimeFunction('peso')(profitCentavos / 100) +
    '</div></div>' +
    '</div>' +
    '<div class="publish-note"><strong>This creates a frozen POS version.</strong> Later costing changes will not alter the live menu until you publish another update. Old sales keep their original price and cost.</div>' +
    (runtimeValue<LegacyValue>('publishSubmitting')
      ? '<div id="publishProgress" class="draft-saved-note" tabindex="-1" aria-live="polite">Publishing the reviewed version...</div>'
      : '') +
    '<div class="modal-error" aria-live="assertive">' +
    runtimeFunction('escapeHtml')(runtimeValue<LegacyValue>('publishError')) +
    '</div>' +
    (runtimeValue<LegacyValue>('publishNotice')
      ? '<div class="draft-saved-note">' +
        runtimeFunction('escapeHtml')(
          runtimeValue<LegacyValue>('publishNotice'),
        ) +
        '</div>'
      : '') +
    '<div class="modal-actions"><button class="btn secondary" data-act="closePublishModal"' +
    (runtimeValue<LegacyValue>('publishSubmitting') ? ' disabled' : '') +
    '>Cancel</button>' +
    '<button class="btn" data-act="publishProductToPos"' +
    (runtimeValue<LegacyValue>('publishSubmitting') ? ' disabled' : '') +
    '>' +
    (runtimeValue<LegacyValue>('publishSubmitting')
      ? 'Publishing...'
      : runtimeFunction('escapeHtml')(action)) +
    '</button></div>';
  if (runtimeValue<LegacyValue>('publishSubmitting')) {
    runtimeFunction('focusSoon')('#publishProgress');
  }
}
