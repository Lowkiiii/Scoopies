import {
  runtimeFunction,
  runtimeValue,
  stateFunction,
  writeRuntimeBinding,
  type LegacyValue,
} from './bindings';

export function brandDisplayName(value: LegacyValue): string {
  const name = runtimeFunction('String')(value || '').trim();
  return !name || /^scoopies$/i.test(name)
    ? runtimeValue('APP_BRAND_NAME')
    : name;
}

export function blank(): LegacyValue {
  return {
    schemaVersion: 3,
    ingredientCategories: [],
    ingredients: [],
    mixtureDrafts: [],
    packaging: [],
    recipes: [],
    products: [],
  };
}

export function normalizeState(raw: LegacyValue): LegacyValue {
  const ObjectCtor = runtimeValue<LegacyValue>('Object');
  const ArrayCtor = runtimeValue<LegacyValue>('Array');
  const StringCtor = runtimeFunction('String');
  const DateCtor = runtimeValue<LegacyValue>('Date');
  const uid = runtimeFunction('uid');
  const unitFactor = runtimeValue<LegacyValue>('UNIT_FACTOR');
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = ObjectCtor.assign({}, src);
  out.schemaVersion = 3;
  out.ingredientCategories = ArrayCtor.isArray(src.ingredientCategories)
    ? src.ingredientCategories
      .map(function (category: LegacyValue) {
        return {
          id: StringCtor(category && category.id || uid()),
          name: StringCtor(category && category.name || '').trim(),
        };
      })
      .filter(function (
        category: LegacyValue,
        index: number,
        categories: LegacyValue[],
      ) {
        if (!category.name) return false;
        return categories.findIndex(function (candidate: LegacyValue) {
          return candidate.name.toLowerCase() === category.name.toLowerCase();
        }) === index;
      })
    : [];
  const categoryIds: LegacyValue = {};
  out.ingredientCategories.forEach(function (category: LegacyValue) {
    categoryIds[category.id] = true;
  });
  out.ingredients = ArrayCtor.isArray(src.ingredients)
    ? src.ingredients.map(function (item: LegacyValue) {
      const ingredient = ObjectCtor.assign({}, item || {});
      ingredient.id = StringCtor(ingredient.id || uid());
      ingredient.kind = ingredient.kind === 'mixture' ? 'mixture' : 'purchased';
      ingredient.categoryId = categoryIds[StringCtor(ingredient.categoryId || '')]
        ? StringCtor(ingredient.categoryId)
        : '';
      if (ingredient.kind === 'mixture') {
        ingredient.batchYield = ingredient.batchYield == null
          ? ''
          : ingredient.batchYield;
        ingredient.unit = unitFactor[ingredient.unit] ? ingredient.unit : 'ml';
        ingredient.components = ArrayCtor.isArray(ingredient.components)
          ? ingredient.components.map(function (component: LegacyValue) {
            return {
              ingredientId: StringCtor(component && component.ingredientId || ''),
              qty: component && component.qty != null ? component.qty : '',
              unit: unitFactor[component && component.unit]
                ? component.unit
                : 'g',
            };
          })
          : [];
      }
      return ingredient;
    })
    : [];
  out.mixtureDrafts = ArrayCtor.isArray(src.mixtureDrafts)
    ? src.mixtureDrafts.map(function (item: LegacyValue) {
      const record = ObjectCtor.assign({}, item || {});
      const data = ObjectCtor.assign({}, record.data || {});
      record.id = StringCtor(record.id || uid());
      record.createdAt = StringCtor(
        record.createdAt || record.updatedAt || new DateCtor().toISOString(),
      );
      record.updatedAt = StringCtor(record.updatedAt || record.createdAt);
      record.sourceMixtureId = StringCtor(record.sourceMixtureId || '');
      record.sourceSnapshot = record.sourceSnapshot &&
          typeof record.sourceSnapshot === 'object'
        ? stateFunction('snapshot')(record.sourceSnapshot)
        : null;
      data.id = StringCtor(data.id || record.sourceMixtureId || uid());
      data.kind = 'mixture';
      data.name = StringCtor(data.name || '');
      data.categoryId = categoryIds[StringCtor(data.categoryId || '')]
        ? StringCtor(data.categoryId)
        : '';
      data.batchYield = data.batchYield == null ? '' : data.batchYield;
      data.unit = unitFactor[data.unit] ? data.unit : 'ml';
      data.components = ArrayCtor.isArray(data.components)
        ? data.components.map(function (component: LegacyValue) {
          return {
            ingredientId: StringCtor(component && component.ingredientId || ''),
            qty: component && component.qty != null ? component.qty : '',
            unit: unitFactor[component && component.unit] ? component.unit : 'g',
          };
        })
        : [];
      data.pendingIngredients = ArrayCtor.isArray(data.pendingIngredients)
        ? data.pendingIngredients.map(function (entry: LegacyValue) {
          const pending = ObjectCtor.assign({}, entry || {});
          pending.id = StringCtor(pending.id || uid());
          pending.kind = 'purchased';
          pending.categoryId = categoryIds[StringCtor(pending.categoryId || '')]
            ? StringCtor(pending.categoryId)
            : '';
          pending.unit = unitFactor[pending.unit] ? pending.unit : 'g';
          return pending;
        })
        : [];
      record.data = data;
      if (record.quickIngredient) {
        const quick = ObjectCtor.assign({}, record.quickIngredient);
        quick.id = StringCtor(quick.id || uid());
        quick.kind = 'purchased';
        quick.categoryId = categoryIds[StringCtor(quick.categoryId || '')]
          ? StringCtor(quick.categoryId)
          : '';
        quick.unit = unitFactor[quick.unit] ? quick.unit : 'g';
        record.quickIngredient = quick;
      } else {
        record.quickIngredient = null;
      }
      return record;
    })
    : [];
  out.packaging = ArrayCtor.isArray(src.packaging)
    ? src.packaging.map(function (entry: LegacyValue) {
      return ObjectCtor.assign({}, entry);
    })
    : [];
  out.recipes = ArrayCtor.isArray(src.recipes)
    ? src.recipes.map(function (entry: LegacyValue) {
      const recipe = ObjectCtor.assign({}, entry);
      recipe.id = StringCtor(recipe.id || uid());
      recipe.lines = ArrayCtor.isArray(entry && entry.lines)
        ? entry.lines.map(function (item: LegacyValue, index: number) {
          const line = ObjectCtor.assign({}, item);
          line.id = StringCtor(line.id || recipe.id + '_line_' + index);
          return line;
        })
        : [];
      return recipe;
    })
    : [];
  out.products = ArrayCtor.isArray(src.products)
    ? src.products.map(function (entry: LegacyValue) {
      const product = ObjectCtor.assign({}, entry);
      product.id = StringCtor(product.id || uid());
      product.packLines = ArrayCtor.isArray(entry && entry.packLines)
        ? entry.packLines.map(function (item: LegacyValue, index: number) {
          const line = ObjectCtor.assign({}, item);
          line.id = StringCtor(line.id || product.id + '_pack_' + index);
          return line;
        })
        : [];
      return product;
    })
    : [];
  return out;
}

