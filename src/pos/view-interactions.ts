import { runtimeValue } from './bindings';

type LegacyValue = any;
type LegacyFunction = (...args: LegacyValue[]) => LegacyValue;

function runtimeFunction(name: string): LegacyFunction {
  return runtimeValue<LegacyFunction>(name);
}

function checkout(): LegacyValue {
  return runtimeValue('posCheckout');
}

export function updatePosPaymentPreview(): void {
  const total = runtimeFunction('posCartTotalCentavos')();
  const cash = runtimeFunction('strictPesoCentavos')(checkout().cashReceived);
  const change = cash == null ? null : cash - total;
  const changeEl = runtimeValue<LegacyValue>('document').getElementById('posChangeValue');
  if (changeEl) {
    changeEl.className = change != null && change >= 0 ? 'pos-change' : '';
    changeEl.innerHTML = change != null && change >= 0 ? '<strong>Change: ' + runtimeFunction('peso')(change / 100) + '</strong>' : '';
  }
  const errorEl = runtimeValue<LegacyValue>('document').querySelector('#posCartPanel .pos-error');
  if (errorEl && checkout().error) errorEl.textContent = '';
  const button = runtimeValue<LegacyValue>('document').querySelector('#posCartPanel [data-act="reviewPosSale"]');
  const validation = runtimeFunction('posCheckoutValidation')();
  if (button) button.disabled = (!validation.valid && !checkout().pending) || checkout().submitting;
}

export function managePosMenu(): boolean {
  if (!runtimeFunction('posCanManageOperations')()) return false;
  if (runtimeValue<LegacyValue>('posOpsModal').open) runtimeFunction('posCloseOpsModal')(true);
  if (!runtimeFunction('activateAppTab')('products', false)) return false;
  runtimeFunction('focusSoon')('#products [data-act="openPublishModal"]');
  return true;
}

export function focusPosCart(): boolean {
  const panel = runtimeValue<LegacyValue>('document').getElementById('posCartPanel');
  if (!panel) return false;
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    panel.focus({ preventScroll: true });
  } catch (error) {
    panel.focus();
  }
  return true;
}

export function renderPosPreservingInteraction(): void {
  let root = runtimeValue<LegacyValue>('document').getElementById('posRoot');
  const active = runtimeValue<LegacyValue>('document').activeElement;
  let saved: LegacyValue = null;
  if (root && active && root.contains(active)) {
    saved = {
      id: active.id || '',
      tag: runtimeValue<LegacyFunction>('String')(active.tagName || ''),
      act: active.dataset && active.dataset.act || '',
      dataId: active.dataset && active.dataset.id || '',
      method: active.dataset && active.dataset.method || '',
      centavos: active.dataset && active.dataset.centavos || '',
      mode: active.dataset && active.dataset.mode || '',
      start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
      end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
    };
  }
  runtimeFunction('renderPos')();
  if (!saved) return;
  root = runtimeValue<LegacyValue>('document').getElementById('posRoot');
  if (!root) return;
  let next = saved.id ? runtimeValue<LegacyValue>('document').getElementById(saved.id) : null;
  if (!next && saved.act) {
    next = runtimeValue<LegacyValue>('Array').prototype.find.call(root.querySelectorAll('[data-act]'), function (node: LegacyValue) {
      return runtimeValue<LegacyFunction>('String')(node.dataset.act || '') === saved.act && runtimeValue<LegacyFunction>('String')(node.dataset.id || '') === saved.dataId &&
        runtimeValue<LegacyFunction>('String')(node.dataset.method || '') === saved.method && runtimeValue<LegacyFunction>('String')(node.dataset.centavos || '') === saved.centavos &&
        runtimeValue<LegacyFunction>('String')(node.dataset.mode || '') === saved.mode;
    }) || null;
  }
  if (!next || next.disabled) return;
  try {
    next.focus({ preventScroll: true });
  } catch (error) {
    try { next.focus(); } catch (ignore) {}
  }
  if (saved.start != null && typeof next.setSelectionRange === 'function') {
    try { next.setSelectionRange(saved.start, saved.end); } catch (error) {}
  }
}
