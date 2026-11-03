import {
  runtimeFunction,
  runtimeValue,
  workspaceFunction,
  writeRuntimeBinding,
  type LegacyValue,
} from './bindings';

function incrementRuntimeBinding(name: string): LegacyValue {
  let value = runtimeValue<LegacyValue>(name);
  value++;
  writeRuntimeBinding(name, value);
  return value;
}

export async function loadPosCheckoutData(
  suppliedOptions?: LegacyValue,
): Promise<boolean> {
  const options = suppliedOptions || {};
  if (
    !runtimeValue<LegacyValue>('cloud').client ||
    !runtimeValue<LegacyValue>('session') ||
    !runtimeValue<LegacyValue>('session').user ||
    !runtimeValue<LegacyValue>('posContext').businessId
  ) {
    runtimeFunction('renderPos')();
    return false;
  }
  if (
    runtimeValue<LegacyValue>('posCheckout').submitting ||
    runtimeValue<LegacyValue>('posOpsModal').submitting
  ) {
    return false;
  }
  writeRuntimeBinding(
    'posLastSilentRefreshAttemptAt',
    runtimeValue<LegacyValue>('Date').now(),
  );
  const hydrated = runtimeFunction('posHydrateCatalogCache')();
  const background = !!options.background || hydrated;
  const generation = incrementRuntimeBinding('posCheckoutLoadGeneration');
  const catalogGeneration = incrementRuntimeBinding('posCatalogGeneration');
  const userId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('session').user.id || '',
  );
  const businessId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('posContext').businessId || '',
  );
  if (background) {
    runtimeValue<LegacyValue>('posCheckout').refreshing = true;
    runtimeValue<LegacyValue>('posCheckout').refreshError = '';
  } else {
    runtimeValue<LegacyValue>('posCheckout').catalogLoading = true;
    runtimeValue<LegacyValue>('posCheckout').shiftLoading = true;
  }
  runtimeFunction('setPosReportsLoading')(true);
  runtimeValue<LegacyValue>('posCheckout').catalogError = '';
  runtimeValue<LegacyValue>('posCheckout').shiftError = '';
  runtimeValue<LegacyValue>('posCheckout').reportsError = '';
  if (background) runtimeFunction('renderPosPreservingInteraction')();
  else runtimeFunction('renderPos')();
  runtimeFunction('syncOpenPosReportModal')();

  function request(name: LegacyValue, args: LegacyValue): Promise<LegacyValue> {
    try {
      return runtimeValue<LegacyValue>('Promise')
        .resolve(runtimeValue<LegacyValue>('cloud').client.rpc(name, args))
        .then(function (result: LegacyValue) {
          return { rows: runtimeFunction('rpcRows')(result), error: null };
        })
        .catch(function (error: LegacyValue) {
          return { rows: [], error };
        });
    } catch (error) {
      return runtimeValue<LegacyValue>('Promise').resolve({
        rows: [],
        error,
      });
    }
  }

  const initial = await runtimeValue<LegacyValue>('Promise').all([
    request('pos_get_catalog_v2', { p_business_id: businessId }),
    request('pos_get_shift_status', { p_business_id: businessId }),
  ]);
  if (
    !runtimeFunction('posLoadRequestStillCurrent')(
      generation,
      userId,
      businessId,
    )
  ) {
    return false;
  }
  const catalogResult = initial[0];
  const shiftResult = initial[1];
  if (
    workspaceFunction('posHandleAccessDenied')(catalogResult.error) ||
    workspaceFunction('posHandleAccessDenied')(shiftResult.error)
  ) {
    return false;
  }
  if (!background) {
    runtimeValue<LegacyValue>('posCheckout').shiftLoading = false;
  }
  if (
    catalogGeneration === runtimeValue<LegacyValue>('posCatalogGeneration')
  ) {
    runtimeValue<LegacyValue>('posCheckout').catalogLoading = false;
    if (catalogResult.error) {
      if (!background) {
        runtimeValue<LegacyValue>('posCheckout').catalogError =
          workspaceFunction('posRpcErrorText')(catalogResult.error);
      }
    } else {
      runtimeValue<LegacyValue>('posCheckout').catalog =
        catalogResult.rows || [];
      runtimeValue<LegacyValue>('posCheckout').catalogError = '';
      runtimeFunction('normalizePosCategory')();
      runtimeValue<LegacyValue>('posCheckout').catalogFromCache = false;
      runtimeValue<LegacyValue>('posCheckout').catalogVerifiedGeneration =
        catalogGeneration;
      runtimeFunction('markPosCartAgainstCatalog')();
      runtimeFunction('posRestorePending')();
      runtimeFunction('posRememberCatalogCache')();
    }
  }
  if (shiftResult.error || !shiftResult.rows.length) {
    if (background) {
      runtimeValue<LegacyValue>('posCheckout').refreshing = false;
      runtimeValue<LegacyValue>('posCheckout').checkoutRefreshRequired = true;
      runtimeValue<LegacyValue>('posCheckout').refreshError =
        'Could not verify the register. Your current screen is preserved; retry before confirming payment.';
      runtimeFunction('setPosReportsLoading')(false);
      runtimeValue<LegacyValue>('posCheckout').reportsError =
        'Sales totals were not refreshed.';
      runtimeFunction('renderPosPreservingInteraction')();
      runtimeFunction('syncOpenPosReportModal')();
      return false;
    }
    runtimeValue<LegacyValue>('posCheckout').shift = null;
    runtimeValue<LegacyValue>('posCheckout').shiftStatus = null;
    runtimeFunction('clearPosReportData')();
    runtimeValue<LegacyValue>('posCheckout').loaded = false;
    runtimeValue<LegacyValue>('posCheckout').checkoutRefreshRequired = true;
    runtimeValue<LegacyValue>('posCheckout').shiftError = shiftResult.error
      ? workspaceFunction('posRpcErrorText')(shiftResult.error)
      : 'No active register was found. Ask an owner to check the POS setup.';
    runtimeFunction('setPosReportsLoading')(false);
    runtimeValue<LegacyValue>('posCheckout').reportsError =
      'Shift and report totals were not loaded.';
    runtimeValue<LegacyValue>('document').body.classList.remove(
      'pos-training',
    );
    runtimeFunction('renderPos')();
    runtimeFunction('syncOpenPosReportModal')();
    return false;
  }
  const previousShift = runtimeValue<LegacyValue>('posCheckout').shift;
  runtimeValue<LegacyValue>('posCheckout').shiftStatus = shiftResult.rows[0];
  runtimeValue<LegacyValue>('posCheckout').shift =
    runtimeValue<LegacyValue>('posCheckout').shiftStatus.has_open_shift &&
      runtimeValue<LegacyValue>('posCheckout').shiftStatus.shift_id
      ? runtimeValue<LegacyValue>('posCheckout').shiftStatus
      : null;
  runtimeValue<LegacyValue>('posCheckout').loaded = true;
  runtimeValue<LegacyValue>('posCheckout').shiftLoading = false;
  runtimeValue<LegacyValue>('posCheckout').shiftError = '';
  if (
    !runtimeValue<LegacyValue>('posCheckout').pending &&
    runtimeValue<LegacyValue>('posCheckout').lastReceipt
  ) {
    if (
      !runtimeValue<LegacyValue>('posCheckout').shift ||
      (
        runtimeValue<LegacyValue>('posCheckout').lastReceipt.shift_id &&
        runtimeFunction('String')(
          runtimeValue<LegacyValue>('posCheckout').lastReceipt.shift_id,
        ) !== runtimeFunction('String')(
          runtimeValue<LegacyValue>('posCheckout').shift.shift_id,
        )
      )
    ) {
      runtimeValue<LegacyValue>('posCheckout').lastReceipt = null;
    } else if (
      previousShift &&
      runtimeFunction('String')(previousShift.shift_id) !==
        runtimeFunction('String')(
          runtimeValue<LegacyValue>('posCheckout').shift.shift_id,
        )
    ) {
      runtimeValue<LegacyValue>('posCheckout').lastReceipt = null;
    }
  }
  if (runtimeValue<LegacyValue>('posCheckout').shift) {
    runtimeValue<LegacyValue>('posCheckout').reportMode =
      runtimeValue<LegacyValue>('posCheckout').shift.is_training
        ? 'training'
        : 'live';
  } else if (runtimeValue<LegacyValue>('posCheckout').pending) {
    runtimeValue<LegacyValue>('posCheckout').reportMode =
      runtimeFunction('posModeFromPending')();
  } else if (
    !runtimeFunction('posStatusCanManage')(
      runtimeValue<LegacyValue>('posCheckout').shiftStatus,
    )
  ) {
    runtimeValue<LegacyValue>('posCheckout').reportMode = 'live';
  }
  runtimeValue<LegacyValue>('document').body.classList.toggle(
    'pos-training',
    !!(
      runtimeValue<LegacyValue>('posCheckout').shift &&
      runtimeValue<LegacyValue>('posCheckout').shift.is_training
    ),
  );
  const isTraining =
    runtimeValue<LegacyValue>('posCheckout').reportMode === 'training';
  const requestedMode = isTraining ? 'training' : 'live';
  const requestedDate = runtimeFunction('String')(
    runtimeValue<LegacyValue>('posCheckout').reportDate || '',
  );
  if (
    runtimeValue<LegacyValue>('posCheckout').reportLoadedMode &&
    (
      runtimeValue<LegacyValue>('posCheckout').reportLoadedMode !==
        requestedMode ||
      (
        requestedDate &&
        runtimeValue<LegacyValue>('posCheckout').reportLoadedDate !==
          requestedDate
      )
    )
  ) {
    runtimeFunction('clearPosReportData')();
  }
  const reportArgs = {
    p_business_id: businessId,
    p_business_date:
      runtimeValue<LegacyValue>('posCheckout').reportDate || null,
    p_is_training: isTraining,
  };
  const reports = await runtimeValue<LegacyValue>('Promise').all([
    request('pos_get_end_of_day_summary', reportArgs),
    request('pos_get_recent_sales_v2', {
      p_business_id: businessId,
      p_is_training: isTraining,
      p_limit: 20,
    }),
  ]);
  if (
    !runtimeFunction('posLoadRequestStillCurrent')(
      generation,
      userId,
      businessId,
    )
  ) {
    return false;
  }
  runtimeFunction('setPosReportsLoading')(false);
  const summaryResult = reports[0];
  const recentResult = reports[1];
  if (
    workspaceFunction('posHandleAccessDenied')(summaryResult.error) ||
    workspaceFunction('posHandleAccessDenied')(recentResult.error)
  ) {
    return false;
  }
  if (summaryResult.error || recentResult.error) {
    runtimeValue<LegacyValue>('posCheckout').reportsError =
      'The ' + (isTraining ? 'training' : 'live') +
      ' totals could not be refreshed.';
  }
  if (!summaryResult.error) {
    runtimeValue<LegacyValue>('posCheckout').summary =
      summaryResult.rows[0] || null;
    runtimeValue<LegacyValue>('posCheckout').dailyReport =
      runtimeValue<LegacyValue>('posCheckout').summary;
    if (
      runtimeValue<LegacyValue>('posCheckout').summary &&
      runtimeValue<LegacyValue>('posCheckout').summary.business_date
    ) {
      runtimeValue<LegacyValue>('posCheckout').reportDate =
        runtimeFunction('String')(
          runtimeValue<LegacyValue>('posCheckout').summary.business_date,
        );
      runtimeValue<LegacyValue>('posCheckout').reportLoadedDate =
        runtimeValue<LegacyValue>('posCheckout').reportDate;
    } else {
      runtimeValue<LegacyValue>('posCheckout').reportLoadedDate = requestedDate;
    }
    runtimeValue<LegacyValue>('posCheckout').reportLoadedMode = requestedMode;
  } else if (!background) {
    runtimeValue<LegacyValue>('posCheckout').summary = null;
    runtimeValue<LegacyValue>('posCheckout').dailyReport = null;
    runtimeValue<LegacyValue>('posCheckout').reportLoadedMode = '';
    runtimeValue<LegacyValue>('posCheckout').reportLoadedDate = '';
  }
  if (!recentResult.error) {
    runtimeValue<LegacyValue>('posCheckout').recent = recentResult.rows || [];
  } else if (!background) {
    runtimeValue<LegacyValue>('posCheckout').recent = [];
  }
  const catalogCurrent =
    catalogGeneration === runtimeValue<LegacyValue>('posCatalogGeneration')
      ? !catalogResult.error
      : runtimeValue<LegacyValue>('posCheckout')
          .catalogVerifiedGeneration ===
        runtimeValue<LegacyValue>('posCatalogGeneration');
  runtimeValue<LegacyValue>('posCheckout').refreshing = false;
  runtimeValue<LegacyValue>('posCheckout').checkoutRefreshRequired =
    !catalogCurrent;
  if (!catalogCurrent) {
    runtimeValue<LegacyValue>('posCheckout').refreshError =
      'Could not refresh the menu. Existing cards are preserved; retry before confirming payment.';
  } else if (summaryResult.error || recentResult.error) {
    runtimeValue<LegacyValue>('posCheckout').refreshError =
      'Checkout is ready, but sales totals could not refresh.';
  } else {
    runtimeValue<LegacyValue>('posCheckout').refreshError = '';
  }
  if (catalogCurrent) {
    runtimeValue<LegacyValue>('posCheckout').lastUpdatedAt =
      runtimeValue<LegacyValue>('Date').now();
  }
  if (background) runtimeFunction('renderPosPreservingInteraction')();
  else runtimeFunction('renderPos')();
  runtimeFunction('syncOpenPosReportModal')();
  return catalogCurrent && !shiftResult.error;
}

