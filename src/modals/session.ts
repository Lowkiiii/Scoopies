import {
  modalFunction,
  runtimeFunction,
  runtimeValue,
  writeRuntimeBinding,
  type LegacyValue,
} from './bindings';

export function newMixtureDraft(): LegacyValue {
  const selected = runtimeFunction('selectedRealCategory')();
  return {
    id: runtimeFunction('uid')(),
    kind: 'mixture',
    name: '',
    categoryId: selected ? selected.id : '',
    batchYield: '',
    unit: 'ml',
    components: [],
    pendingIngredients: [],
  };
}

export function draftIngredientLookup(id: LegacyValue): LegacyValue {
  const selfDraft = runtimeValue<LegacyValue>('mixtureDraft');
  if (selfDraft && selfDraft.id === id) {
    return runtimeValue<LegacyValue>('mixtureDraft');
  }
  const pendingDraft = runtimeValue<LegacyValue>('mixtureDraft');
  const pending = pendingDraft && runtimeFunction('getById')(
    pendingDraft.pendingIngredients || [],
    id,
  );
  return pending || runtimeFunction('getById')(
    runtimeValue<LegacyValue>('state').ingredients,
    id,
  );
}

export function mixtureCandidates(): LegacyValue[] {
  if (!runtimeValue<LegacyValue>('mixtureDraft')) return [];
  const draft = runtimeValue<LegacyValue>('mixtureDraft');
  const list = runtimeValue<LegacyValue>('state').ingredients
    .concat(draft.pendingIngredients || [])
    .filter(function (item: LegacyValue) {
      return item.id !== runtimeValue<LegacyValue>('mixtureDraft').id;
    });
  return list.filter(function (item: LegacyValue) {
    return !runtimeFunction('ingredientDependsOn')(
      item.id,
      runtimeValue<LegacyValue>('mixtureDraft').id,
      {},
      modalFunction('draftIngredientLookup'),
    );
  });
}

export function draftMixtureInfo(): LegacyValue {
  return runtimeValue<LegacyValue>('mixtureDraft')
    ? runtimeFunction('ingredientCostInfo')(
      runtimeValue<LegacyValue>('mixtureDraft'),
      [],
      modalFunction('draftIngredientLookup'),
    )
    : {
      valid: false,
      costPerBase: runtimeValue<LegacyValue>('NaN'),
      batchCost: runtimeValue<LegacyValue>('NaN'),
      error: '',
    };
}

export function sanitizeMixtureSessionCategories(): void {
  const draft = runtimeValue<LegacyValue>('mixtureDraft');
  if (!draft) return;
  if (
    draft.categoryId &&
    !runtimeFunction('getById')(
      runtimeValue<LegacyValue>('state').ingredientCategories,
      draft.categoryId,
    )
  ) {
    draft.categoryId = '';
  }
  (draft.pendingIngredients || []).forEach(function (item: LegacyValue) {
    if (
      item.categoryId &&
      !runtimeFunction('getById')(
        runtimeValue<LegacyValue>('state').ingredientCategories,
        item.categoryId,
      )
    ) {
      item.categoryId = '';
    }
  });
  const quick = runtimeValue<LegacyValue>('quickIngredientDraft');
  if (
    quick &&
    quick.categoryId &&
    !runtimeFunction('getById')(
      runtimeValue<LegacyValue>('state').ingredientCategories,
      quick.categoryId,
    )
  ) {
    quick.categoryId = '';
  }
}

export function captureMixtureSession(): LegacyValue {
  return {
    data: runtimeValue<LegacyValue>('mixtureDraft')
      ? runtimeFunction('snapshot')(runtimeValue<LegacyValue>('mixtureDraft'))
      : null,
    quickIngredient: runtimeValue<LegacyValue>('quickIngredientDraft')
      ? runtimeFunction('snapshot')(
        runtimeValue<LegacyValue>('quickIngredientDraft'),
      )
      : null,
    sourceMixtureId: runtimeValue<LegacyValue>('mixtureSourceId') || '',
  };
}

export function mixtureSessionChanged(): boolean {
  return !runtimeFunction('sameDataValue')(
    modalFunction('captureMixtureSession')(),
    runtimeValue<LegacyValue>('mixtureInitialSnapshot'),
  );
}

