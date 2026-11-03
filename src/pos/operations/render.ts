import {
  posFunction,
  runtimeFunction,
  runtimeValue,
  type LegacyValue,
} from '../bindings';

function checkout(): LegacyValue {
  return runtimeValue<LegacyValue>('posCheckout');
}

export function renderPosOpsModal(): void {
  const modalElement = runtimeValue<LegacyValue>('document').getElementById('posOpsModal');
  const content = runtimeValue<LegacyValue>('document').getElementById('posOpsModalContent');
  if (!modalElement || !content) return;
  const ops = runtimeValue<LegacyValue>('posOpsModal');
  modalElement.hidden = !ops.open;
  if (!ops.open) return;
  const panel = modalElement.querySelector('.modal');
  const cartConfirm = ops.type === 'cartConfirm';
  if (panel) {
    panel.classList.toggle('small', ops.type === 'openShift' || ops.type === 'voidSale' || ops.type === 'productOptions' || cartConfirm);
    if (cartConfirm) panel.setAttribute('aria-describedby', 'posCartConfirmDescription');
    else panel.removeAttribute('aria-describedby');
  }
  const verificationBlocked = posFunction('posOpsActionBlocked')();
  const disabled = ops.submitting || verificationBlocked ? ' disabled' : '';
  const frozen = ops.submitting || ops.uncertain ? ' disabled' : '';
  const close = '<button class="modal-close" data-act="closePosOpsModal" aria-label="Close dialog"' + (ops.submitting || ops.uncertain ? ' disabled' : '') + '>x</button>';
  if (ops.type === 'productOptions') {
    const optionProduct = runtimeFunction('posLatestCatalogProduct')(ops.productId);
    const matchaOptions = runtimeFunction('posCatalogMatchaOptions')(optionProduct);
    if (!optionProduct) {
      content.innerHTML = '<div class="modal-head"><h2 id="posOpsModalTitle">Drink unavailable</h2>' + close + '</div><div class="note">Refresh the menu and try again.</div>';
      return;
    }
    let selectedId = runtimeFunction('String')(ops.selectedMatchaOptionId || '');
    let selectedOption = selectedId ? runtimeFunction('posLatestMatchaOption')(optionProduct, selectedId) : null;
    if (selectedId && !selectedOption) {
      selectedId = '';
      ops.selectedMatchaOptionId = '';
    }
    let optionRows = '<label class="pos-upgrade-option"><input id="posMatchaOptionStandard" type="radio" name="posMatchaOption" value=""' + (!selectedId ? ' checked' : '') + '><span><strong>Regular matcha</strong><small>Included</small></span><b>+\u20B10</b></label>';
    matchaOptions.forEach(function (option: LegacyValue) {
      const id = runtimeFunction('String')(option.id || '');
      const surcharge = runtimeFunction('Number')(option.surcharge_centavos) || 0;
      optionRows += '<label class="pos-upgrade-option"><input type="radio" name="posMatchaOption" value="' + runtimeFunction('escapeHtml')(id) + '"' + (selectedId === id ? ' checked' : '') + '><span><strong>' + runtimeFunction('escapeHtml')(option.display_name || option.code || 'Matcha upgrade') + '</strong><small>Premium powder upgrade</small></span><b>+' + runtimeFunction('peso')(surcharge / 100) + '</b></label>';
    });
    const optionTotal = runtimeFunction('Number')(optionProduct.selling_price_centavos || 0) + runtimeFunction('Number')(selectedOption && selectedOption.surcharge_centavos || 0);
    content.innerHTML = '<div class="modal-head"><div><h2 id="posOpsModalTitle">Customize ' + runtimeFunction('escapeHtml')(optionProduct.product_name || 'drink') + '</h2><p class="hint">Choose the matcha powder for this cup.</p></div>' + close + '</div>' + runtimeFunction('posDrinkImageHtml')(optionProduct, 'large') +
      '<fieldset class="pos-upgrade-list"><legend>Matcha powder</legend>' + optionRows + '</fieldset>' + (!matchaOptions.length ? '<div class="note">No premium matcha upgrades are configured for this drink.</div>' : '') +
      '<div class="pos-upgrade-total"><span>Drink total</span><strong>' + runtimeFunction('peso')(optionTotal / 100) + '</strong></div><p class="hint">Upgrade revenue is recorded on the receipt. Estimated profit still uses the base recipe cost until an exact premium-powder cost is configured.</p>' +
      '<div class="pos-error" aria-live="assertive">' + runtimeFunction('escapeHtml')(ops.error) + '</div><div class="modal-actions"><button class="btn secondary" data-act="closePosOpsModal">Cancel</button><button class="btn" data-act="confirmPosProductOption">Add to order \u00B7 ' + runtimeFunction('peso')(optionTotal / 100) + '</button></div>';
  } else if (ops.type === 'manageDrinks') {
    const photoEditor = runtimeFunction('posCurrentDrinkImageEditor')();
    const removeMedia = ops.mediaRemoveProductId ? runtimeFunction('posMediaRow')(ops.mediaRemoveProductId) : null;
    if (photoEditor) {
      const editorDisabled = photoEditor.loading || ops.submitting ? ' disabled' : '';
      const editorClose = '<button class="modal-close" data-act="cancelPosDrinkImageEditor" aria-label="Cancel photo adjustment"' + (ops.submitting ? ' disabled' : '') + '>x</button>';
      content.innerHTML = '<div class="modal-head"><div><h2 id="posOpsModalTitle">Adjust ' + runtimeFunction('escapeHtml')(photoEditor.productName) + ' photo</h2><p class="hint">Frame the drink exactly as it will appear on the POS card. Nothing is uploaded until you press Save photo.</p></div>' + editorClose + '</div>' + (
        photoEditor.loading ? '<div class="pos-loading" role="status">Preparing photo preview\u2026</div>' :
        '<div class="pos-photo-editor"><div id="posPhotoEditorFrame" class="pos-photo-editor-frame"><canvas id="posPhotoCropCanvas" class="pos-photo-editor-canvas" width="1200" height="900" tabindex="0" role="group" aria-roledescription="photo crop" aria-label="Four by three crop preview. Drag or use arrow keys to reposition the photo." aria-describedby="posPhotoEditorHelp"></canvas><span class="pos-photo-editor-grid" aria-hidden="true"></span></div>' +
        '<p id="posPhotoEditorHelp" class="pos-photo-editor-help">Drag to reposition. Use the slider or + and \u2212 to zoom. Arrow keys move the photo; 0 resets the crop.</p>' +
        '<div class="pos-photo-zoom"><button type="button" data-act="adjustPosDrinkImageZoom" data-delta="-0.1" aria-label="Zoom out"' + editorDisabled + '>\u2212</button><div class="pos-photo-zoom-control"><div class="pos-photo-zoom-label"><span id="posPhotoZoomLabel">Zoom</span><output id="posPhotoZoomValue">' + runtimeValue<LegacyValue>('Math').round(photoEditor.zoom * 100) + '%</output></div><input id="posPhotoZoom" type="range" min="1" max="4" step="0.01" value="' + photoEditor.zoom + '" aria-labelledby="posPhotoZoomLabel" aria-valuetext="' + runtimeValue<LegacyValue>('Math').round(photoEditor.zoom * 100) + ' percent"' + editorDisabled + '></div><button type="button" data-act="adjustPosDrinkImageZoom" data-delta="0.1" aria-label="Zoom in"' + editorDisabled + '>+</button></div>' +
        '<div class="pos-photo-editor-tools"><button type="button" class="btn small secondary" data-act="resetPosDrinkImageEditor"' + editorDisabled + '>Reset crop</button></div></div>') +
        (ops.notice ? '<div class="publish-note" role="status">' + runtimeFunction('escapeHtml')(ops.notice) + '</div>' : '') + '<div class="pos-error" aria-live="assertive">' + runtimeFunction('escapeHtml')(ops.error) + '</div><div class="modal-actions"><button class="btn secondary" data-act="cancelPosDrinkImageEditor"' + (ops.submitting ? ' disabled' : '') + '>Cancel</button><button class="btn" data-act="savePosDrinkImageEditor"' + editorDisabled + '>' + (ops.submitting ? 'Saving\u2026' : 'Save photo') + '</button></div>';
      if (!photoEditor.loading) runtimeFunction('drawPosDrinkImageEditor')();
    } else if (removeMedia) {
      content.innerHTML = '<div class="modal-head"><div><h2 id="posOpsModalTitle">Remove drink photo?</h2><p class="hint">' + runtimeFunction('escapeHtml')(removeMedia.product_name || 'Drink') + '</p></div>' + close + '</div><div class="pos-media-remove-confirm">' + runtimeFunction('posDrinkImageHtml')(removeMedia, 'large') + '<p>The drink stays published. Only its menu photo will be removed.</p></div>' +
        '<div class="pos-error">' + runtimeFunction('escapeHtml')(ops.error) + '</div><div class="modal-actions"><button id="posCancelRemoveImage" class="btn secondary" data-act="cancelRemovePosDrinkImage"' + frozen + '>Keep photo</button><button class="btn danger" data-act="confirmRemovePosDrinkImage"' + frozen + '>' + (ops.submitting ? 'Removing\u2026' : 'Remove photo') + '</button></div>';
    } else {
      const mediaRows = (ops.mediaRows || []).map(function (row: LegacyValue) {
        const productId = runtimeFunction('String')(row.product_id || '');
        const busy = ops.submitting && runtimeFunction('String')(ops.mediaProductId || '') === productId;
        const hasImage = !!row.image_object_path;
        return '<div class="pos-media-row">' + runtimeFunction('posDrinkImageHtml')(row, 'thumb') + '<div class="pos-media-copy"><strong>' + runtimeFunction('escapeHtml')(row.product_name || 'Drink') + '</strong><small>' + runtimeFunction('escapeHtml')(row.size_snapshot || '') + (row.available === false ? ' \u00B7 Hidden from POS' : '') + '</small></div><div class="pos-media-actions"><label class="btn small secondary' + (ops.submitting ? ' disabled' : '') + '">' + (busy ? 'Saving\u2026' : (hasImage ? 'Change photo' : 'Choose photo')) + '<input type="file" accept="image/jpeg,image/png,image/webp" data-pos-image-product="' + runtimeFunction('escapeHtml')(productId) + '"' + (ops.submitting ? ' disabled' : '') + '></label>' + (hasImage ? '<button class="btn small danger" data-act="requestRemovePosDrinkImage" data-id="' + runtimeFunction('escapeHtml')(productId) + '"' + (ops.submitting ? ' disabled' : '') + '>Remove photo</button>' : '') + '</div></div>';
      }).join('');
      content.innerHTML = '<div class="modal-head"><div><h2 id="posOpsModalTitle">Drink photos</h2><p class="hint">Choose a JPG, PNG, or WebP (max 5 MB), adjust the crop, then press Save photo. It will be shared on every POS device.</p></div>' + close + '</div>' +
        '<div id="posManageDrinksList" class="pos-media-list" tabindex="-1">' + (ops.mediaLoading ? '<div class="pos-loading">Loading drinks\u2026</div>' : (mediaRows || '<p class="empty">No published drinks yet.</p>')) + '</div>' +
        (ops.notice ? '<div class="publish-note">' + runtimeFunction('escapeHtml')(ops.notice) + '</div>' : '') + '<div class="pos-error" aria-live="assertive">' + runtimeFunction('escapeHtml')(ops.error) + '</div><div class="modal-actions"><button class="btn secondary" data-act="managePosMenu"' + frozen + '>Edit pricing &amp; publication</button><button class="btn" data-act="closePosOpsModal"' + frozen + '>Done</button></div>';
    }
  } else if (cartConfirm) {
    const clearing = ops.cartAction === 'clear';
    const cartQty = runtimeValue<LegacyValue>('Math').max(1, runtimeFunction('Number')(ops.cartQuantity) || 1);
    const cartTitle = clearing ? 'Clear current order?' : 'Remove this drink?';
    const cartSubject = clearing ? 'all ' + cartQty + ' drink' + (cartQty === 1 ? '' : 's') : cartQty + ' &times; ' + runtimeFunction('escapeHtml')(ops.cartProductName || 'this drink');
    content.innerHTML = '<div class="modal-head"><h2 id="posOpsModalTitle">' + cartTitle + '</h2>' + close + '</div><div class="pos-cart-confirm">' +
      '<div class="pos-cart-confirm-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"></path></svg></div>' +
      '<p id="posCartConfirmDescription" class="pos-cart-confirm-copy">Remove <strong>' + cartSubject + '</strong> from the current order?</p>' +
      '<p class="pos-cart-confirm-note">This only changes the order you are building. It does not void any completed sale.</p>' +
      '<div class="modal-actions"><button id="posCartConfirmCancel" class="btn secondary" data-act="closePosOpsModal">' + (clearing ? 'Keep order' : 'Keep drink') + '</button><button class="btn danger" data-act="confirmPosCartAction">' + (clearing ? 'Clear order' : 'Remove drink') + '</button></div></div>';
  } else if (ops.type === 'openShift') {
    const status = checkout().shiftStatus || {};
    const training = ops.mode === 'training';
    let modes = '<div class="pos-mode-choice"><button data-act="setPosOpenMode" data-mode="live" class="' + (!training ? 'active' : '') + '"' + (!status.can_open_live || ops.submitting || ops.uncertain || verificationBlocked ? ' disabled' : '') + '><strong>Live</strong><br><span class="hint">Real sales and money</span></button>';
    if (status.can_open_training) modes += '<button data-act="setPosOpenMode" data-mode="training" class="' + (training ? 'active' : '') + '"' + frozen + '><strong>Training</strong><br><span class="hint">Practice only</span></button>';
    modes += '</div>';
    content.innerHTML = '<div class="modal-head"><div><h2 id="posOpsModalTitle">Open shift</h2><p class="hint">' + runtimeFunction('escapeHtml')(status.register_name || 'Main register') + ' · choose before taking orders</p></div>' + close + '</div>' +
      modes + (training ? '<div class="pos-mode-banner"><span class="pos-mode-training">Training</span><span>No real sales or money. Training totals stay separate from Live.</span></div>' : '') +
      '<label class="fld" for="posOpeningCash">Starting cash in drawer (₱)</label><input id="posOpeningCash" inputmode="decimal" autocomplete="off" value="' + runtimeFunction('escapeHtml')(training ? '0.00' : ops.openingCash) + '"' + (training || ops.submitting || ops.uncertain || verificationBlocked ? ' disabled' : '') + '>' +
      '<p class="hint">' + (training ? 'Training always starts at ₱0.00.' : 'Count the drawer before opening. This becomes the cash-closing baseline.') + '</p>' +
      '<div class="pos-error" aria-live="assertive">' + runtimeFunction('escapeHtml')(ops.error) + '</div><div class="modal-actions"><button class="btn secondary" data-act="closePosOpsModal"' + frozen + '>Cancel</button><button class="btn" data-act="submitPosOpenShift"' + disabled + '>' + runtimeFunction('escapeHtml')(ops.submitting ? 'Checking…' : (ops.uncertain ? 'Retry same opening' : 'Open ' + posFunction('posModeName')(training) + ' shift')) + '</button></div>';
  } else if (ops.type === 'closeShift') {
    const shift = checkout().shift || {};
    const isTraining = ops.mode === 'training';
    if (ops.step === 'result') {
      content.innerHTML = '<div class="modal-head"><div><h2 id="posOpsModalTitle">Shift closed</h2></div>' + close + '</div>' + posFunction('posCloseResultHtml')(ops.result) +
        '<div class="modal-actions"><button class="btn secondary" data-act="openPosReport">View daily report</button><button class="btn" data-act="closePosOpsModal">Done</button></div>';
    } else if (ops.step === 'confirm') {
      const confirmText = isTraining ? 'Close this Training shift? Practice sales stay separate and fake tenders are reconciled automatically.' :
        'Close this Live shift with counted cash ' + runtimeFunction('peso')(runtimeFunction('Number')(runtimeFunction('strictPesoCentavos')(ops.countedCash) || 0) / 100) + ', verified GCash ' + runtimeFunction('peso')(runtimeFunction('Number')(runtimeFunction('strictPesoCentavos')(ops.verifiedGcash) || 0) / 100) + ', and verified GoTyme ' + runtimeFunction('peso')(runtimeFunction('Number')(runtimeFunction('strictPesoCentavos')(ops.verifiedGotyme) || 0) / 100) + '?';
      content.innerHTML = '<div class="modal-head"><div><h2 id="posOpsModalTitle">Confirm shift close</h2><p class="hint">' + runtimeFunction('escapeHtml')(shift.register_name || 'Register') + ' · mode is locked as ' + runtimeFunction('escapeHtml')(posFunction('posModeName')(isTraining)) + '</p></div>' + close + '</div>' +
        (isTraining ? '<div class="pos-mode-banner"><span class="pos-mode-training">Training</span><span>Nothing here affects Live totals or real cash.</span></div>' : '') +
        '<div class="note"><strong>' + runtimeFunction('escapeHtml')(confirmText) + '</strong></div><div class="pos-error">' + runtimeFunction('escapeHtml')(ops.error) + '</div>' +
        '<div class="modal-actions">' + (!isTraining ? '<button class="btn secondary" data-act="backPosCloseShift"' + frozen + '>Back</button>' : '<button class="btn secondary" data-act="closePosOpsModal"' + frozen + '>Cancel</button>') +
        '<button class="btn danger" data-act="submitPosCloseShift"' + disabled + '>' + runtimeFunction('escapeHtml')(ops.submitting ? 'Checking…' : (ops.uncertain ? (checkout().shift ? 'Retry exact close' : 'Recover close result') : 'Confirm close')) + '</button></div>';
    } else {
      content.innerHTML = '<div class="modal-head"><div><h2 id="posOpsModalTitle">Close Live shift</h2><p class="hint">' + runtimeFunction('escapeHtml')(shift.register_name || 'Register') + ' · enter what you actually counted</p></div>' + close + '</div>' +
        '<div class="note"><strong>Blind close:</strong> expected amounts stay hidden until the database closes the shift and returns the official variance.</div>' +
        '<div class="grid2"><div><label class="fld" for="posCountedCash">Cash counted (₱)</label><input id="posCountedCash" inputmode="decimal" value="' + runtimeFunction('escapeHtml')(ops.countedCash) + '"' + disabled + '></div>' +
        '<div><label class="fld" for="posVerifiedGcash">GCash verified (₱)</label><input id="posVerifiedGcash" inputmode="decimal" value="' + runtimeFunction('escapeHtml')(ops.verifiedGcash) + '"' + disabled + '></div>' +
        '<div><label class="fld" for="posVerifiedGotyme">GoTyme verified (₱)</label><input id="posVerifiedGotyme" inputmode="decimal" value="' + runtimeFunction('escapeHtml')(ops.verifiedGotyme) + '"' + disabled + '></div>' +
        '<div><label class="fld" for="posCloseNotes">Closing note (optional)</label><input id="posCloseNotes" maxlength="500" value="' + runtimeFunction('escapeHtml')(ops.notes) + '"' + disabled + '></div></div>' +
        '<p class="hint">For GCash and GoTyme, enter only the sales receipts for this shift—not the full wallet or bank balance.</p>' +
        '<div class="pos-error">' + runtimeFunction('escapeHtml')(ops.error) + '</div><div class="modal-actions"><button class="btn secondary" data-act="closePosOpsModal"' + frozen + '>Cancel</button><button class="btn" data-act="reviewPosCloseShift"' + disabled + '>Review close</button></div>';
    }
  } else if (ops.type === 'voidSale') {
    const sale = ops.sale || {};
    if (ops.step === 'result') {
      content.innerHTML = '<div class="modal-head"><h2 id="posOpsModalTitle">Sale voided</h2>' + close + '</div><div class="pos-closed-result"><strong>Receipt ' + runtimeFunction('escapeHtml')((ops.result && ops.result.receipt_number) || sale.receipt_number || '') + ' is marked VOID.</strong><p class="hint">The receipt and audit history remain. It was not deleted.</p></div><div class="modal-actions"><button class="btn" data-act="closePosOpsModal">Done</button></div>';
    } else {
      const reviewing = ops.step === 'confirm';
      content.innerHTML = '<div class="modal-head"><div><h2 id="posOpsModalTitle">Void receipt ' + runtimeFunction('escapeHtml')(sale.receipt_number || '') + '</h2><p class="hint">' + runtimeFunction('escapeHtml')(sale.item_summary || '') + ' · ' + runtimeFunction('peso')(runtimeFunction('Number')(sale.gross_total_centavos || 0) / 100) + '</p></div>' + close + '</div>' +
        '<div class="pos-danger-note"><strong>Before continuing:</strong> only void a sale before preparation and return the customer’s ' + runtimeFunction('escapeHtml')(runtimeFunction('posPaymentLabel')(sale.payment_method)) + ' payment. This cannot be done after the shift closes.</div>' +
        (reviewing ? '<div class="note"><strong>Confirm void</strong><br>Reason: ' + runtimeFunction('escapeHtml')(ops.reason) + '</div>' : '<label class="fld" for="posVoidReason">Required reason</label><textarea id="posVoidReason" maxlength="500" placeholder="e.g. Customer cancelled before preparation"' + disabled + '>' + runtimeFunction('escapeHtml')(ops.reason) + '</textarea>') +
        '<div class="pos-error">' + runtimeFunction('escapeHtml')(ops.error) + '</div><div class="modal-actions">' +
        (reviewing ? '<button class="btn secondary" data-act="backPosVoidSale"' + frozen + '>Back</button>' : '<button class="btn secondary" data-act="closePosOpsModal"' + frozen + '>Cancel</button>') +
        '<button class="btn danger" data-act="' + (reviewing ? 'submitPosVoidSale' : 'reviewPosVoidSale') + '"' + disabled + '>' + runtimeFunction('escapeHtml')(ops.submitting ? 'Checking…' : (reviewing ? (ops.uncertain ? 'Retry exact void' : 'Confirm void') : 'Review void')) + '</button></div>';
    }
  } else if (ops.type === 'salesHistory') {
    const currentHistory = runtimeValue<LegacyValue>('posSalesHistory');
    const historyTraining = currentHistory.mode === 'training';
    const canSwitchHistory = posFunction('posCanManageOperations')();
    const historyBusy = posFunction('posSalesHistoryBusy')();
    const historyModes = canSwitchHistory ? '<div class="pos-payment-tabs" aria-label="Sales mode"><button data-act="setPosSalesHistoryMode" data-mode="live" class="' + (!historyTraining ? 'active' : '') + '" aria-pressed="' + (!historyTraining) + '"' + (historyBusy ? ' disabled' : '') + '>Live sales</button><button data-act="setPosSalesHistoryMode" data-mode="training" class="' + (historyTraining ? 'active' : '') + '" aria-pressed="' + historyTraining + '"' + (historyBusy ? ' disabled' : '') + '>Training sales</button></div>' : '';
    const receiptView = currentHistory.view === 'receipts';
    const tallyView = currentHistory.view === 'tally';
    const shiftView = currentHistory.view === 'shifts';
    const historyViews = '<div class="pos-history-view-tabs' + (canSwitchHistory ? '' : ' two') + '" role="tablist" aria-label="Sales history view"><button id="posHistoryReceiptsTab" role="tab" aria-controls="posSalesHistoryPanel" aria-selected="' + receiptView + '" tabindex="' + (receiptView ? '0' : '-1') + '" aria-disabled="' + historyBusy + '" data-act="setPosSalesHistoryView" data-view="receipts" class="' + (receiptView ? 'active' : '') + '">Receipts</button><button id="posHistoryTallyTab" role="tab" aria-controls="posSalesHistoryPanel" aria-selected="' + tallyView + '" tabindex="' + (tallyView ? '0' : '-1') + '" aria-disabled="' + historyBusy + '" data-act="setPosSalesHistoryView" data-view="tally" class="' + (tallyView ? 'active' : '') + '">Drink tally</button>' +
      (canSwitchHistory ? '<button id="posHistoryShiftsTab" role="tab" aria-controls="posSalesHistoryPanel" aria-selected="' + shiftView + '" tabindex="' + (shiftView ? '0' : '-1') + '" aria-disabled="' + historyBusy + '" data-act="setPosSalesHistoryView" data-view="shifts" class="' + (shiftView ? 'active' : '') + '">Shift closes</button>' : '') + '</div>';
    const historyRows = currentHistory.rows.length ? '<div class="pos-history-list">' + runtimeFunction('posSalesRowsHtml')(currentHistory.rows, false) + '</div>' : (currentHistory.loading ? '<div class="pos-loading">Loading receipts…</div>' : (currentHistory.loaded ? '<p class="empty">No completed ' + runtimeFunction('escapeHtml')(posFunction('posModeName')(historyTraining)) + ' sales yet.</p>' : ''));
    const historyCount = currentHistory.rows.length + ' receipt' + (currentHistory.rows.length === 1 ? '' : 's') + ' loaded' + (currentHistory.loaded && !currentHistory.hasMore ? ' · complete history' : '');
    const showLoad = currentHistory.loading || currentHistory.hasMore || !!currentHistory.error;
    const loadLabel = currentHistory.loading ? 'Loading…' : (currentHistory.error ? 'Retry' : 'Load older sales');
    const receiptsBody = '<div class="row"><strong>All-time ' + runtimeFunction('escapeHtml')(posFunction('posModeName')(historyTraining)) + ' totals</strong></div>' + posFunction('posSalesHistorySummaryHtml')(currentHistory.summary) +
      (currentHistory.summaryError ? '<div class="note">' + runtimeFunction('escapeHtml')(currentHistory.summaryError) + '</div>' : '') +
      '<div class="row" style="margin-top:16px"><h3 style="margin:0;color:var(--brown)">Receipts</h3><span class="spacer"></span><span class="pos-history-count">' + runtimeFunction('escapeHtml')(historyCount) + '</span></div>' + historyRows +
      (currentHistory.error ? '<div class="note" style="margin-top:10px">' + runtimeFunction('escapeHtml')(currentHistory.error) + '</div>' : '');
    const tallyUnits = currentHistory.tallyRows.reduce(function (total: LegacyValue, row: LegacyValue) { return total + runtimeValue<LegacyValue>('Math').max(0, runtimeFunction('Number')(row.units_sold) || 0); }, 0);
    const tallySales = currentHistory.tallyRows.reduce(function (total: LegacyValue, row: LegacyValue) { return total + runtimeValue<LegacyValue>('Math').max(0, runtimeFunction('Number')(row.net_sales_centavos) || 0); }, 0);
    const tallyRows = currentHistory.tallyRows.length ? posFunction('posSalesProductTallyHtml')(currentHistory.tallyRows) : (currentHistory.tallyLoading ? '<div class="pos-loading">Loading drink tally…</div>' : (currentHistory.tallyLoaded ? '<p class="empty">No drinks sold in ' + runtimeFunction('escapeHtml')(posFunction('posModeName')(historyTraining)) + ' sales yet.</p>' : ''));
    const tallyBody = posFunction('posHistoryFilterHtml')(canSwitchHistory) + '<div class="row"><div><strong>' + runtimeFunction('escapeHtml')(posFunction('posHistoryFilterLabel')()) + ' · ' + runtimeFunction('escapeHtml')(posFunction('posModeName')(historyTraining)) + ' drink tally</strong><p class="pos-history-count">Completed sales minus voided and refunded receipts</p></div><span class="spacer"></span>' +
      (currentHistory.tallyLoaded ? '<span class="pos-history-count">' + tallyUnits.toLocaleString('en-PH') + ' drink' + (tallyUnits === 1 ? '' : 's') + ' sold · ' + runtimeFunction('peso')(tallySales / 100) + ' net sales · ' + currentHistory.tallyRows.length + ' product' + (currentHistory.tallyRows.length === 1 ? '' : 's') + '</span>' : '') + '</div>' + tallyRows +
      (currentHistory.tallyError ? '<div class="note" style="margin-top:10px">' + runtimeFunction('escapeHtml')(currentHistory.tallyError) + '</div>' : '');
    const shiftRows = currentHistory.shiftRows.length ? posFunction('posClosedShiftHistoryHtml')(currentHistory.shiftRows) : (currentHistory.shiftLoading ? '<div class="pos-loading">Loading closed shifts…</div>' : (currentHistory.shiftLoaded ? '<p class="empty">No closed ' + runtimeFunction('escapeHtml')(posFunction('posModeName')(historyTraining)) + ' shifts match this date.</p>' : ''));
    const shiftBody = posFunction('posHistoryFilterHtml')(false) + '<div class="row"><div><strong>' + runtimeFunction('escapeHtml')(posFunction('posHistoryFilterLabel')()) + ' · ' + runtimeFunction('escapeHtml')(posFunction('posModeName')(historyTraining)) + ' shift closes</strong><p class="pos-history-count">Stored reconciliation plus totals recalculated from the shift ledger</p></div><span class="spacer"></span>' +
      (currentHistory.shiftLoaded ? '<span class="pos-history-count">' + currentHistory.shiftRows.length + ' shift' + (currentHistory.shiftRows.length === 1 ? '' : 's') + ' loaded' + (!currentHistory.shiftHasMore ? ' · complete' : '') + '</span>' : '') + '</div>' + shiftRows +
      (currentHistory.shiftError ? '<div class="note" style="margin-top:10px">' + runtimeFunction('escapeHtml')(currentHistory.shiftError) + '</div>' : '');
    const selectedTabId = shiftView ? 'posHistoryShiftsTab' : (tallyView ? 'posHistoryTallyTab' : 'posHistoryReceiptsTab');
    const selectedBody = shiftView ? shiftBody : (tallyView ? tallyBody : receiptsBody);
    const shiftLoadLabel = currentHistory.shiftLoading ? 'Loading…' : (currentHistory.shiftError ? 'Retry' : 'Load older shifts');
    content.innerHTML = '<div class="modal-head"><div style="flex:1"><h2 id="posOpsModalTitle" tabindex="-1">Sales history</h2><p class="hint">Complete totals plus older receipts without crowding the register.</p></div>' + close + '</div>' +
      historyModes + historyViews + (historyTraining ? '<div class="pos-mode-banner"><span class="pos-mode-training">Training</span><span>Practice receipts and totals stay separate from real sales.</span></div>' : '') +
      '<div id="posSalesHistoryPanel" role="tabpanel" aria-labelledby="' + selectedTabId + '" aria-busy="' + historyBusy + '">' + selectedBody + '</div>' +
      '<div class="modal-actions">' + (receiptView && currentHistory.summaryError ? '<button class="btn secondary" data-act="reloadPosSalesHistory"' + (historyBusy ? ' disabled' : '') + '>Retry totals</button>' : '') +
      (receiptView && showLoad ? '<button class="btn secondary" data-act="loadOlderPosSalesHistory"' + (historyBusy ? ' disabled' : '') + '>' + runtimeFunction('escapeHtml')(loadLabel) + '</button>' : '') +
      (tallyView && (currentHistory.tallyError || currentHistory.shiftError) ? '<button class="btn secondary" data-act="retryPosSalesProductTally"' + (historyBusy ? ' disabled' : '') + '>' + (currentHistory.tallyError ? 'Retry tally' : 'Retry shift list') + '</button>' : '') +
      (shiftView && (currentHistory.shiftLoading || currentHistory.shiftHasMore || currentHistory.shiftError) ? '<button class="btn secondary" data-act="loadOlderPosClosedShifts"' + (historyBusy ? ' disabled' : '') + '>' + runtimeFunction('escapeHtml')(shiftLoadLabel) + '</button>' : '') +
      '<button class="btn" data-act="closePosOpsModal">Close</button></div>';
  } else if (ops.type === 'report') {
    const canChoose = !checkout().shift && posFunction('posCanManageOperations')();
    content.innerHTML = '<div class="modal-head"><div style="flex:1">' + posFunction('posReportHtml')(checkout().dailyReport) + '</div>' + close + '</div>' +
      (canChoose ? '<div class="pos-payment-tabs"><button data-act="setPosReportMode" data-mode="live" class="' + (checkout().reportMode === 'live' ? 'active' : '') + '">Live report</button><button data-act="setPosReportMode" data-mode="training" class="' + (checkout().reportMode === 'training' ? 'active' : '') + '">Training report</button></div>' : '') +
      (ops.notice ? '<div class="note">' + runtimeFunction('escapeHtml')(ops.notice) + '</div>' : '') + '<div class="modal-actions"><button class="btn" data-act="closePosOpsModal">Close</button></div>';
  }
}
