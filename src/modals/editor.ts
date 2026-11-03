import {
  modalFunction,
  runtimeFunction,
  runtimeValue,
  writeRuntimeBinding,
  type LegacyValue,
} from './bindings';

export function focusLastMixtureField(field: LegacyValue): void {
  runtimeFunction('setTimeout')(function () {
    const rows = runtimeValue<LegacyValue>('document').querySelectorAll(
      '#mixtureModal [data-mix-index]',
    );
    const row = rows[rows.length - 1];
    const element = row && row.querySelector(
      '[data-mix-field="' + field + '"]',
    );
    if (element) element.focus();
  }, 0);
}

export function mixtureComponentCost(component: LegacyValue): number {
  const source = modalFunction('draftIngredientLookup')(
    component.ingredientId,
  );
  if (
    !source ||
    runtimeValue<LegacyValue>('UNIT_TYPE')[component.unit] !==
      runtimeValue<LegacyValue>('UNIT_TYPE')[source.unit]
  ) {
    return runtimeValue<number>('NaN');
  }
  return runtimeFunction('toBase')(component.qty, component.unit) *
    runtimeFunction('ingCostPerBase')(
      source,
      [],
      modalFunction('draftIngredientLookup'),
    );
}

export function beginQuickIngredient(): void {
  writeRuntimeBinding('quickIngredientDraft', {
    id: runtimeFunction('uid')(),
    kind: 'purchased',
    name: '',
    categoryId:
      runtimeValue<LegacyValue>('mixtureDraft').categoryId || '',
    purchaseQty: '',
    amountPerItem: '',
    unit: 'g',
    price: '',
  });
  modalFunction('renderMixtureModal')();
  runtimeFunction('setTimeout')(function () {
    const element = runtimeValue<LegacyValue>('document').getElementById(
      'quickIngredientName',
    );
    if (element) element.focus();
  }, 0);
}

export function setMixtureSaving(active: LegacyValue): void {
  writeRuntimeBinding('mixtureSaving', !!active);
  const content = runtimeValue<LegacyValue>('document').getElementById(
    'mixtureModalContent',
  );
  if (content) {
    content.setAttribute(
      'aria-busy',
      runtimeValue<LegacyValue>('mixtureSaving') ? 'true' : 'false',
    );
  }
  runtimeValue<LegacyValue>('document')
    .querySelectorAll(
      '#mixtureModal button,#mixtureModal input,#mixtureModal select,#mixtureModal textarea',
    )
    .forEach(function (control: LegacyValue) {
      if (runtimeValue<LegacyValue>('mixtureSaving')) {
        control.dataset.mixtureWasDisabled = control.disabled ? '1' : '0';
        control.disabled = true;
      } else if (
        runtimeValue<LegacyValue>('Object').prototype.hasOwnProperty.call(
          control.dataset,
          'mixtureWasDisabled',
        )
      ) {
        control.disabled = control.dataset.mixtureWasDisabled === '1';
        delete control.dataset.mixtureWasDisabled;
      }
    });
}

