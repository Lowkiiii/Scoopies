import {
  costingRequestIsCurrent,
  loadPosContext,
  loadPosPublicationStatus,
  posHandleAccessDenied,
  posRequestIsCurrent,
  posRpcErrorText,
} from './context';
import {
  loadPosCheckoutData,
  openPosRegister,
  refreshPosAfterMutation,
  refreshPosCatalogOnly,
  refreshPosSilently,
} from './refresh';
import {
  buildPosPendingSale,
  cancelPosConfirmation,
  posCheckoutValidation,
  reviewPosSale,
} from './checkout';
import {
  posCheckoutErrorText,
  posDeterministicError,
  submitPosSale,
} from './submission';

export const WORKSPACE_API = {
  posRequestIsCurrent,
  costingRequestIsCurrent,
  loadPosPublicationStatus,
  loadPosContext,
  posRpcErrorText,
  posHandleAccessDenied,
  loadPosCheckoutData,
  refreshPosSilently,
  refreshPosAfterMutation,
  refreshPosCatalogOnly,
  openPosRegister,
  posCheckoutValidation,
  buildPosPendingSale,
  posDeterministicError,
  posCheckoutErrorText,
  reviewPosSale,
  cancelPosConfirmation,
  submitPosSale,
};
