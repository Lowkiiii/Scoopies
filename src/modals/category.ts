import {
  modalFunction,
  runtimeFunction,
  runtimeValue,
  writeRuntimeBinding,
  type LegacyValue,
} from './bindings';

export function openCategoryModal(id?: LegacyValue): void {
  writeRuntimeBinding('categoryEditId', id || '');
  writeRuntimeBinding('categoryModalOpen', true);
  const document = runtimeValue<Document>('document');
  writeRuntimeBinding('modalReturnFocus', document.activeElement);
  const categoryEditId = runtimeValue<LegacyValue>('categoryEditId');
  const current = categoryEditId
    ? runtimeFunction('getById')(
        runtimeValue<LegacyValue>('state').ingredientCategories,
        categoryEditId,
      )
    : null;
  document.getElementById('categoryModalTitle')!.textContent = current
    ? 'Rename category'
    : 'Add ingredient category';
  (document.getElementById('categoryName') as HTMLInputElement).value = current
    ? current.name
    : '';
  document.getElementById('categoryError')!.textContent = '';
  (document.getElementById('categoryModal') as HTMLElement).hidden = false;
  modalFunction('refreshModalBodyClass')();
  runtimeFunction('setTimeout')(() => {
    (runtimeValue<Document>('document').getElementById(
      'categoryName',
    ) as HTMLElement).focus();
  }, 0);
}

export function closeCategoryModal(skipRemote?: LegacyValue): void {
  writeRuntimeBinding('categoryModalOpen', false);
  writeRuntimeBinding('categoryEditId', '');
  (runtimeValue<Document>('document').getElementById(
    'categoryModal',
  ) as HTMLElement).hidden = true;
  modalFunction('refreshModalBodyClass')();
  const modalReturnFocus = runtimeValue<LegacyValue>('modalReturnFocus');
  if (modalReturnFocus && modalReturnFocus.focus) modalReturnFocus.focus();
  if (!skipRemote) modalFunction('applyPendingAfterModal')();
}

export function purchasedIngredientCategoryOptions(
  selected?: LegacyValue,
): string {
  return '<option value=""' + (!selected ? ' selected' : '') +
    '>Uncategorized</option>' +
    runtimeValue<LegacyValue>('state').ingredientCategories.map(
      (category: LegacyValue) => '<option value="' +
        runtimeFunction('escapeHtml')(category.id) + '"' +
        (runtimeFunction('String')(category.id) ===
          runtimeFunction('String')(selected || '')
          ? ' selected'
          : '') + '>' + runtimeFunction('escapeHtml')(category.name) +
        '</option>',
    ).join('');
}

export function openPurchasedIngredientModal(): void {
  const selected = runtimeFunction('selectedRealCategory')();
  writeRuntimeBinding('purchasedIngredientModalOpen', true);
  const document = runtimeValue<Document>('document');
  writeRuntimeBinding('purchasedIngredientReturnFocus', document.activeElement);
  (document.getElementById('purchasedIngredientName') as HTMLInputElement).value = '';
  (document.getElementById(
    'purchasedIngredientCategory',
  ) as HTMLSelectElement).innerHTML = modalFunction(
    'purchasedIngredientCategoryOptions',
  )(selected ? selected.id : '');
  (document.getElementById('purchasedIngredientUnit') as HTMLSelectElement).value = '';
  document.getElementById('purchasedIngredientError')!.textContent = '';
  (document.getElementById('purchasedIngredientModal') as HTMLElement).hidden = false;
  modalFunction('refreshModalBodyClass')();
  modalFunction('focusSoon')('#purchasedIngredientName');
}

export function closePurchasedIngredientModal(
  skipRemote?: LegacyValue,
): void {
  writeRuntimeBinding('purchasedIngredientModalOpen', false);
  (runtimeValue<Document>('document').getElementById(
    'purchasedIngredientModal',
  ) as HTMLElement).hidden = true;
  modalFunction('refreshModalBodyClass')();
  const returnFocus = runtimeValue<LegacyValue>(
    'purchasedIngredientReturnFocus',
  );
  if (returnFocus && returnFocus.focus) returnFocus.focus();
  writeRuntimeBinding('purchasedIngredientReturnFocus', null);
  if (!skipRemote) modalFunction('applyPendingAfterModal')();
}

export function savePurchasedIngredient(): boolean {
  const document = runtimeValue<Document>('document');
  const name = runtimeFunction('String')(
    (document.getElementById('purchasedIngredientName') as HTMLInputElement)
      .value || '',
  ).trim();
  let categoryId = runtimeFunction('String')(
    (document.getElementById(
      'purchasedIngredientCategory',
    ) as HTMLSelectElement).value || '',
  );
  const unit = runtimeFunction('String')(
    (document.getElementById(
      'purchasedIngredientUnit',
    ) as HTMLSelectElement).value || '',
  );
  modalFunction('consumePendingRemoteForCommit')(false);
  let error = '';
  if (!name) error = 'Enter an ingredient name.';
  else if (
    runtimeValue<LegacyValue>('state').ingredients.some(
      (item: LegacyValue) => runtimeFunction('String')(item.name || '')
        .trim().toLowerCase() === name.toLowerCase(),
    )
  ) error = 'An ingredient or mixture with that name already exists.';
  else if (!runtimeValue<LegacyValue>('UNIT_TYPE')[unit]) {
    error = 'Choose whether this ingredient is measured by weight, volume, or pieces.';
  }
  if (
    categoryId &&
    !runtimeFunction('getById')(
      runtimeValue<LegacyValue>('state').ingredientCategories,
      categoryId,
    )
  ) categoryId = '';
  if (error) {
    document.getElementById('purchasedIngredientError')!.textContent = error;
    return false;
  }
  const created = {
    id: runtimeFunction('uid')(),
    kind: 'purchased',
    categoryId,
    name,
    purchaseQty: '',
    amountPerItem: '',
    unit,
    price: '',
  };
  runtimeValue<LegacyValue>('state').ingredients.push(created);
  runtimeValue<LegacyValue>('ingredientUi').search = '';
  runtimeValue<LegacyValue>('ingredientUi').category =
    categoryId || 'uncategorized';
  runtimeFunction('logChanges')();
  runtimeFunction('save')();
  modalFunction('closePurchasedIngredientModal')(true);
  runtimeFunction('renderAll')();
  modalFunction('focusSoon')(
    '[data-entity="ingredient"][data-id="' + created.id +
    '"] [data-field="purchaseQty"]',
  );
  return true;
}

