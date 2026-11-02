import { readPosBinding, runtimeValue } from './bindings';

type LegacyValue = any;
type LegacyFunction = (...args: LegacyValue[]) => LegacyValue;

function runtimeFunction(name: string): LegacyFunction {
  return runtimeValue<LegacyFunction>(name);
}

function checkout(): LegacyValue {
  return runtimeValue('posCheckout');
}

function runtimeNumber(): LegacyFunction {
  return runtimeValue<LegacyFunction>('Number');
}

function runtimeString(): LegacyFunction {
  return runtimeValue<LegacyFunction>('String');
}

function livePos(
  name: string,
  fallback: LegacyFunction,
): LegacyFunction {
  return readPosBinding<LegacyFunction>(name, fallback);
}

export function posPaymentLabel(method: LegacyValue): string {
  return method === 'gcash' ? 'GCash' : (method === 'gotyme' ? 'GoTyme' : 'Cash');
}

export function posSummaryHtml(): string {
  const s = checkout().summary;
  if (checkout().reportsLoading && !s) {
    return '<div class="pos-summary"><div class="metric"><div class="lbl">Today</div><div class="val">Loading…</div></div></div>';
  }
  if (!s) {
    return '<div class="note">No ' + runtimeFunction('escapeHtml')(runtimeFunction('posModeName')(checkout().reportMode === 'training')) + ' totals are available for this business date.</div>';
  }
  return '<div class="pos-summary">' +
    '<div class="metric"><div class="lbl">Gross sales</div><div class="val">' + runtimeFunction('peso')(runtimeNumber()(s.gross_sales_centavos || 0) / 100) + '</div></div>' +
    '<div class="metric"><div class="lbl">Voids</div><div class="val">' + runtimeFunction('peso')(runtimeNumber()(s.voided_sales_centavos || 0) / 100) + '</div></div>' +
    '<div class="metric"><div class="lbl">Net collected</div><div class="val">' + runtimeFunction('peso')(runtimeNumber()(s.net_sales_centavos || 0) / 100) + '</div></div>' +
    '<div class="metric"><div class="lbl">Drinks sold</div><div class="val">' + runtimeNumber()(s.net_items_sold || 0) + '</div></div>' +
  '</div>';
}

export function posReceiptHtml(): string {
  const r = checkout().lastReceipt;
  if (!r) return '';
  return '<div class="card pos-receipt"><div class="pos-topbar"><div style="flex:1"><div class="hint" style="margin:0">Order recorded' + (r.is_retry ? ' · safely recovered' : '') + '</div>' +
    '<div class="pos-receipt-number">Receipt ' + runtimeFunction('escapeHtml')(r.receipt_number) + (r.is_training ? ' <span class="pos-mode-training">Training</span>' : '') + '</div><div class="hint" style="margin:4px 0 0">' + runtimeNumber()(r.units_sold || 0) + ' item' + (runtimeNumber()(r.units_sold || 0) === 1 ? '' : 's') + ' · ' + runtimeFunction('escapeHtml')(livePos('posPaymentLabel', posPaymentLabel)(r.payment_method)) + '</div></div>' +
    '<div style="text-align:right"><div class="hint" style="margin:0">Total</div><strong style="font-size:24px">' + runtimeFunction('peso')(runtimeNumber()(r.total_centavos || 0) / 100) + '</strong>' +
    (r.change_given_centavos == null ? '' : '<div class="hint" style="margin:2px 0 0">Change ' + runtimeFunction('peso')(runtimeNumber()(r.change_given_centavos) / 100) + '</div>') + '</div></div>' +
    '<button class="btn" data-act="posNewSale">Next order</button></div>';
}

