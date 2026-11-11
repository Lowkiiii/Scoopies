import {
  incrementRuntimeBinding,
  runtimeValue,
  writeRuntimeBinding,
} from './bindings';
import type { LegacyValue } from './types';
import {
  beginStockRowDrag,
  endStockRowDrag,
  moveStockRowDrag,
} from '../stocks/reorder';

export function handleWindowFocus(): void {
  if (
    !runtimeValue('cloud').connected ||
    runtimeValue('pendingSave') ||
    runtimeValue('costingCloudLoading') ||
    runtimeValue('publishSubmitting') ||
    runtimeValue('posCheckout').submitting
  ) {
    return;
  }
  if (runtimeValue('localDirty')) {
    runtimeValue('retryDirtySave')();
    return;
  }
  if (!runtimeValue('session') || !runtimeValue('session').user) return;
  const costingGeneration = incrementRuntimeBinding('costingLoadGeneration');
  const costingUserId = String(runtimeValue('session').user.id || '');
  writeRuntimeBinding('costingCloudReady', false);
  writeRuntimeBinding('costingCloudLoading', true);
  runtimeValue('renderProducts')();
  runtimeValue('cloudLoad')()
    .then(function (remote: LegacyValue) {
      if (
        !runtimeValue('costingRequestIsCurrent')(
          costingGeneration,
          costingUserId,
        )
      ) {
        return;
      }
      writeRuntimeBinding('costingCloudReady', true);
      writeRuntimeBinding('costingCloudLoading', false);
      runtimeValue('maybeApplyRemote')(remote);
      runtimeValue('subscribeRealtime')();
      runtimeValue('renderProducts')();
    })
    .catch(function () {
      if (
        !runtimeValue('costingRequestIsCurrent')(
          costingGeneration,
          costingUserId,
        )
      ) {
        return;
      }
      writeRuntimeBinding('costingCloudReady', false);
      writeRuntimeBinding('costingCloudLoading', false);
      runtimeValue('renderProducts')();
    });
  const document = runtimeValue<Document>('document');
  const posSection = document.getElementById('pos');
  if (
    runtimeValue('session') &&
    posSection &&
    posSection.classList.contains('active') &&
    !runtimeValue('appIsEditing')()
  ) {
    if (runtimeValue('posContext').businessId) {
      runtimeValue('refreshPosSilently')(false).catch(function () {});
    } else if (!runtimeValue('posContext').loading) {
      runtimeValue('loadPosContext')()
        .then(function (ready: LegacyValue) {
          if (ready) return runtimeValue('openPosRegister')(true);
        })
        .catch(function () {});
    }
  }
  const stockSection = document.getElementById('stocks');
  if (
    runtimeValue('session') &&
    stockSection &&
    stockSection.classList.contains('active') &&
    !runtimeValue('appIsEditing')()
  ) {
    runtimeValue('openStocks')(true).catch(function () {});
  }
}

export function handleBodyFocusout(): void {
  if (!runtimeValue('pendingRemote')) return;
  runtimeValue('setTimeout')(function () {
    if (!runtimeValue('appIsEditing')()) {
      runtimeValue('maybeApplyRemote')(runtimeValue('pendingRemote'));
    }
  }, 60);
}

export function handlePointerDown(event: LegacyValue): void {
  if (beginStockRowDrag(event)) return;
  runtimeValue('beginPosDrinkImageDrag')(event);
}

export function handlePointerMove(event: LegacyValue): void {
  if (moveStockRowDrag(event)) return;
  runtimeValue('movePosDrinkImageDrag')(event);
}

export function handlePointerEnd(event: LegacyValue): void {
  if (endStockRowDrag(event)) return;
  runtimeValue('endPosDrinkImageDrag')(event);
}
