export const posOperationsNames = [
  'posStatusCanManage', 'posCanManageOperations', 'posRoleLabel',
  'posModeName', 'posModeFromPending', 'posOpsRequestStillCurrent',
  'posOperationErrorText', 'posOperationDeterministic', 'posCloseOpsModal',
  'posOpenOpsModal', 'openPosShiftModal', 'setPosOpenMode',
  'openPosCloseModal', 'openPosVoidModal', 'posOpsActionBlocked',
  'requirePosOpsVerification', 'openPosReportModal',
  'posHistoryRequestStillCurrent', 'posSalesHistoryBusy',
  'renderPosHistoryPreservingScroll', 'posHistoryErrorText',
  'openPosSalesHistory', 'reloadPosSalesHistory', 'setPosSalesHistoryMode',
  'setPosSalesHistoryView', 'validPosBusinessDate',
  'applyPosHistoryDateFilter', 'clearPosHistoryDateFilter',
  'setPosHistoryShiftFilter', 'viewPosShiftTally', 'requestPosHistoryRpc',
  'applyPosClosedShiftRows', 'loadPosSalesProductTally',
  'loadPosClosedShiftsPage', 'loadPosSalesHistoryPage', 'posVarianceHtml',
  'posCloseResultHtml', 'posReportHtml', 'posHistoryDateLabel',
  'posSalesHistorySummaryHtml', 'posSalesProductTallyHtml',
  'posHistoryFilterLabel', 'posHistoryShiftOptionLabel',
  'posHistoryFilterHtml', 'posShiftReconcileHtml',
  'posClosedShiftHistoryHtml', 'posCsvCell', 'posBuildReportCsv',
  'downloadPosReport', 'printPosReport', 'setPosReportMode',
  'renderPosOpsModal', 'submitPosOpenShift', 'posCloseValidation',
  'reviewPosCloseShift', 'backPosCloseShift', 'submitPosCloseShift',
  'reviewPosVoidSale', 'backPosVoidSale', 'submitPosVoidSale',
] as const;

export const protectedPosOperationsNames = [
  'posCanManageOperations', 'posOperationErrorText',
  'posOperationDeterministic', 'posCloseOpsModal', 'openPosShiftModal',
  'setPosOpenMode', 'openPosCloseModal', 'openPosVoidModal',
  'openPosReportModal', 'openPosSalesHistory', 'setPosSalesHistoryMode',
  'setPosSalesHistoryView', 'applyPosHistoryDateFilter',
  'setPosHistoryShiftFilter', 'loadPosSalesProductTally',
  'loadPosClosedShiftsPage', 'loadPosSalesHistoryPage', 'posCsvCell',
  'posBuildReportCsv', 'setPosReportMode', 'submitPosOpenShift',
  'reviewPosCloseShift', 'submitPosCloseShift', 'reviewPosVoidSale',
  'submitPosVoidSale',
] as const;

export const activeRuntimeFiles = [
  'boot.js', 'start.js',
] as const;

export const transitionRuntimeFiles = [
  'core.js', 'runtime-factories.js', 'state.js', 'costing.js',
  'pos-catalog.js', 'stocks.js', 'workspace-sync.js', 'pos-operations.js',
  'publication.js', 'render-costing.js', 'render-modals.js',
  'render-pos.js', 'render-stocks.js', 'support.js', 'events.js',
  'boot.js', 'compatibility.js', 'start.js',
] as const;
