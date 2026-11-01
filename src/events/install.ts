import { runtimeValue } from './bindings';
import {
  handleBodyChange,
  handleBodyInput,
  handleImageError,
  handleNavigationClick,
} from './form-handlers';
import {
  handleBodyFocusout,
  handlePointerDown,
  handlePointerEnd,
  handlePointerMove,
  handleWindowFocus,
} from './lifecycle-handlers';
import { handleActionClick } from './action-handler';
import { handleBackdropClick, handleBodyKeydown } from './modal-keyboard';

const installedRoots = new WeakSet<Window>();

export function installEventHandlers(
  target: Window & typeof globalThis,
): boolean {
  if (installedRoots.has(target)) return false;
  installedRoots.add(target);

  const document = target.document;
  document
    .querySelector('nav')!
    .addEventListener('click', handleNavigationClick as EventListener);
  document.body.addEventListener(
    'error',
    handleImageError as EventListener,
    true,
  );
  document.body.addEventListener(
    'input',
    handleBodyInput as EventListener,
  );
  document.body.addEventListener(
    'change',
    handleBodyChange as EventListener,
  );
  document.body.addEventListener(
    'click',
    handleActionClick as EventListener,
  );
  document.body.addEventListener(
    'click',
    handleBackdropClick as EventListener,
  );
  target.addEventListener('focus', handleWindowFocus as EventListener);
  target.addEventListener(
    'online',
    runtimeValue('retryDirtySave') as EventListener,
  );
  document.body.addEventListener(
    'focusout',
    handleBodyFocusout as EventListener,
  );
  document.body.addEventListener(
    'pointerdown',
    handlePointerDown as EventListener,
  );
  document.body.addEventListener(
    'pointermove',
    handlePointerMove as EventListener,
  );
  document.body.addEventListener(
    'pointerup',
    handlePointerEnd as EventListener,
  );
  document.body.addEventListener(
    'pointercancel',
    handlePointerEnd as EventListener,
  );
  document.body.addEventListener(
    'lostpointercapture',
    handlePointerEnd as EventListener,
  );
  document.body.addEventListener(
    'keydown',
    handleBodyKeydown as EventListener,
  );
  return true;
}