export function renderMixtureModal(): void {
  if (!runtimeValue<LegacyValue>('mixtureDraft')) return;
  const content = runtimeValue<LegacyValue>('document').getElementById(
    'mixtureModalContent',
  );
  const disabled = runtimeValue<LegacyValue>('mixtureReadOnly')
    ? ' disabled'
    : '';
  const candidates = modalFunction('mixtureCandidates')();
  const rows = (runtimeValue<LegacyValue>('mixtureDraft').components || [])
    .map(function (component: LegacyValue, index: number) {
      const source = modalFunction('draftIngredientLookup')(
        component.ingredientId,
      );
      const allowed = source
        ? runtimeValue<LegacyValue>('TYPE_UNITS')[
            runtimeValue<LegacyValue>('UNIT_TYPE')[source.unit]
          ] || runtimeValue<LegacyValue>('unitOptions')
        : runtimeValue<LegacyValue>('unitOptions');
      const missingOption = component.ingredientId && !source
        ? '<option value="' +
          runtimeFunction('escapeHtml')(component.ingredientId) +
          '" selected>[Missing ingredient - replace this]</option>'
        : '';
      return '<div class="component-grid" data-mix-index="' + index + '">' +
        '<select data-mix-field="ingredientId" aria-label="Component ingredient"' + disabled + '><option value="">— pick an item —</option>' + missingOption + runtimeFunction('ingredientOptions')(component.ingredientId, candidates) + '</select>' +
        '<input data-mix-field="qty" type="number" min="0" step="any" value="' + runtimeFunction('escapeHtml')(component.qty) + '" aria-label="Component quantity"' + disabled + '>' +
        '<select data-mix-field="unit" aria-label="Component unit"' + disabled + '>' + runtimeFunction('optionList')(allowed, component.unit) + '</select>' +
        '<div class="component-cost">' + runtimeFunction('peso')(modalFunction('mixtureComponentCost')(component)) + '</div>' +
        (runtimeValue<LegacyValue>('mixtureReadOnly')
          ? ''
          : '<button class="icon-btn" data-act="removeMixtureComponent" data-idx="' + index + '" aria-label="Remove component">&times;</button>') +
        '</div>';
    })
    .join('');
  let quick = '';
  if (
    !runtimeValue<LegacyValue>('mixtureReadOnly') &&
    runtimeValue<LegacyValue>('quickIngredientDraft')
  ) {
    quick = '<div class="quick-panel"><strong>New purchased ingredient</strong><p class="hint">This will be saved together with the mixture.</p><div class="grid2">' +
      '<div><label class="fld" for="quickIngredientName">Ingredient name</label><input id="quickIngredientName" data-quick-field="name" value="' + runtimeFunction('escapeHtml')(runtimeValue<LegacyValue>('quickIngredientDraft').name) + '"></div>' +
      '<div><label class="fld">Category</label><select data-quick-field="categoryId" aria-label="New ingredient category">' + runtimeFunction('categoryOptions')(runtimeValue<LegacyValue>('quickIngredientDraft').categoryId) + '</select></div>' +
      '<div><label class="fld">Quantity bought</label><input data-quick-field="purchaseQty" aria-label="New ingredient quantity bought" type="number" min="0" step="any" value="' + runtimeFunction('escapeHtml')(runtimeValue<LegacyValue>('quickIngredientDraft').purchaseQty) + '"></div>' +
      '<div><label class="fld">Amount in each</label><div class="row"><input data-quick-field="amountPerItem" aria-label="Amount in each purchased item" type="number" min="0" step="any" value="' + runtimeFunction('escapeHtml')(runtimeValue<LegacyValue>('quickIngredientDraft').amountPerItem) + '"><select data-quick-field="unit" aria-label="New ingredient unit" style="width:95px">' + runtimeFunction('optionList')(runtimeValue<LegacyValue>('unitOptions'), runtimeValue<LegacyValue>('quickIngredientDraft').unit) + '</select></div></div>' +
      '<div><label class="fld">Total price (&#8369;)</label><input data-quick-field="price" aria-label="New ingredient total price" type="number" min="0" step="any" value="' + runtimeFunction('escapeHtml')(runtimeValue<LegacyValue>('quickIngredientDraft').price) + '"></div></div>' +
      '<div id="quickIngredientError" class="modal-error" aria-live="assertive"></div><div class="row"><button class="btn small secondary" data-act="cancelQuickIngredient">Cancel</button><button class="btn small" data-act="addQuickIngredient">Add to mixture</button></div></div>';
  }
  const info = modalFunction('draftMixtureInfo')();
  const modalTitle = runtimeValue<LegacyValue>('mixtureReadOnly')
    ? 'Mixture details'
    : runtimeValue<LegacyValue>('activeMixtureDraftId')
      ? 'Continue combined-cost draft'
      : runtimeValue<LegacyValue>('mixtureSourceId')
        ? 'Edit combined cost'
        : 'Add combined cost';
  const closeLabel = runtimeValue<LegacyValue>('mixtureReadOnly')
    ? 'Close mixture dialog'
    : 'Save draft and close mixture dialog';
  content.innerHTML = '<div class="modal-head"><div style="flex:1"><h2 id="mixtureModalTitle">' + modalTitle + '</h2><p class="hint">Use the actual finished amount after mixing; this captures expansion, waste, and losses.</p></div><button class="modal-close" data-act="closeMixtureModal" aria-label="' + closeLabel + '">x</button></div>' +
    '<div class="grid2"><div><label class="fld" for="mixtureName">Mixture name</label><input id="mixtureName" data-mix-root="name" value="' + runtimeFunction('escapeHtml')(runtimeValue<LegacyValue>('mixtureDraft').name) + '" placeholder="e.g. Sea Salt Whipped Cream"' + disabled + '></div><div><label class="fld">Category</label><select data-mix-root="categoryId" aria-label="Mixture category"' + disabled + '>' + runtimeFunction('categoryOptions')(runtimeValue<LegacyValue>('mixtureDraft').categoryId) + '</select></div></div>' +
    '<h2 style="font-size:15px;margin-top:16px">Items used in one batch</h2><div class="component-grid head"><span>Ingredient or mixture</span><span>Quantity</span><span>Unit</span><span style="text-align:right">Cost</span><span></span></div>' +
    (rows || '<p class="empty">No items added yet.</p>') +
    (runtimeValue<LegacyValue>('mixtureReadOnly')
      ? ''
      : '<div class="row" style="margin-top:8px"><button class="btn small secondary" data-act="addMixtureComponent">+ Add item</button><button class="btn small secondary" data-act="beginQuickIngredient">+ New purchased ingredient</button></div>') +
    quick +
    '<div class="grid2" style="margin-top:16px"><div><label class="fld">Actual finished batch yield</label><input data-mix-root="batchYield" aria-label="Actual finished batch yield" type="number" min="0" step="any" value="' + runtimeFunction('escapeHtml')(runtimeValue<LegacyValue>('mixtureDraft').batchYield) + '"' + disabled + '></div><div><label class="fld">Finished yield unit</label><select data-mix-root="unit" aria-label="Finished yield unit"' + disabled + '>' + runtimeFunction('optionList')(runtimeValue<LegacyValue>('unitOptions'), runtimeValue<LegacyValue>('mixtureDraft').unit) + '</select></div></div>' +
    '<div class="mixture-totals"><div class="metric"><div class="lbl">Total batch cost</div><div class="val" id="mixtureBatchCost">' + runtimeFunction('peso')(info.batchCost) + '</div></div><div class="metric"><div class="lbl">Cost per ' + runtimeFunction('ingredientBaseUnit')(runtimeValue<LegacyValue>('mixtureDraft')) + '</div><div class="val" id="mixtureUnitCost">' + runtimeFunction('peso')(info.costPerBase) + '</div></div></div>' +
    '<div class="draft-saved-note" aria-live="polite">' + runtimeFunction('escapeHtml')(runtimeValue<LegacyValue>('mixtureDraftNotice')) + '</div>' +
    '<div id="mixtureError" class="modal-error" aria-live="assertive">' + (!info.valid && runtimeValue<LegacyValue>('mixtureDraft').components.length ? runtimeFunction('escapeHtml')(info.error) : '') + '</div>' +
    '<div class="modal-actions">' + (runtimeValue<LegacyValue>('mixtureReadOnly')
      ? '<button id="closeMixtureButton" class="btn secondary" data-act="closeMixtureModal">Close</button><button class="btn" data-act="enableMixtureEdit">Edit mixture</button>'
      : '<button class="btn secondary" data-act="discardMixtureChanges">Discard changes</button><button class="btn secondary" data-act="saveMixtureDraft">Save draft</button><button class="btn" data-act="saveMixture">Save combined cost</button>') + '</div>';
}