export function refreshPosSilently(force?: LegacyValue): Promise<boolean> {
  if (
    !runtimeValue<LegacyValue>('cloud').client ||
    !runtimeValue<LegacyValue>('session') ||
    !runtimeValue<LegacyValue>('session').user ||
    !runtimeValue<LegacyValue>('posContext').businessId
  ) {
    return runtimeValue<LegacyValue>('Promise').resolve(false);
  }
  if (
    runtimeValue<LegacyValue>('posCheckout').submitting ||
    runtimeValue<LegacyValue>('posOpsModal').submitting
  ) {
    return runtimeValue<LegacyValue>('Promise').resolve(false);
  }
  if (runtimeValue<LegacyValue>('posSilentRefreshPromise')) {
    return runtimeValue<LegacyValue>('posSilentRefreshPromise');
  }
  const now = runtimeValue<LegacyValue>('Date').now();
  if (
    !force &&
    runtimeValue<LegacyValue>('posLastSilentRefreshAttemptAt') &&
    now - runtimeValue<LegacyValue>('posLastSilentRefreshAttemptAt') <
      runtimeValue<LegacyValue>('POS_SILENT_REFRESH_MIN_AGE_MS')
  ) {
    return runtimeValue<LegacyValue>('Promise').resolve(true);
  }
  writeRuntimeBinding('posLastSilentRefreshAttemptAt', now);
  const warm = !!(
    runtimeValue<LegacyValue>('posCheckout').loaded ||
    runtimeValue<LegacyValue>('posCheckout').catalogFromCache ||
    runtimeValue<LegacyValue>('posCheckout').catalog.length
  );
  const task = workspaceFunction('loadPosCheckoutData')({ background: warm });
  writeRuntimeBinding('posSilentRefreshPromise', task);
  return task.finally(function () {
    if (runtimeValue<LegacyValue>('posSilentRefreshPromise') === task) {
      writeRuntimeBinding('posSilentRefreshPromise', null);
    }
  });
}

