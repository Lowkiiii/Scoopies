import {
  modalFunction,
  runtimeFunction,
  runtimeValue,
  writeRuntimeBinding,
  type LegacyValue,
} from './bindings';

export async function saveMixture(): Promise<boolean> {
  modalFunction('consumePendingRemoteForCommit')(false);
  modalFunction('sanitizeMixtureSessionCategories')();
  const conflict = modalFunction('currentMixtureDraftConflict')();
  if (conflict) {
    modalFunction('setMixtureError')(
      conflict +
        ' Nothing was overwritten. Click Save draft to keep your work as a separate copy, then review both drafts.',
    );
    return false;
  }
  if (runtimeValue<LegacyValue>('quickIngredientDraft')) {
    modalFunction('setMixtureError')(
      'Add or cancel the new purchased ingredient before saving the combined cost. You can save this whole form as a draft now.',
    );
    return false;
  }
  const currentSource = runtimeValue<LegacyValue>('mixtureSourceId')
    ? runtimeFunction('getById')(
        runtimeValue<LegacyValue>('state').ingredients,
        runtimeValue<LegacyValue>('mixtureSourceId'),
      )
    : null;
  if (runtimeValue<LegacyValue>('mixtureSourceId') && !currentSource) {
    if (
      !runtimeFunction('confirm')(
        'The original mixture was deleted on another device. Save this draft as a new mixture instead?',
      )
    ) {
      modalFunction('setMixtureError')(
        'The original mixture is gone. Your draft is still safe.',
      );
      return false;
    }
    runtimeValue<LegacyValue>('mixtureDraft').id = runtimeFunction('uid')();
    writeRuntimeBinding('mixtureSourceId', '');
    writeRuntimeBinding('mixtureSourceSnapshot', null);
    writeRuntimeBinding('mixtureOriginalExisting', false);
  } else if (
    currentSource &&
    runtimeValue<LegacyValue>('mixtureSourceSnapshot') &&
    !runtimeFunction('sameDataValue')(
      currentSource,
      runtimeValue<LegacyValue>('mixtureSourceSnapshot'),
    )
  ) {
    if (
      !runtimeFunction('confirm')(
        'This mixture changed on another device after this draft was started. Overwrite the latest saved mixture with this draft?',
      )
    ) {
      modalFunction('setMixtureError')(
        'Nothing was overwritten. Your draft is still safe. Reopen it after reviewing the latest mixture.',
      );
      return false;
    }
  }
  if (
    !runtimeValue<LegacyValue>('mixtureSourceId') &&
    runtimeFunction('getById')(
      runtimeValue<LegacyValue>('state').ingredients,
      runtimeValue<LegacyValue>('mixtureDraft').id,
    )
  ) {
    runtimeValue<LegacyValue>('mixtureDraft').id = runtimeFunction('uid')();
  }
  const error = modalFunction('mixtureValidationError')();
  const box = runtimeValue<LegacyValue>('document').getElementById(
    'mixtureError',
  );
  if (error) {
    if (box) box.textContent = error;
    return false;
  }
  const referenced: Record<string, boolean> = {};
  runtimeValue<LegacyValue>('mixtureDraft').components.forEach(
    function (component: LegacyValue) {
      referenced[component.ingredientId] = true;
    },
  );
  (runtimeValue<LegacyValue>('mixtureDraft').pendingIngredients || [])
    .forEach(function (ingredient: LegacyValue) {
      if (
        referenced[ingredient.id] &&
        !runtimeFunction('getById')(
          runtimeValue<LegacyValue>('state').ingredients,
          ingredient.id,
        )
      ) {
        runtimeValue<LegacyValue>('state').ingredients.push(
          runtimeValue<LegacyValue>('Object').assign({}, ingredient),
        );
      }
    });
  const saved = runtimeValue<LegacyValue>('Object').assign(
    {},
    runtimeValue<LegacyValue>('mixtureDraft'),
  );
  delete saved.pendingIngredients;
  saved.name = saved.name.trim();
  saved.components = (saved.components || []).map(
    function (component: LegacyValue) {
      return {
        ingredientId: component.ingredientId,
        qty: component.qty,
        unit: component.unit,
      };
    },
  );
  const index = runtimeValue<LegacyValue>('state').ingredients.findIndex(
    function (ingredient: LegacyValue) {
      return ingredient.id === saved.id;
    },
  );
  if (index >= 0) {
    runtimeValue<LegacyValue>('state').ingredients[index] = saved;
  } else {
    runtimeValue<LegacyValue>('state').ingredients.push(saved);
  }
  if (runtimeValue<LegacyValue>('activeMixtureDraftId')) {
    runtimeValue<LegacyValue>('state').mixtureDrafts =
      runtimeValue<LegacyValue>('state').mixtureDrafts.filter(
        function (draft: LegacyValue) {
          return draft.id !== runtimeValue<LegacyValue>(
            'activeMixtureDraftId',
          );
        },
      );
  }
  runtimeValue<LegacyValue>('ingredientUi').category =
    saved.categoryId || 'uncategorized';
  runtimeValue<LegacyValue>('ingredientUi').search = '';
  runtimeFunction('logChanges')();
  runtimeFunction('save')();
  modalFunction('closeMixtureModal')(true);
  runtimeFunction('renderAll')();
  modalFunction('focusSoon')('[data-act="openMixtureModal"]');
  return true;
}