export function refreshMixtureTotals(): void {
  if (!runtimeValue<LegacyValue>('mixtureDraft')) return;
  const rows = runtimeValue<LegacyValue>('document').querySelectorAll(
    '#mixtureModal [data-mix-index]',
  );
  rows.forEach(function (row: LegacyValue) {
    const index = runtimeFunction('parseInt')(row.dataset.mixIndex, 10);
    const cost = row.querySelector('.component-cost');
    if (cost) {
      cost.textContent = runtimeFunction('peso')(
        modalFunction('mixtureComponentCost')(
          runtimeValue<LegacyValue>('mixtureDraft').components[index],
        ),
      );
    }
  });
  const info = modalFunction('draftMixtureInfo')();
  const batch = runtimeValue<LegacyValue>('document').getElementById(
    'mixtureBatchCost',
  );
  const unit = runtimeValue<LegacyValue>('document').getElementById(
    'mixtureUnitCost',
  );
  if (batch) batch.textContent = runtimeFunction('peso')(info.batchCost);
  if (unit) unit.textContent = runtimeFunction('peso')(info.costPerBase);
  const error = runtimeValue<LegacyValue>('document').getElementById(
    'mixtureError',
  );
  if (error) {
    error.textContent = !info.valid &&
      runtimeValue<LegacyValue>('mixtureDraft').components.length
      ? info.error
      : '';
  }
}

export function quickIngredientError(): string {
  const quick = runtimeValue<LegacyValue>('quickIngredientDraft');
  const name = runtimeFunction('String')(quick && quick.name || '').trim();
  if (!name) return 'Enter the purchased ingredient name.';
  const all = runtimeValue<LegacyValue>('state').ingredients.concat(
    runtimeValue<LegacyValue>('mixtureDraft').pendingIngredients || [],
  );
  if (
    all.some(function (item: LegacyValue) {
      return item.name &&
        item.name.trim().toLowerCase() === name.toLowerCase();
    })
  ) {
    return 'An ingredient with that name already exists.';
  }
  if (
    !(runtimeFunction('num')(quick.purchaseQty) > 0) ||
    !(runtimeFunction('num')(quick.amountPerItem) > 0)
  ) {
    return 'Enter a quantity bought and the amount in each.';
  }
  if (
    quick.price === '' ||
    quick.price == null ||
    runtimeFunction('num')(quick.price) < 0
  ) {
    return 'Enter the total purchase price. Use 0 only when it is genuinely free.';
  }
  return '';
}