export function loadLocalDirty(): boolean {
  try {
    return !runtimeValue('TEST_MODE') &&
      runtimeValue<Storage>('localStorage').getItem(
        runtimeValue('DIRTY_KEY'),
      ) === '1';
  } catch (_error) {
    return false;
  }
}

export function loadSyncedLocal(): LegacyValue {
  if (runtimeValue('TEST_MODE')) {
    return stateFunction('snapshot')(runtimeValue('state'));
  }
  try {
    const raw = runtimeValue<LegacyValue>('JSON').parse(
      runtimeValue<Storage>('localStorage').getItem(runtimeValue('SYNCED_KEY')),
    );
    return raw && raw.ingredients
      ? stateFunction('normalizeState')(raw)
      : null;
  } catch (_error) {
    return null;
  }
}

export function markLocalDirty(): void {
  writeRuntimeBinding('localDirty', true);
  if (!runtimeValue('TEST_MODE')) {
    try {
      runtimeValue<Storage>('localStorage').setItem(
        runtimeValue('DIRTY_KEY'),
        '1',
      );
    } catch (_error) {}
  }
}

export function rememberSynced(state: LegacyValue, clean: LegacyValue): void {
  if (!state) return;
  const synced = stateFunction('snapshot')(
    stateFunction('normalizeState')(state),
  );
  writeRuntimeBinding('syncedState', synced);
  if (!runtimeValue('TEST_MODE')) {
    try {
      runtimeValue<Storage>('localStorage').setItem(
        runtimeValue('SYNCED_KEY'),
        runtimeValue<LegacyValue>('JSON').stringify(synced),
      );
    } catch (_error) {}
  }
  if (clean) {
    writeRuntimeBinding('localDirty', false);
    if (!runtimeValue('TEST_MODE')) {
      try {
        runtimeValue<Storage>('localStorage').removeItem(
          runtimeValue('DIRTY_KEY'),
        );
      } catch (_error) {}
    }
  }
}

export function loadLocal(): LegacyValue {
  try {
    const state = runtimeValue<LegacyValue>('JSON').parse(
      runtimeValue<Storage>('localStorage').getItem(runtimeValue('KEY')),
    );
    return state && state.ingredients
      ? stateFunction('normalizeState')(state)
      : stateFunction('blank')();
  } catch (_error) {
    return stateFunction('blank')();
  }
}

export function hasData(state: LegacyValue): boolean {
  return !!(state && (
    state.ingredientCategories && state.ingredientCategories.length ||
    state.ingredients && state.ingredients.length ||
    state.mixtureDrafts && state.mixtureDrafts.length ||
    state.packaging && state.packaging.length ||
    state.recipes && state.recipes.length ||
    state.products && state.products.length
  ));
}

export function snapshot(state: LegacyValue): LegacyValue {
  try {
    const JSONValue = runtimeValue<LegacyValue>('JSON');
    return JSONValue.parse(JSONValue.stringify(state));
  } catch (_error) {
    return null;
  }
}
