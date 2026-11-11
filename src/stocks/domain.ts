import {
  readStocksBinding,
  runtimeValue,
  writeRuntimeBinding,
} from './bindings';
import type { LegacyValue } from './types';

export function stockRequestIsCurrent(
  generation: LegacyValue,
  userId: LegacyValue,
  businessId: LegacyValue,
): boolean {
  return (
    generation === runtimeValue('stockLoadGeneration') &&
    !!runtimeValue('session') &&
    !!runtimeValue('session').user &&
    String(runtimeValue('session').user.id || '') === String(userId || '') &&
    String(runtimeValue('posContext').businessId || '') ===
      String(businessId || '')
  );
}

export function stockBaseUnitForIngredient(
  ingredient: LegacyValue,
): LegacyValue {
  const type =
    ingredient && runtimeValue('UNIT_TYPE')[ingredient.unit];
  return runtimeValue('TYPE_BASE')[type] || '';
}

export function stockSourcePayload(sourceState?: LegacyValue): LegacyValue[] {
  sourceState = sourceState || runtimeValue('state');
  return (sourceState.ingredients || [])
    .filter(function (ingredient: LegacyValue) {
      return (
        ingredient &&
        ingredient.id &&
        String(ingredient.name || '').trim() &&
        readStocksBinding(
          'stockBaseUnitForIngredient',
          stockBaseUnitForIngredient,
        )(ingredient)
      );
    })
    .map(function (ingredient: LegacyValue) {
      return {
        sourceCostingIngredientId: String(ingredient.id),
        kind: runtimeValue('isMixture')(ingredient) ? 'mixture' : 'purchased',
        name: String(ingredient.name || '').trim(),
        baseUnit: readStocksBinding(
          'stockBaseUnitForIngredient',
          stockBaseUnitForIngredient,
        )(ingredient),
      };
    });
}

export function costingBulkInventoryIssue(nextState: LegacyValue): string {
  const current = runtimeValue('state').ingredients || [];
  const next = (nextState && nextState.ingredients) || [];
  const currentById: LegacyValue = {};
  const nextById: LegacyValue = {};
  current.forEach(function (item: LegacyValue) {
    if (item && item.id) currentById[String(item.id)] = item;
  });
  next.forEach(function (item: LegacyValue) {
    if (item && item.id) nextById[String(item.id)] = item;
  });
  const currentIds = Object.keys(currentById);
  const nextIds = Object.keys(nextById);
  if (
    currentIds.length !== nextIds.length ||
    currentIds.some(function (id) {
      return !nextById[id];
    })
  ) {
    return 'For inventory safety, a cloud backup cannot add or remove ingredient sources in one bulk action. Add or delete ingredients individually so stock history stays attached to the right item.';
  }
  for (let index = 0; index < currentIds.length; index += 1) {
    const id = currentIds[index];
    const before = currentById[id];
    const after = nextById[id];
    if (
      (runtimeValue('isMixture')(before) ? 'mixture' : 'purchased') !==
        (runtimeValue('isMixture')(after) ? 'mixture' : 'purchased') ||
      readStocksBinding(
        'stockBaseUnitForIngredient',
        stockBaseUnitForIngredient,
      )(before) !==
        readStocksBinding(
          'stockBaseUnitForIngredient',
          stockBaseUnitForIngredient,
        )(after)
    ) {
      return 'For inventory safety, a cloud backup cannot change an ingredient between weight, volume, pieces, purchased, or prepared mixture. Create a new ingredient instead.';
    }
  }
  return '';
}

export function reconcileCostingInventoryLifecycle(
  authoritative: LegacyValue,
  candidate: LegacyValue,
  baseline: LegacyValue,
): LegacyValue {
  authoritative = runtimeValue('normalizeState')(
    authoritative || runtimeValue('blank')(),
  );
  candidate = runtimeValue('normalizeState')(
    candidate || runtimeValue('blank')(),
  );
  baseline = runtimeValue('normalizeState')(
    baseline || authoritative,
  );
  const authoritativeById: LegacyValue = {};
  const baselineById: LegacyValue = {};
  const candidateById: LegacyValue = {};
  authoritative.ingredients.forEach(function (item: LegacyValue) {
    authoritativeById[String(item.id)] = item;
  });
  baseline.ingredients.forEach(function (item: LegacyValue) {
    baselineById[String(item.id)] = item;
  });
  candidate.ingredients.forEach(function (item: LegacyValue) {
    candidateById[String(item.id)] = item;
  });
  const blocked: LegacyValue[] = [];
  candidate.ingredients = candidate.ingredients.filter(function (
    localItem: LegacyValue,
  ) {
    const id = String(localItem.id);
    if (baselineById[id] && !authoritativeById[id]) {
      blocked.push(
        localItem.name || baselineById[id].name || 'Unnamed ingredient',
      );
      delete candidateById[id];
      return false;
    }
    return true;
  });
  authoritative.ingredients.forEach(function (serverItem: LegacyValue) {
    const localItem = candidateById[String(serverItem.id)];
    if (!localItem) {
      candidate.ingredients.push(runtimeValue('snapshot')(serverItem));
      blocked.push(serverItem.name || 'Unnamed ingredient');
      return;
    }
    if (
      (runtimeValue('isMixture')(localItem) ? 'mixture' : 'purchased') !==
        (runtimeValue('isMixture')(serverItem) ? 'mixture' : 'purchased') ||
      readStocksBinding(
        'stockBaseUnitForIngredient',
        stockBaseUnitForIngredient,
      )(localItem) !==
        readStocksBinding(
          'stockBaseUnitForIngredient',
          stockBaseUnitForIngredient,
        )(serverItem)
    ) {
      const index = candidate.ingredients.findIndex(function (
        item: LegacyValue,
      ) {
        return String(item.id) === String(serverItem.id);
      });
      if (index >= 0) {
        candidate.ingredients[index] = runtimeValue('snapshot')(serverItem);
      }
      blocked.push(
        serverItem.name || localItem.name || 'Unnamed ingredient',
      );
    }
  });
  return { state: candidate, blocked };
}