export function posProductCardHtml(item: LegacyValue, locked: LegacyValue): string {
  const id = runtimeString()(item.product_id || '');
  const lines = runtimeFunction('posProductCartLines')(id);
  const current = lines.length > 0 && lines.every(function (line: LegacyValue) {
    return !line.stale && runtimeString()(line.productVersionId || '') === runtimeString()(item.active_version_id || '');
  });
  const needsReview = lines.some(function (line: LegacyValue) {
    return line.stale || runtimeString()(line.productVersionId || '') !== runtimeString()(item.active_version_id || '');
  });
  const count = current ? runtimeFunction('posProductCartQuantity')(id) : 0;
  const name = runtimeString()(item.product_name || 'Product');
  const size = runtimeString()(item.size_snapshot || '');
  const badge = current ? '<span class="pos-product-count" aria-hidden="true">&times;' + count + '</span>' : (needsReview ? '<span class="pos-product-count warn" aria-hidden="true">Review</span>' : '');
  const classes = 'pos-product' + (current ? ' selected' : '') + (needsReview ? ' needs-review' : '');
  const disabled = locked || needsReview;
  const label = needsReview ? 'Review ' + name + ' in the current order before adding more' : ('Add ' + name + (size ? ' ' + size : '') + (count ? '; ' + count + ' in current order' : ''));
  return '<button class="' + classes + '" data-act="addPosProduct" data-id="' + runtimeFunction('escapeHtml')(id) + '" aria-label="' + runtimeFunction('escapeHtml')(label) + '"' + (disabled ? ' disabled' : '') + '>' + badge +
    runtimeFunction('posDrinkImageHtml')(item, 'card') + '<span class="pos-product-copy"><span class="pos-product-name">' + runtimeFunction('escapeHtml')(name) + '</span>' +
    (size ? '<span class="pos-product-size">' + runtimeFunction('escapeHtml')(size) + '</span>' : '') + '</span>' +
    '<span class="pos-product-price">' + runtimeFunction('peso')(runtimeNumber()(item.selling_price_centavos || 0) / 100) + '</span></button>';
}

export function posCatalogHtml(): string {
  if (checkout().catalogLoading && !checkout().catalog.length) return '<div class="pos-loading">Loading the published menu…</div>';
  if (checkout().catalogError) return '<div class="note"><strong>Menu unavailable.</strong> ' + runtimeFunction('escapeHtml')(checkout().catalogError) + ' <button class="btn small secondary" data-act="refreshPos" style="margin-left:6px">Retry</button></div>';
  runtimeFunction('normalizePosCategory')();
  const all = checkout().catalog || [];
  const groups = [{ key: 'matcha', label: 'Matcha' }, { key: 'hojicha', label: 'Hojicha' }];
  const visibleGroups = groups.filter(function (group) {
    return all.some(function (item: LegacyValue) { return runtimeFunction('posDrinkGroupKey')(item) === group.key; });
  });
  let chips = '';
  if (visibleGroups.length > 1) {
    chips = '<button class="category-chip' + (checkout().category === 'all' ? ' active' : '') + '" data-act="setPosCategory" data-id="all">All (' + all.length + ')</button>';
    visibleGroups.forEach(function (group) {
      const count = all.filter(function (item: LegacyValue) { return runtimeFunction('posDrinkGroupKey')(item) === group.key; }).length;
      chips += '<button class="category-chip' + (checkout().category === group.key ? ' active' : '') + '" data-act="setPosCategory" data-id="' + group.key + '">' + group.label + ' (' + count + ')</button>';
    });
  }
  const filtered = all.filter(function (item: LegacyValue) { return checkout().category === 'all' || checkout().category === runtimeFunction('posDrinkGroupKey')(item); });
  const locked = !!(checkout().pending || checkout().submitting || checkout().confirming);
  let products = filtered.map(function (item: LegacyValue) { return livePos('posProductCardHtml', posProductCardHtml)(item, locked); }).join('');
  if (!all.length) {
    const setup = runtimeFunction('posCanManageOperations')() ? '<div style="margin-top:10px"><button class="btn" data-act="managePosMenu">Add drinks to POS</button></div>' : '<p class="hint">Ask an owner or manager to publish drinks from Pricing.</p>';
    products = '<div class="note" style="grid-column:1/-1"><strong>No drinks are on the POS yet.</strong><br>Published Pricing products will appear here as tappable cards.' + setup + '</div>';
  } else if (!filtered.length) products = '<div class="empty" style="grid-column:1/-1">No drinks are in this category.</div>';
  return (chips ? '<div class="pos-category-bar" aria-label="POS drink categories">' + chips + '</div>' : '') + '<div class="pos-product-grid">' + products + '</div>';
}

