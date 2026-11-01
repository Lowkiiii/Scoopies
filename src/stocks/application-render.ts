import { readStocksBinding, runtimeValue } from './bindings';
import { renderStocks } from './rendering';

export function renderPos(): void {
  const root = runtimeValue('document').getElementById('posRoot');
  if (!root) return;
  if (!runtimeValue('session')) {
    root.innerHTML =
      '<div class="card"><h2>Point of sale</h2><p class="hint">The register needs a cloud connection and a signed-in account. Your costing pages remain available above.</p></div>';
    return;
  }
  if (
    (!runtimeValue('posContext').loaded ||
      runtimeValue('posContext').loading) &&
    !runtimeValue('posContext').businessId
  ) {
    root.innerHTML =
      '<div class="card"><div class="pos-loading">Opening the ' +
      runtimeValue('escapeHtml')(runtimeValue('APP_BRAND_NAME')) +
      ' register…</div></div>';
    return;
  }
  if (
    runtimeValue('posContext').error ||
    !runtimeValue('posContext').businessId
  ) {
    root.innerHTML =
      '<div class="card"><h2>Point of sale</h2><div class="note">' +
      runtimeValue('escapeHtml')(
        runtimeValue('posContext').error ||
          'The POS workspace is not ready.',
      ) +
      '</div><button class="btn secondary" data-act="retryPosContext" style="margin-top:10px">Retry POS</button></div>';
    return;
  }
  const top =
    '<div class="pos-topbar"><div style="flex:1"><h2>' +
    runtimeValue('escapeHtml')(
      runtimeValue('brandDisplayName')(
        runtimeValue('posContext').businessName,
      ),
    ) +
    ' register</h2><p class="hint">Tap a drink · choose payment · confirm once</p></div>' +
    runtimeValue('posSyncStatusHtml')() +
    '<span class="pos-role">' +
    runtimeValue('escapeHtml')(runtimeValue('posRoleLabel')()) +
    '</span><button class="btn small secondary" data-act="openPosReport">Daily report</button><button class="btn small secondary" data-act="refreshPos"' +
    (runtimeValue('posCheckout').refreshing ? ' disabled' : '') +
    '>Refresh</button></div>';
  if (
    runtimeValue('posCheckout').shiftLoading &&
    !runtimeValue('posCheckout').loaded &&
    !runtimeValue('posCheckout').catalogFromCache
  ) {
    root.innerHTML =
      top +
      '<div class="card"><div class="pos-loading">Checking the active register shift…</div></div>';
    return;
  }
  if (runtimeValue('posCheckout').shiftError) {
    root.innerHTML =
      top +
      '<div class="card pos-gate"><h2>Shift status unavailable</h2><div class="note">' +
      runtimeValue('escapeHtml')(runtimeValue('posCheckout').shiftError) +
      '</div><button class="btn secondary" data-act="refreshPos" style="margin-top:10px">Retry safely</button></div>';
    return;
  }
  const trainingView =
    runtimeValue('posCheckout').reportMode === 'training';
  const modeBanner = trainingView
    ? '<div class="pos-mode-banner"><span class="pos-mode-training">Training</span><strong>Practice only — excluded from Live sales, cash, and reports.</strong></div>'
    : '';
  const reports =
    runtimeValue('posSummaryHtml')() +
    (runtimeValue('posCheckout').reportsError
      ? '<p class="hint">' +
        runtimeValue('escapeHtml')(
          runtimeValue('posCheckout').reportsError,
        ) +
        '</p>'
      : '');
  const recent =
    '<div class="card" style="margin-top:14px"><div class="row"><div><h2 style="margin:0">Recent ' +
    runtimeValue('escapeHtml')(
      runtimeValue('posModeName')(trainingView),
    ) +
    ' sales</h2><p class="hint" style="margin:2px 0 0">Latest 20 receipts</p></div><span class="spacer"></span><button class="btn small secondary" data-act="openPosSalesHistory"' +
    (runtimeValue('posCheckout').reportsLoading ? ' disabled' : '') +
    '>View sales history</button></div>' +
    runtimeValue('posRecentHtml')() +
    '</div>';
  const shiftHeader =
    !runtimeValue('posCheckout').shift &&
    !runtimeValue('posCheckout').pending
      ? runtimeValue('posNoShiftGateHtml')()
      : runtimeValue('posShiftBarHtml')();
  root.innerHTML =
    top +
    runtimeValue('posCriticalRefreshNoticeHtml')() +
    shiftHeader +
    modeBanner +
    runtimeValue('posReceiptHtml')() +
    reports +
    runtimeValue('posWorkspaceHtml')() +
    runtimeValue('posMobileOrderBarHtml')() +
    recent;
}

export function renderAll(): void {
  readStocksBinding('renderPos', renderPos)();
  readStocksBinding('renderStocks', renderStocks)();
  runtimeValue('renderIngredients')();
  runtimeValue('renderDraftButton')();
  runtimeValue('renderPackaging')();
  runtimeValue('renderRecipes')();
  runtimeValue('renderProducts')();
}