export function refreshPosAfterMutation(): Promise<boolean> {
  const active = runtimeValue<LegacyValue>('posSilentRefreshPromise');
  const userId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('session') &&
        runtimeValue<LegacyValue>('session').user &&
        runtimeValue<LegacyValue>('session').user.id ||
      '',
  );
  const businessId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('posContext').businessId || '',
  );
  function stillCurrent(): boolean {
    return !!(
      userId &&
      businessId &&
      runtimeValue<LegacyValue>('session') &&
      runtimeValue<LegacyValue>('session').user &&
      runtimeFunction('String')(
        runtimeValue<LegacyValue>('session').user.id || '',
      ) === userId &&
      runtimeFunction('String')(
        runtimeValue<LegacyValue>('posContext').businessId || '',
      ) === businessId
    );
  }
  if (!stillCurrent()) {
    return runtimeValue<LegacyValue>('Promise').resolve(false);
  }
  if (!active) return workspaceFunction('refreshPosSilently')(true);
  return runtimeValue<LegacyValue>('Promise')
    .resolve(active)
    .catch(function () {
      return false;
    })
    .then(function () {
      if (!stillCurrent()) return false;
      if (runtimeValue<LegacyValue>('posSilentRefreshPromise') === active) {
        writeRuntimeBinding('posSilentRefreshPromise', null);
      }
      return workspaceFunction('refreshPosSilently')(true);
    });
}