export function hasDraftValue(value: LegacyValue): boolean {
  return value !== '' &&
    value != null &&
    runtimeFunction('String')(value).trim() !== '';
}

export function mixtureSessionHasMeaningfulWork(): boolean {
  const draft = runtimeValue<LegacyValue>('mixtureDraft');
  if (!draft) return false;
  if (
    runtimeFunction('String')(draft.name || '').trim() ||
    modalFunction('hasDraftValue')(draft.batchYield)
  ) {
    return true;
  }
  const initial = runtimeValue<LegacyValue>('mixtureInitialSnapshot') &&
    runtimeValue<LegacyValue>('mixtureInitialSnapshot').data;
  if (
    initial &&
    (draft.categoryId !== initial.categoryId || draft.unit !== initial.unit)
  ) {
    return true;
  }
  if ((draft.pendingIngredients || []).length) return true;
  if (
    (draft.components || []).some(function (component: LegacyValue) {
      return !!runtimeFunction('String')(component.ingredientId || '').trim() ||
        modalFunction('hasDraftValue')(component.qty);
    })
  ) {
    return true;
  }
  const quick = runtimeValue<LegacyValue>('quickIngredientDraft');
  return !!(
    quick &&
    (
      runtimeFunction('String')(quick.name || '').trim() ||
      modalFunction('hasDraftValue')(quick.purchaseQty) ||
      modalFunction('hasDraftValue')(quick.amountPerItem) ||
      modalFunction('hasDraftValue')(quick.price)
    )
  );
}

export function setMixtureError(message: LegacyValue): void {
  const box = runtimeValue<LegacyValue>('document').getElementById(
    'mixtureError',
  );
  if (box) box.textContent = message || '';
}

export function openMixtureModal(
  id: LegacyValue,
  readOnly: LegacyValue,
): void {
  const current = id
    ? runtimeFunction('getById')(
      runtimeValue<LegacyValue>('state').ingredients,
      id,
    )
    : null;
  if (id && !runtimeFunction('isMixture')(current)) {
    runtimeFunction('alert')('That mixture is no longer available.');
    return;
  }
  writeRuntimeBinding('mixtureOriginalExisting', !!current);
  writeRuntimeBinding(
    'mixtureDraft',
    current
      ? runtimeFunction('snapshot')(current)
      : modalFunction('newMixtureDraft')(),
  );
  runtimeValue<LegacyValue>('mixtureDraft').pendingIngredients = [];
  writeRuntimeBinding('mixtureSourceId', current ? current.id : '');
  writeRuntimeBinding(
    'mixtureSourceSnapshot',
    current ? runtimeFunction('snapshot')(current) : null,
  );
  writeRuntimeBinding('activeMixtureDraftId', '');
  writeRuntimeBinding('openedMixtureDraftUpdatedAt', '');
  writeRuntimeBinding('openedMixtureDraftFingerprint', '');
  writeRuntimeBinding('mixtureDraftNotice', '');
  writeRuntimeBinding('mixtureReadOnly', !!readOnly);
  writeRuntimeBinding('mixtureSaving', false);
  writeRuntimeBinding('quickIngredientDraft', null);
  writeRuntimeBinding('mixtureModalOpen', true);
  writeRuntimeBinding(
    'modalReturnFocus',
    runtimeValue<LegacyValue>('document').activeElement,
  );
  writeRuntimeBinding(
    'mixtureInitialSnapshot',
    modalFunction('captureMixtureSession')(),
  );
  runtimeValue<LegacyValue>('document').getElementById(
    'mixtureModal',
  ).hidden = false;
  modalFunction('refreshModalBodyClass')();
  modalFunction('renderMixtureModal')();
  runtimeFunction('setTimeout')(function () {
    const element = runtimeValue<LegacyValue>('document').getElementById(
      runtimeValue<LegacyValue>('mixtureReadOnly')
        ? 'closeMixtureButton'
        : 'mixtureName',
    );
    if (element) element.focus();
  }, 0);
}