export function posCashSuggestions(total: LegacyValue): LegacyValue[] {
  if (!(runtimeNumber()(total) > 0)) return [];
  const values = [total, runtimeValue<LegacyValue>('Math').ceil(total / 5000) * 5000, 10000, 20000, 50000, 100000];
  const seen: Record<PropertyKey, LegacyValue> = {};
  const out: LegacyValue[] = [];
  values.forEach(function (value) {
    if (value >= total && !seen[value]) {
      seen[value] = true;
      out.push(value);
    }
  });
  return out.slice(0, 4);
}

export function posCartHtml(): string {
  const lines = runtimeFunction('posCartLines')();
  const total = runtimeFunction('posCartTotalCentavos')();
  const locked = !!(checkout().pending || checkout().submitting || checkout().confirming);
  const noShift = !checkout().shift && !checkout().pending;
  let rows = lines.map(function (line: LegacyValue) {
    let stale = '';
    if (line.stale) stale = '<div class="pos-state warn" style="margin-top:6px">' + (line.latest ? 'Updated menu price ' + runtimeFunction('peso')(runtimeNumber()(line.latest.selling_price_centavos || 0) / 100) : 'No longer available') + '</div>';
    const sizeDetail = line.size ? '<div class="pos-recent-meta">' + runtimeFunction('escapeHtml')(line.size) + '</div>' : '';
    const modifier = line.matchaOptionName ? '<span class="pos-cart-modifier">' + runtimeFunction('escapeHtml')(line.matchaOptionName) + ' &middot; +' + runtimeFunction('peso')(runtimeNumber()(line.matchaSurchargeCentavos || 0) / 100) + ' each</span>' : '';
    const key = runtimeString()(line.key || runtimeFunction('posVariantKey')(line.productId, line.productVersionId, line.matchaOptionId, line.matchaOptionRevision));
    return '<div class="pos-cart-line"><div class="pos-cart-line-top"><div class="pos-cart-name">' + runtimeFunction('escapeHtml')(line.name) + sizeDetail + modifier + stale + '</div><div class="pos-cart-price">' + runtimeFunction('peso')((runtimeNumber()(line.priceCentavos) || 0) * (runtimeNumber()(line.quantity) || 0) / 100) + '</div></div>' +
      '<div class="pos-qty"><button data-act="posQtyDown" data-id="' + runtimeFunction('escapeHtml')(key) + '" aria-label="Remove one ' + runtimeFunction('escapeHtml')(line.name) + '"' + (locked ? ' disabled' : '') + '>−</button><span class="pos-qty-value">' + runtimeNumber()(line.quantity) + '</span><button data-act="posQtyUp" data-id="' + runtimeFunction('escapeHtml')(key) + '" aria-label="Add one ' + runtimeFunction('escapeHtml')(line.name) + '"' + (locked ? ' disabled' : '') + '>+</button><button class="pos-remove" data-act="removePosLine" data-id="' + runtimeFunction('escapeHtml')(key) + '" aria-label="Remove ' + runtimeFunction('escapeHtml')(line.name) + ' from order" title="Remove ' + runtimeFunction('escapeHtml')(line.name) + '"' + (locked ? ' disabled' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"></path></svg></button></div></div>';
  }).join('');
  if (!rows) rows = '<div class="empty">Tap a drink card to start the order.</div>';
  const changed = checkout().catalogChanged ? '<div class="note"><strong>Menu changed.</strong> Review the new prices and unavailable items before checkout.' + (locked ? '' : '<div style="margin-top:8px"><button class="btn small secondary" data-act="acceptPosCatalogChanges">Apply updates &amp; remove unavailable</button></div>') + '</div>' : '';
  const validation = runtimeFunction('posCheckoutValidation')();
  const cash = runtimeFunction('strictPesoCentavos')(checkout().cashReceived);
  const change = cash == null ? null : cash - total;
  let payment = '<div class="pos-payment-tabs" aria-label="Payment method">' + ['cash', 'gcash', 'gotyme'].map(function (method) { return '<button data-act="setPosPayment" data-method="' + method + '" class="' + (checkout().paymentMethod === method ? 'active' : '') + '"' + (locked ? ' disabled' : '') + '>' + livePos('posPaymentLabel', posPaymentLabel)(method) + '</button>'; }).join('') + '</div>';
  if (checkout().paymentMethod === 'cash') {
    payment += '<label class="fld" for="posCashReceived">Cash received (₱)</label><input id="posCashReceived" inputmode="decimal" autocomplete="off" placeholder="0.00" value="' + runtimeFunction('escapeHtml')(checkout().cashReceived) + '"' + (locked ? ' disabled' : '') + '><div class="pos-quick-cash">' + livePos('posCashSuggestions', posCashSuggestions)(total).map(function (value: LegacyValue) { return '<button data-act="setPosCash" data-centavos="' + value + '"' + (locked ? ' disabled' : '') + '>' + (value === total ? 'Exact ' : '') + runtimeFunction('peso')(value / 100) + '</button>'; }).join('') + '</div>' +
      (change != null && change >= 0 ? '<div id="posChangeValue" class="pos-change"><strong>Change: ' + runtimeFunction('peso')(change / 100) + '</strong></div>' : '<div id="posChangeValue"></div>');
  } else payment += '<label class="fld" for="posReference">' + livePos('posPaymentLabel', posPaymentLabel)(checkout().paymentMethod) + ' reference (optional)</label><input id="posReference" maxlength="120" autocomplete="off" placeholder="Transaction/reference number" value="' + runtimeFunction('escapeHtml')(checkout().referenceNumber) + '"' + (locked ? ' disabled' : '') + '>';
  const buttonText = checkout().submitting ? 'Recording order…' : (checkout().pending ? 'Retry exact order' : 'Review order · ' + runtimeFunction('peso')(total / 100));
  let actionHtml: string;
  if (noShift) {
    const status = checkout().shiftStatus || {};
    const allowedToOpen = !!(status.can_open_live || status.can_open_training);
    const canOpen = allowedToOpen && !checkout().refreshing && !checkout().checkoutRefreshRequired;
    actionHtml = '<button class="btn pos-checkout" data-act="openPosShift"' + (!canOpen || locked ? ' disabled' : '') + '>' + (lines.length ? 'Start selling to confirm · ' + runtimeFunction('peso')(total / 100) : 'Start selling') + '</button>';
    if (!allowedToOpen) actionHtml += '<p class="hint">Ask an owner or manager to open the register.</p>';
    else if (!canOpen) actionHtml += '<p class="hint">Wait for the register check, then start selling.</p>';
  } else if (checkout().confirming) {
    let confirmation = 'Charge <strong>' + runtimeFunction('peso')(total / 100) + '</strong> via <strong>' + runtimeFunction('escapeHtml')(livePos('posPaymentLabel', posPaymentLabel)(checkout().paymentMethod)) + '</strong>';
    if (checkout().paymentMethod === 'cash') {
      const tendered = runtimeFunction('strictPesoCentavos')(checkout().cashReceived);
      confirmation += ' · received ' + runtimeFunction('peso')(runtimeNumber()(tendered || 0) / 100) + ' · change ' + runtimeFunction('peso')(runtimeValue<LegacyValue>('Math').max(0, runtimeNumber()(tendered || 0) - total) / 100);
    }
    actionHtml = '<div class="note" style="margin-top:10px"><strong>Confirm order</strong><br>' + confirmation + '</div><div class="row" style="margin-top:9px"><button class="btn secondary" data-act="cancelPosConfirmation">Back</button><button class="btn" data-act="confirmPosSale">Confirm order</button></div>';
  } else actionHtml = '<button class="btn pos-checkout" data-act="' + (checkout().pending ? 'confirmPosSale' : 'reviewPosSale') + '"' + ((!validation.valid && !checkout().pending) || checkout().submitting ? ' disabled' : '') + '>' + runtimeFunction('escapeHtml')(buttonText) + '</button>';
  const pendingMode = runtimeFunction('posModeFromPending')();
  const pendingBanner = checkout().pending ? '<div class="pos-mode-banner"><span class="' + (pendingMode === 'training' ? 'pos-mode-training' : 'pos-mode-live') + '">' + runtimeFunction('escapeHtml')(runtimeFunction('posModeName')(pendingMode === 'training')) + ' retry</span><span>Recover this exact frozen sale before opening or changing shifts. Its original shift and mode will not be replaced.</span></div>' : '';
  return pendingBanner + '<div class="row"><h2 style="margin:0">Current order</h2><span class="spacer"></span><button class="btn small secondary" data-act="clearPosCart"' + (locked || !lines.length ? ' disabled' : '') + '>Clear</button></div><div class="pos-cart-list">' + rows + '</div>' + changed +
    '<div class="pos-total"><span>Total · ' + runtimeFunction('posCartUnits')() + ' item' + (runtimeFunction('posCartUnits')() === 1 ? '' : 's') + '</span><strong aria-live="polite" aria-atomic="true">' + runtimeFunction('peso')(total / 100) + '</strong></div>' + payment +
    (checkout().notice ? '<div class="note" style="margin-top:10px">' + runtimeFunction('escapeHtml')(checkout().notice) + '</div>' : '') + '<div class="pos-error" aria-live="assertive">' + runtimeFunction('escapeHtml')(checkout().error) + '</div>' +
    actionHtml +
    '<p class="hint" style="margin:9px 0 0">' + (checkout().pending ? 'Only an exact retry is allowed until the server returns this receipt.' : (noShift ? 'Choose drinks now, then start the register before confirming payment.' : ('This order belongs to the locked ' + runtimeFunction('escapeHtml')(runtimeFunction('posModeName')(!!checkout().shift.is_training)) + ' shift.'))) + '</p>';
}

export function posSalesRowsHtml(sales: LegacyValue, allowVoid: LegacyValue): string {
  return (sales || []).map(function (sale: LegacyValue) {
    const completed = sale.completed_at ? new (runtimeValue<LegacyValue>('Date'))(sale.completed_at) : null;
    const time = completed ? completed.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : '';
    const today = checkout().summary && runtimeString()(sale.business_date || '') === runtimeString()(checkout().summary.business_date || '');
    const when = (today ? 'Today' : (completed ? completed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : runtimeString()(sale.business_date || ''))) + (time ? ' · ' + time : '');
    const voided = sale.sale_state === 'voided';
    let detail = runtimeFunction('escapeHtml')(when) + ' · ' + runtimeNumber()(sale.units_sold || 0) + ' item' + (runtimeNumber()(sale.units_sold || 0) === 1 ? '' : 's') + ' · ' + runtimeFunction('escapeHtml')(sale.cashier_display_name || 'Cashier');
    if (sale.can_view_costs && !voided) detail += ' · est. profit ' + runtimeFunction('peso')(runtimeNumber()(sale.estimated_gross_profit_centavos || 0) / 100);
    const voidDetail = voided ? '<div class="pos-recent-meta">Void reason: ' + runtimeFunction('escapeHtml')(sale.void_reason || 'Not provided') + (sale.voided_by_display_name ? ' · ' + runtimeFunction('escapeHtml')(sale.voided_by_display_name) : '') + '</div>' : '';
    let action = '<div class="pos-recent-actions"><span class="pos-recent-method pill">' + runtimeFunction('escapeHtml')(livePos('posPaymentLabel', posPaymentLabel)(sale.payment_method)) + '</span><strong>' + runtimeFunction('peso')(runtimeNumber()((voided ? sale.gross_total_centavos : sale.net_total_centavos) || 0) / 100) + '</strong>';
    if (allowVoid && sale.can_void && runtimeFunction('posCanManageOperations')()) action += '<button class="btn small danger" data-act="openPosVoid" data-id="' + runtimeFunction('escapeHtml')(sale.sale_id) + '"' + (checkout().refreshing || checkout().checkoutRefreshRequired ? ' disabled' : '') + '>Void</button>';
    action += '</div>';
    return '<div class="pos-recent-row' + (voided ? ' voided' : '') + '"><div><strong>' + runtimeFunction('escapeHtml')(sale.receipt_number || 'Receipt') + (voided ? '<span class="pos-void-label">Void</span>' : '') + '</strong><div class="pos-recent-meta">' + detail + '</div>' + voidDetail + (sale.item_summary ? '<div class="pos-item-summary">' + runtimeFunction('escapeHtml')(sale.item_summary) + '</div>' : '') + '</div>' + action + '</div>';
  }).join('');
}

export function posRecentHtml(): string {
  if (checkout().reportsLoading && !checkout().recent.length) return '<div class="pos-loading">Loading recent sales…</div>';
  if (!checkout().recent.length) return '<p class="empty">No completed sales yet.</p>';
  return livePos('posSalesRowsHtml', posSalesRowsHtml)(checkout().recent, true);
}

export function posShiftBarHtml(): string {
  if (checkout().pending && !checkout().shift) {
    const pendingTraining = runtimeFunction('posModeFromPending')() === 'training';
    return '<div class="pos-shift-bar"><span class="' + (pendingTraining ? 'pos-mode-training' : 'pos-mode-live') + '">' + runtimeFunction('escapeHtml')(runtimeFunction('posModeName')(pendingTraining)) + ' recovery</span><div class="pos-shift-copy"><strong>Exact sale retry required</strong><span>Do not open another shift. Recover the frozen receipt in Current sale first.</span></div></div>';
  }
  const shift = checkout().shift;
  if (!shift) return '';
  const training = !!shift.is_training;
  const hasCurrentSale = !!(checkout().submitting || checkout().pending || checkout().confirming || runtimeFunction('posCartLines')().length);
  const verificationBlocked = !!(checkout().refreshing || checkout().checkoutRefreshRequired);
  const blocked = hasCurrentSale || verificationBlocked;
  const opened = shift.opened_at ? new (runtimeValue<LegacyValue>('Date'))(shift.opened_at).toLocaleString('en-PH') : '';
  return '<div class="pos-shift-bar"><span class="' + (training ? 'pos-mode-training' : 'pos-mode-live') + '">' + runtimeFunction('escapeHtml')(runtimeFunction('posModeName')(training)) + '</span>' +
    '<div class="pos-shift-copy"><strong>' + runtimeFunction('escapeHtml')(shift.register_name || 'Register') + ' · shift open</strong><span>Opened ' + runtimeFunction('escapeHtml')(opened) + (shift.opened_by_display_name ? ' by ' + runtimeFunction('escapeHtml')(shift.opened_by_display_name) : '') + ' · mode locked until close' + (hasCurrentSale ? ' · finish or clear Current sale before closing' : (verificationBlocked ? ' · wait for the register check before closing' : '')) + '</span></div>' +
    '<button class="btn small secondary" data-act="openPosClose"' + (blocked || !(checkout().shiftStatus && checkout().shiftStatus.can_close_shift) ? ' disabled' : '') + '>Close shift</button></div>';
}

export function posNoShiftGateHtml(): string {
  if (checkout().refreshing) return '<div class="pos-start-banner"><div class="pos-start-banner-copy"><strong>Checking the register</strong><span>You can choose drinks while the latest shift and menu are verified.</span></div><span class="pos-sync syncing">Syncing...</span></div>';
  if (checkout().checkoutRefreshRequired) return '<div class="pos-start-banner"><div class="pos-start-banner-copy"><strong>Refresh required</strong><span>Your menu is still visible, but payment stays locked until the register is verified.</span></div><button class="btn" data-act="refreshPos">Retry</button></div>';
  const status = checkout().shiftStatus || {};
  const canOpen = !!(status.can_open_live || status.can_open_training);
  return '<div class="pos-start-banner"><div class="pos-start-banner-copy"><strong>Choose drinks now</strong><span>Start selling before confirming the first payment. Live or Training stays locked until the shift closes.</span></div>' +
    (canOpen ? '<button class="btn" data-act="openPosShift">Start selling</button>' : '<span class="hint">Ask an owner or manager to open the register.</span>') + '</div>';
}

export function posWorkspaceHtml(): string {
  const manage = runtimeFunction('posCanManageMedia')() ? '<button class="btn small secondary" data-act="openManageDrinks">Manage drink photos</button>' : '';
  return '<div class="pos-workspace"><div class="card pos-catalog-card"><div class="pos-catalog-head"><h2>Drinks</h2><span class="spacer"></span>' + manage + '</div><div id="posCatalogBody">' + livePos('posCatalogHtml', posCatalogHtml)() + '</div></div>' +
    '<aside id="posCartPanel" class="card pos-cart-card" tabindex="-1">' + livePos('posCartHtml', posCartHtml)() + '</aside></div>';
}

export function posMobileOrderBarHtml(): string {
  const units = runtimeFunction('posCartUnits')();
  if (!units) return '';
  return '<div class="pos-mobile-order-bar"><button class="btn" data-act="focusPosCart"><span>View order · ' + units + ' drink' + (units === 1 ? '' : 's') + '</span><strong>' + runtimeFunction('peso')(runtimeFunction('posCartTotalCentavos')() / 100) + '</strong></button></div>';
}

export function posSyncStatusHtml(): string {
  let cls = ' syncing';
  let text = 'Checking...';
  let detail = 'The register is being verified.';
  if (checkout().refreshing || checkout().shiftLoading) {
    cls = ' syncing'; text = 'Syncing...'; detail = 'Refreshing the menu, shift, and totals in the background.';
  } else if (checkout().checkoutRefreshRequired) {
    cls = ' bad'; text = 'Could not refresh'; detail = checkout().refreshError || 'Retry before confirming payment.';
  } else if (checkout().refreshError) {
    cls = ' warn'; text = 'Totals delayed'; detail = checkout().refreshError;
  } else if (checkout().loaded) {
    cls = ''; text = 'Up to date'; detail = checkout().lastUpdatedAt ? 'Last checked ' + new (runtimeValue<LegacyValue>('Date'))(checkout().lastUpdatedAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : 'Register verified.';
  }
  return '<span class="pos-sync' + cls + '" role="status" aria-live="polite" title="' + runtimeFunction('escapeHtml')(detail) + '">' + runtimeFunction('escapeHtml')(text) + '</span>';
}

export function posCriticalRefreshNoticeHtml(): string {
  if (!checkout().checkoutRefreshRequired || (!checkout().shift && !checkout().pending)) return '';
  return '<div class="note" style="margin-bottom:12px"><strong>Current order preserved.</strong> ' + runtimeFunction('escapeHtml')(checkout().refreshError || 'The register could not refresh.') + ' <button class="btn small secondary" data-act="refreshPos" style="margin-left:6px">Retry</button></div>';
}