export function addQuickIngredient(): boolean {
  const error = modalFunction('quickIngredientError')();
  const box = runtimeValue<LegacyValue>('document').getElementById(
    'quickIngredientError',
  );
  if (error) {
    if (box) box.textContent = error;
    return false;
  }
  runtimeValue<LegacyValue>('quickIngredientDraft').name =
    runtimeValue<LegacyValue>('quickIngredientDraft').name.trim();
  runtimeValue<LegacyValue>('mixtureDraft').pendingIngredients.push(
    runtimeValue<LegacyValue>('Object').assign(
      {},
      runtimeValue<LegacyValue>('quickIngredientDraft'),
    ),
  );
  runtimeValue<LegacyValue>('mixtureDraft').components.push({
    ingredientId: runtimeValue<LegacyValue>('quickIngredientDraft').id,
    qty: '',
    unit: runtimeValue<LegacyValue>('TYPE_UNITS')[
      runtimeValue<LegacyValue>('UNIT_TYPE')[
        runtimeValue<LegacyValue>('quickIngredientDraft').unit
      ]
    ][0],
  });
  writeRuntimeBinding('quickIngredientDraft', null);
  modalFunction('renderMixtureModal')();
  modalFunction('focusLastMixtureField')('qty');
  return true;
}

export function mixtureValidationError(): string {
  const name = runtimeFunction('String')(
    runtimeValue<LegacyValue>('mixtureDraft').name || '',
  ).trim();
  if (!name) return 'Enter a mixture name.';
  const pending = runtimeValue<LegacyValue>('mixtureDraft').pendingIngredients || [];
  const all = runtimeValue<LegacyValue>('state').ingredients.concat(pending);
  if (
    all.some(function (item: LegacyValue) {
      return item.id !== runtimeValue<LegacyValue>('mixtureDraft').id &&
        item.name &&
        item.name.trim().toLowerCase() === name.toLowerCase();
    })
  ) {
    return 'An ingredient or mixture with that name already exists.';
  }
  if (
    !(runtimeFunction('toBase')(
      runtimeValue<LegacyValue>('mixtureDraft').batchYield,
      runtimeValue<LegacyValue>('mixtureDraft').unit,
    ) > 0)
  ) {
    return 'Enter the actual finished batch yield.';
  }
  if (!runtimeValue<LegacyValue>('mixtureDraft').components.length) {
    return 'Add at least one item to the mixture.';
  }
  const seen: Record<string, boolean> = {};
  for (
    let index = 0;
    index < runtimeValue<LegacyValue>('mixtureDraft').components.length;
    index += 1
  ) {
    const component = runtimeValue<LegacyValue>('mixtureDraft').components[index];
    const source = modalFunction('draftIngredientLookup')(
      component.ingredientId,
    );
    if (!source) return 'Choose an ingredient for every item row.';
    if (seen[component.ingredientId]) {
      return 'The same item is listed twice. Combine it into one row.';
    }
    seen[component.ingredientId] = true;
    if (
      runtimeValue<LegacyValue>('UNIT_TYPE')[component.unit] !==
      runtimeValue<LegacyValue>('UNIT_TYPE')[source.unit]
    ) {
      return 'The unit for "' + (source.name || 'item') + '" is incompatible.';
    }
    if (!(runtimeFunction('toBase')(component.qty, component.unit) > 0)) {
      return 'Enter an amount used for "' + (source.name || 'item') + '".';
    }
    const componentInfo = runtimeFunction('ingredientCostInfo')(
      source,
      [],
      modalFunction('draftIngredientLookup'),
    );
    if (!componentInfo.valid) {
      return (source.name || 'Item') + ': ' + componentInfo.error;
    }
  }
  const original = runtimeFunction('getById')(
    runtimeValue<LegacyValue>('state').ingredients,
    runtimeValue<LegacyValue>('mixtureDraft').id,
  );
  if (
    original &&
    runtimeValue<LegacyValue>('UNIT_TYPE')[original.unit] !==
      runtimeValue<LegacyValue>('UNIT_TYPE')[
        runtimeValue<LegacyValue>('mixtureDraft').unit
      ]
  ) {
    return 'For inventory safety, an existing combined cost cannot change between weight, volume, or pieces. Save this work as a draft, then create a new combined cost with the correct yield unit.';
  }
  const info = modalFunction('draftMixtureInfo')();
  return info.valid ? '' : info.error;
}