export function closeMixtureModal(skipRemote: LegacyValue): void {
  const returnFocus = runtimeValue<LegacyValue>('modalReturnFocus');
  writeRuntimeBinding('mixtureModalOpen', false);
  writeRuntimeBinding('mixtureDraft', null);
  writeRuntimeBinding('quickIngredientDraft', null);
  writeRuntimeBinding('mixtureReadOnly', false);
  writeRuntimeBinding('mixtureSaving', false);
  writeRuntimeBinding('mixtureOriginalExisting', false);
  writeRuntimeBinding('activeMixtureDraftId', '');
  writeRuntimeBinding('openedMixtureDraftUpdatedAt', '');
  writeRuntimeBinding('openedMixtureDraftFingerprint', '');
  writeRuntimeBinding('mixtureInitialSnapshot', null);
  writeRuntimeBinding('mixtureSourceId', '');
  writeRuntimeBinding('mixtureSourceSnapshot', null);
  writeRuntimeBinding('mixtureDraftNotice', '');
  runtimeValue<LegacyValue>('document').getElementById(
    'mixtureModal',
  ).hidden = true;
  modalFunction('refreshModalBodyClass')();
  if (
    returnFocus &&
    returnFocus.focus &&
    returnFocus.isConnected
  ) {
    returnFocus.focus();
  } else {
    modalFunction('focusSoon')('#mixtureDraftButton');
  }
  if (!skipRemote) modalFunction('applyPendingAfterModal')();
}

export function currentMixtureDraftConflict(): string {
  if (!runtimeValue<LegacyValue>('activeMixtureDraftId')) return '';
  const stored = runtimeFunction('getById')(
    runtimeValue<LegacyValue>('state').mixtureDrafts || [],
    runtimeValue<LegacyValue>('activeMixtureDraftId'),
  );
  if (
    !stored &&
    runtimeValue<LegacyValue>('openedMixtureDraftUpdatedAt')
  ) {
    return 'This draft was deleted on another device.';
  }
  if (
    stored &&
    runtimeValue<LegacyValue>('openedMixtureDraftFingerprint') &&
    runtimeFunction('stableSerialize')(stored) !==
      runtimeValue<LegacyValue>('openedMixtureDraftFingerprint')
  ) {
    return 'This draft changed on another device.';
  }
  if (
    stored &&
    runtimeValue<LegacyValue>('openedMixtureDraftUpdatedAt') &&
    stored.updatedAt !== runtimeValue<LegacyValue>('openedMixtureDraftUpdatedAt')
  ) {
    return 'This draft changed on another device.';
  }
  return '';
}