export async function refreshPosCatalogOnly(): Promise<boolean> {
  if (
    !runtimeValue<LegacyValue>('cloud').client ||
    !runtimeValue<LegacyValue>('session') ||
    !runtimeValue<LegacyValue>('session').user ||
    !runtimeValue<LegacyValue>('posContext').businessId
  ) {
    return false;
  }
  const generation = incrementRuntimeBinding('posCatalogGeneration');
  const userId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('session').user.id || '',
  );
  const businessId = runtimeFunction('String')(
    runtimeValue<LegacyValue>('posContext').businessId || '',
  );
  if (!runtimeValue<LegacyValue>('posCheckout').catalog.length) {
    runtimeValue<LegacyValue>('posCheckout').catalogLoading = true;
  }
  runtimeValue<LegacyValue>('posCheckout').catalogError = '';
  runtimeFunction('renderPos')();
  try {
    const rows = runtimeFunction('rpcRows')(
      await runtimeValue<LegacyValue>('cloud').client.rpc(
        'pos_get_catalog_v2',
        { p_business_id: businessId },
      ),
    );
    if (
      !runtimeFunction('posCatalogRequestStillCurrent')(
        generation,
        userId,
        businessId,
      )
    ) {
      return false;
    }
    runtimeValue<LegacyValue>('posCheckout').catalog = rows || [];
    runtimeValue<LegacyValue>('posCheckout').catalogLoading = false;
    runtimeValue<LegacyValue>('posCheckout').catalogError = '';
    runtimeValue<LegacyValue>('posCheckout').catalogFromCache = false;
    runtimeValue<LegacyValue>('posCheckout').catalogVerifiedGeneration =
      generation;
    runtimeFunction('normalizePosCategory')();
    runtimeFunction('markPosCartAgainstCatalog')();
    runtimeFunction('posRestorePending')();
    runtimeFunction('posRememberCatalogCache')();
    runtimeFunction('renderPos')();
    return true;
  } catch (error) {
    if (
      !runtimeFunction('posCatalogRequestStillCurrent')(
        generation,
        userId,
        businessId,
      )
    ) {
      return false;
    }
    if (workspaceFunction('posHandleAccessDenied')(error)) return false;
    runtimeValue<LegacyValue>('posCheckout').catalogLoading = false;
    if (!runtimeValue<LegacyValue>('posCheckout').catalog.length) {
      runtimeValue<LegacyValue>('posCheckout').catalogError =
        workspaceFunction('posRpcErrorText')(error);
    }
    if (
      !runtimeValue<LegacyValue>('posCheckout').refreshing &&
      runtimeValue<LegacyValue>('posCheckout').loaded
    ) {
      runtimeValue<LegacyValue>('posCheckout').checkoutRefreshRequired = true;
      runtimeValue<LegacyValue>('posCheckout').refreshError =
        'Could not refresh the menu. Retry before confirming payment.';
    }
    runtimeFunction('renderPos')();
    return false;
  }
}

export async function openPosRegister(
  refresh?: LegacyValue,
): Promise<boolean> {
  if (runtimeValue<LegacyValue>('posCheckout').submitting) return false;
  if (!runtimeValue<LegacyValue>('posContext').businessId) {
    const ready = await workspaceFunction('loadPosContext')();
    if (!ready || !runtimeValue<LegacyValue>('posContext').businessId) {
      return false;
    }
  }
  if (
    refresh &&
    (
      runtimeValue<LegacyValue>('posCheckout').loaded ||
      runtimeValue<LegacyValue>('posCheckout').catalogFromCache ||
      runtimeValue<LegacyValue>('posCheckout').catalog.length
    )
  ) {
    return workspaceFunction('refreshPosSilently')(true);
  }
  if (
    refresh ||
    (
      !runtimeValue<LegacyValue>('posCheckout').loaded &&
      !runtimeValue<LegacyValue>('posCheckout').catalog.length
    ) ||
    runtimeValue<LegacyValue>('posCheckout').catalogError
  ) {
    return workspaceFunction('loadPosCheckoutData')();
  }
  runtimeFunction('renderPos')();
  return true;
}
