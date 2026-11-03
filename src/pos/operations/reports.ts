import {
  posFunction,
  runtimeFunction,
  runtimeValue,
  type LegacyValue,
} from '../bindings';

function checkout(): LegacyValue {
  return runtimeValue<LegacyValue>('posCheckout');
}

function history(): LegacyValue {
  return runtimeValue<LegacyValue>('posSalesHistory');
}

function modal(): LegacyValue {
  return runtimeValue<LegacyValue>('posOpsModal');
}

export function posVarianceHtml(
  label: LegacyValue,
  expected: LegacyValue,
  actual: LegacyValue,
  variance: LegacyValue,
): string {
  const value = runtimeFunction('Number')(variance || 0);
  const cls = value === 0 ? 'good' : 'bad';
  const sign = value > 0 ? '+' : '';
  return '<div class="metric"><div class="lbl">' + runtimeFunction('escapeHtml')(label) + '</div><div class="val">' + runtimeFunction('peso')(runtimeFunction('Number')(actual || 0) / 100) + '</div>' +
    '<div class="hint">Expected ' + runtimeFunction('peso')(runtimeFunction('Number')(expected || 0) / 100) + '</div><div class="pos-variance ' + cls + '">' + (value === 0 ? 'Balanced' : sign + runtimeFunction('peso')(value / 100)) + '</div></div>';
}

export function posCloseResultHtml(result: LegacyValue): string {
  if (!result) return '';
  const training = !!result.is_training;
  return '<div class="pos-closed-result"><strong>' + runtimeFunction('escapeHtml')(posFunction('posModeName')(training)) + ' shift closed' + (result.is_retry ? ' · recovered safely' : '') + '</strong>' +
    '<div class="pos-report-meta">' + runtimeFunction('escapeHtml')(result.register_name || 'Register') + ' · ' + runtimeFunction('escapeHtml')(result.closed_at ? new (runtimeValue<LegacyValue>('Date'))(result.closed_at).toLocaleString('en-PH') : '') + '</div></div>' +
    '<div class="pos-operation-summary">' +
      posFunction('posVarianceHtml')('Cash counted', result.expected_cash_centavos, result.counted_cash_centavos, result.cash_variance_centavos) +
      posFunction('posVarianceHtml')('GCash verified', result.expected_gcash_centavos, result.verified_gcash_centavos, result.gcash_variance_centavos) +
      posFunction('posVarianceHtml')('GoTyme verified', result.expected_gotyme_centavos, result.verified_gotyme_centavos, result.gotyme_variance_centavos) +
    '</div><div class="pos-operation-summary">' +
      '<div class="metric"><div class="lbl">Gross sales</div><div class="val">' + runtimeFunction('peso')(runtimeFunction('Number')(result.gross_sales_centavos || 0) / 100) + '</div></div>' +
      '<div class="metric"><div class="lbl">Voids</div><div class="val">' + runtimeFunction('peso')(runtimeFunction('Number')(result.voided_sales_centavos || 0) / 100) + '</div></div>' +
      '<div class="metric"><div class="lbl">Net collected</div><div class="val">' + runtimeFunction('peso')(runtimeFunction('Number')(result.net_sales_centavos || 0) / 100) + '</div></div>' +
    '</div>';
}