export function saveCurrentMixtureDraft(
  closeAfter: LegacyValue,
  automatic: LegacyValue,
): boolean {
  if (
    !runtimeValue<LegacyValue>('mixtureDraft') ||
    runtimeValue<LegacyValue>('mixtureReadOnly') ||
    runtimeValue<LegacyValue>('mixtureSaving')
  ) {
    return false;
  }
  if (
    !modalFunction('mixtureSessionHasMeaningfulWork')() &&
    !runtimeValue<LegacyValue>('activeMixtureDraftId') &&
    !runtimeValue<LegacyValue>('mixtureSourceId')
  ) {
    if (!automatic) {
      modalFunction('setMixtureError')(
        'Add a name, item, yield, or purchased-ingredient detail before saving a draft.',
      );
    }
    return false;
  }
  modalFunction('consumePendingRemoteForCommit')(false);
  modalFunction('sanitizeMixtureSessionCategories')();
  let state = runtimeValue<LegacyValue>('state');
  if (!runtimeValue<LegacyValue>('Array').isArray(state.mixtureDrafts)) {
    state.mixtureDrafts = [];
  }
  const conflict = modalFunction('currentMixtureDraftConflict')();
  const savedAsCopy = !!conflict;
  if (savedAsCopy) {
    writeRuntimeBinding('activeMixtureDraftId', '');
    writeRuntimeBinding('openedMixtureDraftUpdatedAt', '');
    writeRuntimeBinding('openedMixtureDraftFingerprint', '');
    if (!runtimeValue<LegacyValue>('mixtureSourceId')) {
      runtimeValue<LegacyValue>('mixtureDraft').id = runtimeFunction('uid')();
    }
    runtimeFunction('remapDraftOwnedIds')(
      runtimeValue<LegacyValue>('mixtureDraft'),
      runtimeValue<LegacyValue>('quickIngredientDraft'),
      function () {
        return runtimeFunction('uid')();
      },
    );
  }
  const now = new (runtimeValue<LegacyValue>('Date'))().toISOString();
  state = runtimeValue<LegacyValue>('state');
  const existing = runtimeValue<LegacyValue>('activeMixtureDraftId')
    ? runtimeFunction('getById')(
      state.mixtureDrafts || [],
      runtimeValue<LegacyValue>('activeMixtureDraftId'),
    )
    : null;
  const record = {
    id: runtimeValue<LegacyValue>('activeMixtureDraftId') ||
      runtimeFunction('uid')(),
    createdAt: existing && existing.createdAt || now,
    updatedAt: now,
    sourceMixtureId: runtimeValue<LegacyValue>('mixtureSourceId') || '',
    sourceSnapshot: runtimeValue<LegacyValue>('mixtureSourceSnapshot')
      ? runtimeFunction('snapshot')(
        runtimeValue<LegacyValue>('mixtureSourceSnapshot'),
      )
      : null,
    conflictCopy: savedAsCopy || !!(existing && existing.conflictCopy),
    data: runtimeFunction('snapshot')(
      runtimeValue<LegacyValue>('mixtureDraft'),
    ),
    quickIngredient: runtimeValue<LegacyValue>('quickIngredientDraft')
      ? runtimeFunction('snapshot')(
        runtimeValue<LegacyValue>('quickIngredientDraft'),
      )
      : null,
  };
  const index = (state.mixtureDrafts || []).findIndex(
    function (draft: LegacyValue) {
      return draft.id === record.id;
    },
  );
  if (index >= 0) state.mixtureDrafts[index] = record;
  else state.mixtureDrafts.push(record);
  writeRuntimeBinding('activeMixtureDraftId', record.id);
  writeRuntimeBinding('openedMixtureDraftUpdatedAt', record.updatedAt);
  writeRuntimeBinding(
    'openedMixtureDraftFingerprint',
    runtimeFunction('stableSerialize')(record),
  );
  writeRuntimeBinding(
    'mixtureInitialSnapshot',
    modalFunction('captureMixtureSession')(),
  );
  writeRuntimeBinding(
    'mixtureDraftNotice',
    savedAsCopy
      ? 'The other draft changed, so your work was saved as a separate draft copy.'
      : 'Draft saved. It will not affect costing until you finish it.',
  );
  runtimeFunction('save')();
  const messageConnected =
    runtimeValue<LegacyValue>('cloud').connected &&
    runtimeValue<LegacyValue>('session');
  const statusConnected =
    runtimeValue<LegacyValue>('cloud').connected &&
    runtimeValue<LegacyValue>('session');
  runtimeFunction('setStatus')(
    messageConnected ? 'Draft saved — syncing…' : 'Draft saved on device',
    statusConnected ? '' : 'good',
  );
  runtimeFunction('renderAll')();
  if (closeAfter) modalFunction('closeMixtureModal')(true);
  else modalFunction('renderMixtureModal')();
  return true;
}

export function requestCloseMixtureModal(): void {
  if (!runtimeValue<LegacyValue>('mixtureModalOpen')) return;
  if (runtimeValue<LegacyValue>('mixtureSaving')) return;
  if (runtimeValue<LegacyValue>('mixtureReadOnly')) {
    modalFunction('closeMixtureModal')(false);
    return;
  }
  if (
    modalFunction('mixtureSessionChanged')() &&
    (
      modalFunction('mixtureSessionHasMeaningfulWork')() ||
      runtimeValue<LegacyValue>('activeMixtureDraftId') ||
      runtimeValue<LegacyValue>('mixtureSourceId')
    )
  ) {
    modalFunction('saveCurrentMixtureDraft')(true, true);
    return;
  }
  modalFunction('closeMixtureModal')(false);
}

export function discardMixtureChanges(): void {
  if (runtimeValue<LegacyValue>('mixtureSaving')) return;
  if (
    modalFunction('mixtureSessionChanged')() &&
    (
      modalFunction('mixtureSessionHasMeaningfulWork')() ||
      runtimeValue<LegacyValue>('activeMixtureDraftId') ||
      runtimeValue<LegacyValue>('mixtureSourceId')
    ) &&
    !runtimeFunction('confirm')(
      runtimeValue<LegacyValue>('activeMixtureDraftId')
        ? 'Discard changes made since this draft was opened? The last saved draft will stay available.'
        : 'Discard these unsaved changes?',
    )
  ) {
    return;
  }
  modalFunction('closeMixtureModal')(false);
}