export function replaceCostingStateSafely(
  nextState: LegacyValue,
  activity: LegacyValue,
): boolean {
  nextState = runtimeValue('normalizeState')(nextState);
  const issue = readStocksBinding(
    'costingBulkInventoryIssue',
    costingBulkInventoryIssue,
  )(nextState);
  if (issue) {
    alert(issue);
    return false;
  }
  writeRuntimeBinding('state', nextState);
  writeRuntimeBinding('ingredientUi', { search: '', category: 'all' });
  runtimeValue('logCoarse')(activity);
  runtimeValue('save')();
  runtimeValue('renderAll')();
  return true;
}

export function stockNormalizeItem(row: LegacyValue): LegacyValue {
  row = row || {};
  const sourceId = String(
    row.source_costing_ingredient_id || row.sourceCostingIngredientId || '',
  );
  const source = runtimeValue('getById')(
    runtimeValue('state').ingredients || [],
    sourceId,
  );
  const baseUnit = String(row.base_unit || row.baseUnit || 'g');
  const requestedUnit = String(
    row.preferred_unit ||
      row.preferredUnit ||
      (source && source.unit) ||
      baseUnit,
  ).toLowerCase();
  const preferredUnit =
    runtimeValue('UNIT_TYPE')[requestedUnit] ===
    runtimeValue('UNIT_TYPE')[baseUnit]
      ? requestedUnit
      : baseUnit;
  return {
    id: String(row.inventory_item_id || row.id || ''),
    sourceId,
    name: String(row.name || 'Unnamed item'),
    kind:
      String(row.item_kind || row.kind || 'purchased') === 'mixture'
        ? 'mixture'
        : 'purchased',
    baseUnit,
    preferredUnit,
    // Kept only so a cached pre-schema-12 client can complete an in-flight
    // details save without erasing a legacy value. The live UI uses Category.
    brand: String(row.brand || row.legacy_brand || ''),
    purchasedFrom: String(row.purchased_from || row.purchasedFrom || ''),
    lastStockedOn: row.last_stocked_on || row.lastStockedOn || null,
    notes: String(row.notes || ''),
    balance: Number(
      row.current_balance_base == null ? 0 : row.current_balance_base,
    ),
    threshold:
      row.low_stock_threshold_base == null
        ? null
        : Number(row.low_stock_threshold_base),
    revision: Number(row.revision || 0),
    initialized: !!(row.has_stock_history || row.initialized),
    active: row.active !== false,
    lastMovementAt: row.last_movement_at || null,
    lastMovementType: String(row.last_movement_type || ''),
    categoryName: String(
      row.category_name ||
        row.categoryName ||
        (source
          ? runtimeValue('categoryNameIn')(
              runtimeValue('state'),
              source.categoryId,
            )
          : 'Removed from costing'),
    ),
  };
}

export function stockNormalizeTransaction(row: LegacyValue): LegacyValue {
  row = row || {};
  return {
    transactionId: String(row.transaction_id || ''),
    itemId: String(row.inventory_item_id || ''),
    itemName: String(
      row.item_name_snapshot || row.item_name || 'Inventory item',
    ),
    type: String(row.transaction_type || ''),
    delta: Number(row.quantity_delta_base || 0),
    before: Number(row.balance_before_base || 0),
    after: Number(row.balance_after_base || 0),
    unit: String(row.base_unit_snapshot || row.base_unit || 'g'),
    reason: String(row.reason || ''),
    note: String(row.note || ''),
    actor: String(row.recorded_by_name || row.actor_name || 'Staff'),
    occurredAt: row.occurred_at || row.created_at || null,
    itemSequence: Number(row.item_sequence || 0),
    revisionBefore: Number(row.item_revision_before || 0),
    revisionAfter: Number(row.item_revision_after || 0),
  };
}