export function posReportHtml(report: LegacyValue): string {
  if (!report) return '<div class="note">No ' + runtimeFunction('escapeHtml')(posFunction('posModeName')(checkout().reportMode === 'training')) + ' report is available for this date yet.</div>';
  const training = !!report.is_training;
  const canView = !!report.can_view_costs;
  return '<div class="pos-report-head"><div><h2 id="posOpsModalTitle">End-of-day report</h2>' +
    '<div class="pos-report-meta">' + runtimeFunction('escapeHtml')(runtimeFunction('String')(report.business_date || '')) + ' · ' + runtimeFunction('escapeHtml')(report.business_timezone || 'Business timezone') + ' · ' + runtimeFunction('escapeHtml')(posFunction('posModeName')(training)) + '</div></div>' +
    '<div class="pos-report-actions"><button class="btn small secondary" data-act="downloadPosReport">Download CSV</button><button class="btn small secondary" data-act="printPosReport">Print</button></div></div>' +
    (training ? '<div class="pos-mode-banner"><span class="pos-mode-training">Training</span><span>Practice sales only. These totals are excluded from Live sales and cash.</span></div>' : '') +
    '<div class="pos-operation-summary">' +
      '<div class="metric"><div class="lbl">Gross sales</div><div class="val">' + runtimeFunction('peso')(runtimeFunction('Number')(report.gross_sales_centavos || 0) / 100) + '</div></div>' +
      '<div class="metric"><div class="lbl">Voids</div><div class="val">' + runtimeFunction('peso')(runtimeFunction('Number')(report.voided_sales_centavos || 0) / 100) + '</div></div>' +
      '<div class="metric"><div class="lbl">Net collected</div><div class="val">' + runtimeFunction('peso')(runtimeFunction('Number')(report.net_sales_centavos || 0) / 100) + '</div></div>' +
      '<div class="metric"><div class="lbl">Net orders</div><div class="val">' + runtimeFunction('Number')(report.net_sale_count || 0) + '</div></div>' +
      '<div class="metric"><div class="lbl">Net items</div><div class="val">' + runtimeFunction('Number')(report.net_items_sold || 0) + '</div></div>' +
      '<div class="metric"><div class="lbl">Estimated gross profit</div><div class="val">' + (canView ? runtimeFunction('peso')(runtimeFunction('Number')(report.estimated_gross_profit_centavos || 0) / 100) : 'Owner only') + '</div></div>' +
    '</div><div class="pos-operation-summary">' +
      '<div class="metric"><div class="lbl">Cash net</div><div class="val">' + runtimeFunction('peso')(runtimeFunction('Number')(report.cash_net_centavos || 0) / 100) + '</div></div>' +
      '<div class="metric"><div class="lbl">GCash net</div><div class="val">' + runtimeFunction('peso')(runtimeFunction('Number')(report.gcash_net_centavos || 0) / 100) + '</div></div>' +
      '<div class="metric"><div class="lbl">GoTyme net</div><div class="val">' + runtimeFunction('peso')(runtimeFunction('Number')(report.gotyme_net_centavos || 0) / 100) + '</div></div>' +
    '</div><p class="hint">Estimated gross profit is net sales minus published ingredient and packaging costs for non-voided items. It is not take-home profit and excludes rent, labor, utilities, spoilage, and payment or delivery fees.</p>' +
    '<p class="hint">This report exports the database’s complete daily aggregates. The separate Recent sales list is only the latest 20 receipts and is intentionally not treated as a complete daily ledger.</p>';
}

