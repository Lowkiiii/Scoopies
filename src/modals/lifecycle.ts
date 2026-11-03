import {
  runtimeFunction,
  runtimeValue,
  writeRuntimeBinding,
  type LegacyValue,
} from './bindings';

export function refreshModalBodyClass(): void {
  const open = runtimeValue<LegacyValue>('categoryModalOpen') ||
    runtimeValue<LegacyValue>('purchasedIngredientModalOpen') ||
    runtimeValue<LegacyValue>('mixtureModalOpen') ||
    runtimeValue<LegacyValue>('draftsModalOpen') ||
    runtimeValue<LegacyValue>('publishModalOpen') ||
    (runtimeValue<LegacyValue>('stockModal') &&
      runtimeValue<LegacyValue>('stockModal').open) ||
    (runtimeValue<LegacyValue>('posOpsModal') &&
      runtimeValue<LegacyValue>('posOpsModal').open);
  const document = runtimeValue<Document>('document');
  document.body.classList.toggle('modal-open', !!open);
  [document.querySelector('header'), document.querySelector('.wrap')]
    .forEach((element) => {
      if (!element) return;
      (element as HTMLElement).inert = !!open;
      if (open) element.setAttribute('aria-hidden', 'true');
      else element.removeAttribute('aria-hidden');
    });
}

export function focusSoon(selector: LegacyValue): void {
  runtimeFunction('setTimeout')(() => {
    const element = runtimeValue<Document>('document').querySelector(selector);
    if (element) (element as HTMLElement).focus();
  }, 0);
}

export function consumePendingRemoteForCommit(
  shouldRender?: LegacyValue,
): boolean {
  if (!runtimeValue<LegacyValue>('pendingRemote')) return false;
  const remote = runtimeFunction('normalizeState')(
    runtimeValue<LegacyValue>('pendingRemote'),
  );
  const merged = runtimeFunction('mergeStates')(
    runtimeValue<LegacyValue>('syncedState') || runtimeFunction('blank')(),
    runtimeValue<LegacyValue>('state'),
    remote,
  );
  const lifecycle = runtimeFunction('reconcileCostingInventoryLifecycle')(
    remote,
    merged,
    runtimeValue<LegacyValue>('syncedState') || runtimeFunction('blank')(),
  );
  writeRuntimeBinding('state', lifecycle.state);
  writeRuntimeBinding('pendingRemote', null);
  runtimeFunction('rememberSynced')(remote, false);
  writeRuntimeBinding(
    'lastState',
    runtimeFunction('snapshot')(runtimeValue<LegacyValue>('state')),
  );
  try {
    runtimeValue<Storage>('localStorage').setItem(
      runtimeValue<LegacyValue>('KEY'),
      runtimeValue<LegacyValue>('JSON').stringify(
        runtimeValue<LegacyValue>('state'),
      ),
    );
  } catch (_error) {
    // Classic intentionally treats local storage as best-effort here.
  }
  if (lifecycle.blocked.length) {
    runtimeFunction('setTimeout')(() => {
      runtimeFunction('alert')(
        'A partner already deleted or changed the stock identity for: ' +
        lifecycle.blocked.join(', ') +
        '. That source change won, so this device did not restore an unsafe stale ingredient.',
      );
    }, 0);
  }
  if (shouldRender !== false) runtimeFunction('renderAll')();
  return true;
}

export function applyPendingAfterModal(): void {
  runtimeFunction('setTimeout')(() => {
    if (
      runtimeValue<LegacyValue>('pendingRemote') &&
      !runtimeFunction('appIsEditing')()
    ) {
      runtimeFunction('maybeApplyRemote')(
        runtimeValue<LegacyValue>('pendingRemote'),
      );
    }
  }, 0);
}