export function categoryNameError(
  name?: LegacyValue,
  id?: LegacyValue,
): string {
  const clean = runtimeFunction('String')(name || '').trim();
  if (!clean) return 'Enter a category name.';
  const reserved = ['all', 'uncategorized'];
  if (reserved.indexOf(clean.toLowerCase()) >= 0) {
    return 'That name is reserved by the app.';
  }
  if (
    runtimeValue<LegacyValue>('state').ingredientCategories.some(
      (category: LegacyValue) => category.id !== id &&
        category.name.toLowerCase() === clean.toLowerCase(),
    )
  ) return 'A category with that name already exists.';
  return '';
}

export function saveCategory(): boolean {
  modalFunction('consumePendingRemoteForCommit')();
  const document = runtimeValue<Document>('document');
  const name = (document.getElementById('categoryName') as HTMLInputElement)
    .value.trim();
  const categoryEditId = runtimeValue<LegacyValue>('categoryEditId');
  const error = modalFunction('categoryNameError')(name, categoryEditId);
  if (error) {
    document.getElementById('categoryError')!.textContent = error;
    return false;
  }
  if (categoryEditId) {
    const current = runtimeFunction('getById')(
      runtimeValue<LegacyValue>('state').ingredientCategories,
      categoryEditId,
    );
    if (!current) {
      document.getElementById('categoryError')!.textContent =
        'This category was removed on another device. Close and try again.';
      return false;
    }
    current.name = name;
  } else {
    const created = { id: runtimeFunction('uid')(), name };
    runtimeValue<LegacyValue>('state').ingredientCategories.push(created);
    runtimeValue<LegacyValue>('ingredientUi').category = created.id;
  }
  runtimeFunction('logChanges')();
  runtimeFunction('save')();
  modalFunction('closeCategoryModal')(true);
  runtimeFunction('renderAll')();
  modalFunction('focusSoon')('[data-act="openCategoryModal"]');
  return true;
}

export function deleteCategory(id: LegacyValue): boolean {
  const category = runtimeFunction('getById')(
    runtimeValue<LegacyValue>('state').ingredientCategories,
    id,
  );
  if (!category) return false;
  const count = runtimeValue<LegacyValue>('state').ingredients.filter(
    (item: LegacyValue) => item.categoryId === id,
  ).length;
  const draftCount = (runtimeValue<LegacyValue>('state').mixtureDrafts || [])
    .filter(
      (draft: LegacyValue) => draft.data && draft.data.categoryId === id,
    ).length;
  if (
    !runtimeFunction('confirm')(
      'Delete the folder "' + category.name + '"? ' + count + ' item' +
      (count === 1 ? '' : 's') +
      (draftCount
        ? ' and ' + draftCount + ' draft' + (draftCount === 1 ? '' : 's')
        : '') + ' will move to Uncategorized.',
    )
  ) return false;
  runtimeValue<LegacyValue>('state').ingredients.forEach(
    (item: LegacyValue) => {
      if (item.categoryId === id) item.categoryId = '';
    },
  );
  (runtimeValue<LegacyValue>('state').mixtureDrafts || []).forEach(
    (draft: LegacyValue) => {
      let changed = false;
      if (draft.data && draft.data.categoryId === id) {
        draft.data.categoryId = '';
        changed = true;
      }
      if (draft.sourceSnapshot && draft.sourceSnapshot.categoryId === id) {
        draft.sourceSnapshot.categoryId = '';
        changed = true;
      }
      ((draft.data && draft.data.pendingIngredients) || []).forEach(
        (item: LegacyValue) => {
          if (item.categoryId === id) {
            item.categoryId = '';
            changed = true;
          }
        },
      );
      if (draft.quickIngredient && draft.quickIngredient.categoryId === id) {
        draft.quickIngredient.categoryId = '';
        changed = true;
      }
      if (changed) {
        draft.updatedAt = new (runtimeValue<LegacyValue>('Date'))()
          .toISOString();
      }
    },
  );
  runtimeValue<LegacyValue>('state').ingredientCategories =
    runtimeValue<LegacyValue>('state').ingredientCategories.filter(
      (item: LegacyValue) => item.id !== id,
    );
  runtimeValue<LegacyValue>('ingredientUi').category = 'uncategorized';
  runtimeFunction('logChanges')();
  runtimeFunction('save')();
  runtimeFunction('renderAll')();
  return true;
}