export function posHistoryDateLabel(value: LegacyValue): string {
  if (!value) return '';
  const RuntimeDate = runtimeValue<LegacyValue>('Date');
  const date = new RuntimeDate(runtimeFunction('String')(value) + 'T00:00:00');
  return runtimeFunction('isNaN')(date.getTime())
    ? runtimeFunction('String')(value)
    : date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function posSalesHistorySummaryHtml(summary: LegacyValue): string {
  if (!summary) return posFunction('posSalesHistoryBusy')() ? '<div class="pos-loading">Loading all-time totals…</div>' : '<div class="note">All-time totals are unavailable. Sales details can still be reviewed below.</div>';
  const first = posFunction('posHistoryDateLabel')(summary.first_business_date);
  const last = posFunction('posHistoryDateLabel')(summary.last_business_date);
  const span = first ? (first + (last && last !== first ? ' – ' + last : '')) : 'No completed sales yet';
  const canView = !!summary.can_view_costs;
  return '<div class="pos-report-meta">' + runtimeFunction('escapeHtml')(span) + ' · ' + runtimeFunction('escapeHtml')(summary.business_timezone || 'Business timezone') + '</div>' +
    '<div class="pos-history-summary">' +
      '<div class="metric"><div class="lbl">Gross sales</div><div class="val">' + runtimeFunction('peso')(runtimeFunction('Number')(summary.gross_sales_centavos || 0) / 100) + '</div></div>' +
      '<div class="metric"><div class="lbl">Voids</div><div class="val">' + runtimeFunction('peso')(runtimeFunction('Number')(summary.voided_sales_centavos || 0) / 100) + '</div></div>' +
      '<div class="metric"><div class="lbl">Net collected</div><div class="val">' + runtimeFunction('peso')(runtimeFunction('Number')(summary.net_sales_centavos || 0) / 100) + '</div></div>' +
      '<div class="metric"><div class="lbl">Net orders</div><div class="val">' + runtimeFunction('Number')(summary.net_sale_count || 0) + '</div></div>' +
      '<div class="metric"><div class="lbl">Drinks sold</div><div class="val">' + runtimeFunction('Number')(summary.net_items_sold || 0) + '</div></div>' +
      '<div class="metric"><div class="lbl">Cash net</div><div class="val">' + runtimeFunction('peso')(runtimeFunction('Number')(summary.cash_net_centavos || 0) / 100) + '</div></div>' +
      '<div class="metric"><div class="lbl">GCash net</div><div class="val">' + runtimeFunction('peso')(runtimeFunction('Number')(summary.gcash_net_centavos || 0) / 100) + '</div></div>' +
      '<div class="metric"><div class="lbl">GoTyme net</div><div class="val">' + runtimeFunction('peso')(runtimeFunction('Number')(summary.gotyme_net_centavos || 0) / 100) + '</div></div>' +
      '<div class="metric"><div class="lbl">Estimated gross profit</div><div class="val">' + (canView ? runtimeFunction('peso')(runtimeFunction('Number')(summary.estimated_gross_profit_centavos || 0) / 100) : 'Owner only') + '</div></div>' +
    '</div><p class="hint">Complete database totals across all ' + runtimeFunction('escapeHtml')(posFunction('posModeName')(summary.is_training === true)) + ' receipts. Voided sales stay in the audit history but are removed from net collected.</p>';
}

export function posSalesProductTallyHtml(rows: LegacyValue): string {
  return '<div class="pos-tally-list" role="list" aria-label="Drink sales tally">' + (rows || []).map(function (row: LegacyValue) {
    const units = runtimeValue<LegacyValue>('Math').max(0, runtimeFunction('Number')(row.units_sold) || 0);
    const orders = runtimeValue<LegacyValue>('Math').max(0, runtimeFunction('Number')(row.order_count) || 0);
    const sales = runtimeValue<LegacyValue>('Math').max(0, runtimeFunction('Number')(row.net_sales_centavos) || 0);
    const size = runtimeFunction('String')(row.size_label || '').trim();
    return '<div class="pos-tally-row" role="listitem"><div><div class="pos-tally-name">' + runtimeFunction('escapeHtml')(row.item_name || 'Unnamed drink') + '</div>' +
      '<div class="pos-tally-meta">' + (size ? runtimeFunction('escapeHtml')(size) + ' · ' : '') + orders.toLocaleString('en-PH') + ' order' + (orders === 1 ? '' : 's') + '</div></div>' +
      '<div class="pos-tally-values"><div class="pos-tally-value"><strong>' + runtimeFunction('peso')(sales / 100) + '</strong><span>net sales</span></div>' +
      '<div class="pos-tally-value units"><strong>' + units.toLocaleString('en-PH') + '</strong><span>sold</span></div></div></div>';
  }).join('') + '</div>';
}

export function posHistoryFilterLabel(): string {
  const date = history().filterDate ? posFunction('posHistoryDateLabel')(history().filterDate) : 'All dates';
  if (!history().filterShiftId) return date;
  const shift = history().shiftRows.find(function (row: LegacyValue) {
    return runtimeFunction('String')(row.shift_id || '') === runtimeFunction('String')(history().filterShiftId || '');
  }) || history().selectedShiftRow;
  return shift
    ? 'Shift: ' + runtimeFunction('String')(shift.register_name || 'Register') + ' · ' + posFunction('posHistoryDateLabel')(shift.closed_business_date || '')
    : date + ' · selected shift';
}

export function posHistoryShiftOptionLabel(row: LegacyValue): string {
  const date = posFunction('posHistoryDateLabel')(row.closed_business_date || '');
  const registerName = runtimeFunction('String')(row.register_name || 'Register');
  const timeOptions: LegacyValue = { hour: 'numeric', minute: '2-digit' };
  const timezone = checkout().shiftStatus && checkout().shiftStatus.business_timezone;
  if (timezone) timeOptions.timeZone = timezone;
  const closed = row.closed_at ? new (runtimeValue<LegacyValue>('Date'))(row.closed_at) : null;
  const time = closed && !runtimeFunction('isNaN')(closed.getTime()) ? closed.toLocaleTimeString('en-PH', timeOptions) : '';
  return [date, registerName, time].filter(Boolean).join(' · ');
}

export function posHistoryFilterHtml(includeShift: LegacyValue): string {
  const currentHistory = history();
  const busy = posFunction('posSalesHistoryBusy')();
  const tallyDate = currentHistory.view === 'tally';
  const shiftDefault = currentHistory.filterShiftId ? 'All dates (clear selected shift)' : (currentHistory.filterDate ? 'Use sales date above' : 'All dates');
  let shiftOptions = '<option value="">' + shiftDefault + '</option>';
  const choices = currentHistory.shiftRows.slice();
  if (currentHistory.selectedShiftRow && !choices.some(function (row: LegacyValue) {
    return runtimeFunction('String')(row.shift_id || '') === runtimeFunction('String')(currentHistory.selectedShiftRow.shift_id || '');
  })) choices.unshift(currentHistory.selectedShiftRow);
  choices.forEach(function (row: LegacyValue) {
    shiftOptions += '<option value="' + runtimeFunction('escapeHtml')(row.shift_id || '') + '"' + (runtimeFunction('String')(currentHistory.filterShiftId || '') === runtimeFunction('String')(row.shift_id || '') ? ' selected' : '') + '>' + runtimeFunction('escapeHtml')(posFunction('posHistoryShiftOptionLabel')(row)) + '</option>';
  });
  const shiftDisabled = busy || (!choices.length && !currentHistory.shiftLoaded);
  const shiftHelp = currentHistory.shiftLoading ? 'Loading shift choices…' : (currentHistory.shiftError ? runtimeFunction('escapeHtml')(currentHistory.shiftError) :
    (currentHistory.filterShiftId ? 'The selected shift includes its full duration. Clear it to return to all dates.' :
      (currentHistory.filterDate ? 'Shift choices use the date the shift was closed. Choosing a shift replaces the sales-date filter and includes the whole shift—even if it crossed midnight.' :
        (currentHistory.shiftHasMore ? 'Showing recent shift closes. Choose a date in Shift closes to find older ones.' : 'All matching shifts are available.'))));
  return '<div class="pos-history-filter" role="group" aria-label="History date filter"><div><label class="fld" for="posHistoryDateFilter">' + (tallyDate ? 'Sales business date' : 'Shift closed date') + '</label>' +
    '<input id="posHistoryDateFilter" type="date" value="' + runtimeFunction('escapeHtml')(currentHistory.filterDateInput) + '"' + (busy ? ' disabled' : '') + '><p class="pos-history-count">' + (tallyDate ? 'Filters drinks by the date assigned to each sale.' : 'Filters shifts by the local date their close was confirmed.') + '</p></div>' +
    '<div class="pos-history-filter-actions"><button class="btn small secondary" data-act="applyPosHistoryDate"' + (busy ? ' disabled' : '') + '>Apply date</button>' +
    (currentHistory.filterDate ? '<button class="btn small secondary" data-act="clearPosHistoryDate"' + (busy ? ' disabled' : '') + '>All dates</button>' : '') + '</div>' +
    (includeShift ? '<div class="pos-history-shift-filter"><label class="fld" for="posHistoryShiftFilter">Closed shift</label><select id="posHistoryShiftFilter"' + (shiftDisabled ? ' disabled' : '') + '>' + shiftOptions + '</select>' +
      '<p class="pos-history-count">' + shiftHelp + '</p></div>' : '') + '</div>';
}

export function posShiftReconcileHtml(
  label: LegacyValue,
  expected: LegacyValue,
  actual: LegacyValue,
  variance: LegacyValue,
): string {
  const value = runtimeFunction('Number')(variance || 0);
  const cls = value === 0 ? 'good' : 'bad';
  const varianceText = value === 0 ? 'Balanced' : ((value > 0 ? '+' : '') + runtimeFunction('peso')(value / 100));
  return '<div class="pos-shift-reconcile"><div class="lbl">' + runtimeFunction('escapeHtml')(label) + '</div><strong>' + runtimeFunction('peso')(runtimeFunction('Number')(actual || 0) / 100) + '</strong>' +
    '<div class="hint">Expected ' + runtimeFunction('peso')(runtimeFunction('Number')(expected || 0) / 100) + '</div><div class="pos-variance ' + cls + '">' + runtimeFunction('escapeHtml')(varianceText) + '</div></div>';
}

export function posClosedShiftHistoryHtml(rows: LegacyValue): string {
  return '<div class="pos-shift-history-list" role="list" aria-label="Closed shift history">' + (rows || []).map(function (row: LegacyValue) {
    const balanced = runtimeFunction('Number')(row.cash_variance_centavos || 0) === 0 && runtimeFunction('Number')(row.gcash_variance_centavos || 0) === 0 && runtimeFunction('Number')(row.gotyme_variance_centavos || 0) === 0;
    const dateTimeOptions: LegacyValue = { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    const timezone = checkout().shiftStatus && checkout().shiftStatus.business_timezone;
    if (timezone) dateTimeOptions.timeZone = timezone;
    const closed = row.closed_at ? new (runtimeValue<LegacyValue>('Date'))(row.closed_at) : null;
    const closedText = closed && !runtimeFunction('isNaN')(closed.getTime()) ? closed.toLocaleString('en-PH', dateTimeOptions) : '';
    const title = [row.register_name || 'Register', row.event_name || ''].filter(Boolean).join(' · ');
    const closedBy = runtimeFunction('String')(row.closed_by_display_name || 'Unknown user');
    return '<article class="pos-shift-history-card" role="listitem"><div class="pos-shift-history-head"><div class="pos-shift-history-title"><strong>' + runtimeFunction('escapeHtml')(title) + '</strong>' +
      '<div class="pos-report-meta">' + runtimeFunction('escapeHtml')(posFunction('posHistoryDateLabel')(row.closed_business_date || '')) + ' · closed ' + runtimeFunction('escapeHtml')(closedText) + ' by ' + runtimeFunction('escapeHtml')(closedBy) + '</div></div>' +
      '<span class="pos-state ' + (balanced ? 'good' : 'bad') + '">' + (balanced ? 'Balanced' : 'Has variance') + '</span><button class="btn small secondary" data-act="viewPosShiftTally" data-id="' + runtimeFunction('escapeHtml')(row.shift_id || '') + '">View drink tally</button></div>' +
      '<div class="pos-history-summary"><div class="metric"><div class="lbl">Gross sales</div><div class="val">' + runtimeFunction('peso')(runtimeFunction('Number')(row.gross_sales_centavos || 0) / 100) + '</div></div>' +
      '<div class="metric"><div class="lbl">Voids / refunds</div><div class="val">' + runtimeFunction('peso')(runtimeFunction('Number')(row.voided_sales_centavos || 0) / 100) + '</div></div>' +
      '<div class="metric"><div class="lbl">Net collected</div><div class="val">' + runtimeFunction('peso')(runtimeFunction('Number')(row.net_sales_centavos || 0) / 100) + '</div></div>' +
      '<div class="metric"><div class="lbl">Orders after voids</div><div class="val">' + runtimeValue<LegacyValue>('Math').max(0, runtimeFunction('Number')(row.net_sale_count) || 0).toLocaleString('en-PH') + '</div></div></div>' +
      '<div class="pos-shift-history-grid">' + posFunction('posShiftReconcileHtml')('Cash counted', row.expected_cash_centavos, row.counted_cash_centavos, row.cash_variance_centavos) +
      posFunction('posShiftReconcileHtml')('GCash verified', row.expected_gcash_centavos, row.verified_gcash_centavos, row.gcash_variance_centavos) +
      posFunction('posShiftReconcileHtml')('GoTyme verified', row.expected_gotyme_centavos, row.verified_gotyme_centavos, row.gotyme_variance_centavos) + '</div>' +
      (row.close_notes ? '<div class="pos-shift-note"><strong>Closing note:</strong> ' + runtimeFunction('escapeHtml')(row.close_notes) + '</div>' : '') + '</article>';
  }).join('') + '</div>';
}

export function posCsvCell(value: LegacyValue): string {
  let text = runtimeFunction('String')(value == null ? '' : value);
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function posBuildReportCsv(): string {
  const report = checkout().dailyReport;
  if (!report) return '';
  const canView = !!report.can_view_costs;
  const rows: LegacyValue[] = [
    [runtimeValue<LegacyValue>('APP_BRAND_NAME') + ' end-of-day report'],
    ['Business date', report.business_date || ''],
    ['Business timezone', report.business_timezone || ''],
    ['Mode', posFunction('posModeName')(!!report.is_training)],
    [],
    ['Metric', 'Value'],
    ['Gross orders', runtimeFunction('Number')(report.gross_sale_count || 0)],
    ['Voided orders', runtimeFunction('Number')(report.voided_sale_count || 0)],
    ['Net orders', runtimeFunction('Number')(report.net_sale_count || 0)],
    ['Gross items', runtimeFunction('Number')(report.gross_items_sold || 0)],
    ['Voided items', runtimeFunction('Number')(report.voided_items_sold || 0)],
    ['Net items', runtimeFunction('Number')(report.net_items_sold || 0)],
    ['Gross sales (PHP)', (runtimeFunction('Number')(report.gross_sales_centavos || 0) / 100).toFixed(2)],
    ['Voids (PHP)', (runtimeFunction('Number')(report.voided_sales_centavos || 0) / 100).toFixed(2)],
    ['Net collected (PHP)', (runtimeFunction('Number')(report.net_sales_centavos || 0) / 100).toFixed(2)],
    ['Cash net (PHP)', (runtimeFunction('Number')(report.cash_net_centavos || 0) / 100).toFixed(2)],
    ['GCash net (PHP)', (runtimeFunction('Number')(report.gcash_net_centavos || 0) / 100).toFixed(2)],
    ['GoTyme net (PHP)', (runtimeFunction('Number')(report.gotyme_net_centavos || 0) / 100).toFixed(2)],
  ];
  if (canView) {
    rows.push(['Estimated product cost (PHP)', (runtimeFunction('Number')(report.estimated_cost_centavos || 0) / 100).toFixed(2)]);
    rows.push(['Estimated gross profit (PHP)', (runtimeFunction('Number')(report.estimated_gross_profit_centavos || 0) / 100).toFixed(2)]);
  }
  return rows.map(function (row: LegacyValue) {
    return row.map(posFunction('posCsvCell')).join(',');
  }).join('\r\n');
}

export function downloadPosReport(): boolean {
  const csv = posFunction('posBuildReportCsv')();
  if (!csv) return false;
  const report = checkout().dailyReport || {};
  const RuntimeBlob = runtimeValue<LegacyValue>('Blob');
  const blob = new RuntimeBlob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const link = runtimeValue<LegacyValue>('document').createElement('a');
  const url = runtimeValue<LegacyValue>('URL').createObjectURL(blob);
  link.href = url;
  link.download = runtimeValue<LegacyValue>('APP_BRAND_SLUG') + '-' + runtimeFunction('String')(report.business_date || 'report') + '-' + (report.is_training ? 'training' : 'live') + '.csv';
  runtimeValue<LegacyValue>('document').body.appendChild(link);
  link.click();
  link.remove();
  runtimeValue<LegacyValue>('URL').revokeObjectURL(url);
  return true;
}

export function printPosReport(): boolean {
  if (!checkout().dailyReport) return false;
  runtimeValue<LegacyValue>('window').print();
  return true;
}

export async function setPosReportMode(mode: LegacyValue): Promise<boolean> {
  if (['live', 'training'].indexOf(mode) < 0 || checkout().shift || checkout().reportsLoading) return false;
  if (mode === 'training' && !posFunction('posCanManageOperations')()) return false;
  if (checkout().reportMode !== mode) runtimeFunction('clearPosReportData')();
  checkout().reportMode = mode;
  checkout().reportDate = '';
  modal().notice = 'Loading ' + posFunction('posModeName')(mode === 'training') + ' report…';
  posFunction('renderPosOpsModal')();
  const loaded = await runtimeFunction('loadPosCheckoutData')();
  if (!modal().open || modal().type !== 'report') return false;
  modal().result = checkout().dailyReport;
  modal().notice = checkout().reportsError || '';
  posFunction('renderPosOpsModal')();
  return !!(loaded && checkout().dailyReport && checkout().reportLoadedMode === mode);
}
