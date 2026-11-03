import {
  modalFunction,
  runtimeFunction,
  runtimeValue,
  writeRuntimeBinding,
  type LegacyValue,
} from './bindings';

export function renderDraftButton(): void {
  const button = runtimeValue<LegacyValue>('document').getElementById(
    'mixtureDraftButton',
  );
  const count = (runtimeValue<LegacyValue>('state').mixtureDrafts || []).length;
  if (button) {
    button.textContent = 'Drafts (' + count + ')';
    button.setAttribute(
      'aria-label',
      'View ' + count + ' combined-cost draft' + (count === 1 ? '' : 's'),
    );
  }
}

export function formatDraftTime(value: LegacyValue): string {
  const date = new (runtimeValue<LegacyValue>('Date'))(value);
  if (runtimeFunction('isNaN')(date.getTime())) return 'Saved draft';
  try {
    return 'Updated ' + date.toLocaleString('en-PH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch (error) {
    return 'Updated ' + date.toLocaleString();
  }
}

export function renderDraftsModal(): void {
  const list = runtimeValue<LegacyValue>('document').getElementById(
    'draftsList',
  );
  if (!list) return;
  const drafts = (runtimeValue<LegacyValue>('state').mixtureDrafts || [])
    .slice()
    .sort(function (left: LegacyValue, right: LegacyValue) {
      return runtimeFunction('String')(right.updatedAt).localeCompare(
        runtimeFunction('String')(left.updatedAt),
      );
    });
  if (!drafts.length) {
    list.innerHTML = '<p class="empty">No saved combined-cost drafts.</p>';
    return;
  }
  list.innerHTML = drafts.map(function (draft: LegacyValue) {
    const data = draft.data || {};
    const category = runtimeFunction('getById')(
      runtimeValue<LegacyValue>('state').ingredientCategories,
      data.categoryId,
    );
    const count = (data.components || []).length;
    const displayName = runtimeFunction('String')(data.name || '').trim() ||
      'Untitled combined cost';
    const yieldText = modalFunction('hasDraftValue')(data.batchYield)
      ? ' &bull; Yield ' + runtimeFunction('escapeHtml')(data.batchYield) +
        ' ' + runtimeFunction('escapeHtml')(data.unit || '')
      : '';
    const quickText = draft.quickIngredient
      ? ' &bull; New ingredient in progress'
      : '';
    const mode = draft.conflictCopy
      ? 'Separate copy (partner changed the original)'
      : (draft.sourceMixtureId ? 'Editing saved mixture' : 'New combined cost');
    return '<article class="draft-card"><div class="draft-card-head"><div class="spacer"><div class="draft-card-name">' +
      runtimeFunction('escapeHtml')(displayName) + '</div>' +
      '<div class="draft-meta">' + runtimeFunction('escapeHtml')(mode) +
      ' &bull; ' + count + ' item' + (count === 1 ? '' : 's') +
      ' &bull; ' + runtimeFunction('escapeHtml')(
        category ? category.name : 'Uncategorized',
      ) + yieldText + quickText + '</div>' +
      '<div class="draft-meta">' + runtimeFunction('escapeHtml')(
        modalFunction('formatDraftTime')(draft.updatedAt),
      ) + '</div></div></div>' +
      '<div class="draft-actions"><button class="btn small secondary" data-act="deleteMixtureDraft" data-id="' +
      runtimeFunction('escapeHtml')(draft.id) + '" aria-label="Delete ' +
      runtimeFunction('escapeHtml')(displayName) +
      '">Delete</button><button class="btn small" data-act="resumeMixtureDraft" data-id="' +
      runtimeFunction('escapeHtml')(draft.id) + '" aria-label="Continue ' +
      runtimeFunction('escapeHtml')(displayName) +
      '">Continue</button></div></article>';
  }).join('');
}

export function openDraftsModal(): void {
  writeRuntimeBinding('draftsModalOpen', true);
  writeRuntimeBinding(
    'modalReturnFocus',
    runtimeValue<LegacyValue>('document').activeElement,
  );
  modalFunction('renderDraftsModal')();
  runtimeValue<LegacyValue>('document').getElementById(
    'draftsModal',
  ).hidden = false;
  modalFunction('refreshModalBodyClass')();
  modalFunction('focusSoon')(
    '#draftsModal [data-act="resumeMixtureDraft"],#draftsModal [data-act="closeDraftsModal"]',
  );
}

export function closeDraftsModal(
  skipRemote: LegacyValue,
  skipFocus: LegacyValue,
): void {
  writeRuntimeBinding('draftsModalOpen', false);
  runtimeValue<LegacyValue>('document').getElementById(
    'draftsModal',
  ).hidden = true;
  modalFunction('refreshModalBodyClass')();
  if (
    !skipFocus &&
    runtimeValue<LegacyValue>('modalReturnFocus') &&
    runtimeValue<LegacyValue>('modalReturnFocus').focus
  ) {
    runtimeValue<LegacyValue>('modalReturnFocus').focus();
  }
  if (!skipRemote) modalFunction('applyPendingAfterModal')();
}

export function resumeMixtureDraft(id: LegacyValue): void {
  modalFunction('consumePendingRemoteForCommit')(false);
  const record = runtimeFunction('getById')(
    runtimeValue<LegacyValue>('state').mixtureDrafts || [],
    id,
  );
  if (!record) {
    runtimeFunction('alert')('That draft is no longer available.');
    modalFunction('renderDraftsModal')();
    modalFunction('renderDraftButton')();
    return;
  }
  modalFunction('closeDraftsModal')(true, true);
  writeRuntimeBinding('mixtureDraft', runtimeFunction('snapshot')(record.data));
  const mixtureDraft = runtimeValue<LegacyValue>('mixtureDraft');
  mixtureDraft.pendingIngredients = runtimeValue<LegacyValue>('Array').isArray(
    mixtureDraft.pendingIngredients,
  )
    ? mixtureDraft.pendingIngredients
    : [];
  writeRuntimeBinding(
    'quickIngredientDraft',
    record.quickIngredient
      ? runtimeFunction('snapshot')(record.quickIngredient)
      : null,
  );
  writeRuntimeBinding('mixtureSourceId', record.sourceMixtureId || '');
  writeRuntimeBinding(
    'mixtureSourceSnapshot',
    record.sourceSnapshot
      ? runtimeFunction('snapshot')(record.sourceSnapshot)
      : null,
  );
  writeRuntimeBinding(
    'mixtureOriginalExisting',
    !!runtimeValue<LegacyValue>('mixtureSourceId'),
  );
  writeRuntimeBinding('activeMixtureDraftId', record.id);
  writeRuntimeBinding('openedMixtureDraftUpdatedAt', record.updatedAt || '');
  writeRuntimeBinding(
    'openedMixtureDraftFingerprint',
    runtimeFunction('stableSerialize')(record),
  );
  writeRuntimeBinding('mixtureReadOnly', false);
  writeRuntimeBinding('mixtureModalOpen', true);
  writeRuntimeBinding(
    'modalReturnFocus',
    runtimeValue<LegacyValue>('document').getElementById('mixtureDraftButton'),
  );
  modalFunction('sanitizeMixtureSessionCategories')();
  writeRuntimeBinding(
    'mixtureDraftNotice',
    runtimeValue<LegacyValue>('mixtureSourceId') &&
      !runtimeFunction('getById')(
        runtimeValue<LegacyValue>('state').ingredients,
        runtimeValue<LegacyValue>('mixtureSourceId'),
      )
      ? 'The original mixture was deleted. You can keep this draft and save it as a new mixture.'
      : 'Continuing a saved draft.',
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
  modalFunction('focusSoon')('#mixtureName');
}

export function deleteMixtureDraft(id: LegacyValue): void {
  modalFunction('consumePendingRemoteForCommit')(false);
  const state = runtimeValue<LegacyValue>('state');
  if (!runtimeValue<LegacyValue>('Array').isArray(state.mixtureDrafts)) {
    state.mixtureDrafts = [];
  }
  const record = runtimeFunction('getById')(state.mixtureDrafts || [], id);
  if (!record) {
    modalFunction('renderDraftsModal')();
    return;
  }
  const name = runtimeFunction('String')(
    record.data && record.data.name || '',
  ).trim() || 'Untitled combined cost';
  if (
    !runtimeFunction('confirm')(
      'Delete the draft "' + name + '"? This cannot be undone.',
    )
  ) {
    return;
  }
  state.mixtureDrafts = state.mixtureDrafts.filter(
    function (draft: LegacyValue) {
      return draft.id !== id;
    },
  );
  runtimeFunction('save')();
  runtimeFunction('renderAll')();
  modalFunction('renderDraftsModal')();
  modalFunction('focusSoon')(
    '#draftsModal [data-act="resumeMixtureDraft"],#draftsModal [data-act="closeDraftsModal"]',
  );
}
