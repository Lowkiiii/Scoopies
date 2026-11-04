import {
  runtimeFunction,
  runtimeValue,
  stateFunction,
  type LegacyValue,
} from './bindings';

export function sameMergeValue(first: LegacyValue, second: LegacyValue): boolean {
  const missing = runtimeValue('MERGE_MISSING');
  if (first === missing || second === missing) return first === second;
  return runtimeFunction('sameDataValue')(first, second);
}

export function cloneMergeValue(value: LegacyValue): LegacyValue {
  return value === runtimeValue('MERGE_MISSING')
    ? runtimeValue('MERGE_MISSING')
    : stateFunction('snapshot')(value);
}

export function mergeNode(
  base: LegacyValue,
  local: LegacyValue,
  remote: LegacyValue,
): LegacyValue {
  const same = stateFunction('sameMergeValue');
  const clone = stateFunction('cloneMergeValue');
  const missing = runtimeValue('MERGE_MISSING');
  if (same(local, base)) return clone(remote);
  if (same(remote, base) || same(local, remote)) return clone(local);
  if (Array.isArray(local) && Array.isArray(remote)) {
    const arrays = (Array.isArray(base) ? base : []).concat(local, remote);
    if (
      arrays.length &&
      arrays.every(function (entry: LegacyValue) {
        return entry && typeof entry === 'object' &&
          !Array.isArray(entry) && entry.id;
      })
    ) {
      return stateFunction('mergeEntityList')(
        Array.isArray(base) ? base : [],
        local,
        remote,
      );
    }
  }
  const localObject = local !== missing && local &&
    typeof local === 'object' && !Array.isArray(local);
  const remoteObject = remote !== missing && remote &&
    typeof remote === 'object' && !Array.isArray(remote);
  if (localObject && remoteObject) {
    const baseObject = base !== missing && base &&
        typeof base === 'object' && !Array.isArray(base)
      ? base
      : {};
    const output: LegacyValue = {};
    const keys: LegacyValue = {};
    Object.keys(baseObject).concat(
      Object.keys(local),
      Object.keys(remote),
    ).forEach(function (key) {
      keys[key] = true;
    });
    Object.keys(keys).forEach(function (key) {
      const value = stateFunction('mergeNode')(
        Object.prototype.hasOwnProperty.call(baseObject, key)
          ? baseObject[key]
          : missing,
        Object.prototype.hasOwnProperty.call(local, key)
          ? local[key]
          : missing,
        Object.prototype.hasOwnProperty.call(remote, key)
          ? remote[key]
          : missing,
      );
      if (value !== missing) output[key] = value;
    });
    return output;
  }
  return clone(local);
}

export function mergeEntityList(
  base: LegacyValue,
  local: LegacyValue,
  remote: LegacyValue,
): LegacyValue {
  base = base || [];
  local = local || [];
  remote = remote || [];
  const baseMap: LegacyValue = {};
  const localMap: LegacyValue = {};
  const remoteMap: LegacyValue = {};
  const order: LegacyValue[] = [];
  base.forEach(function (entry: LegacyValue) { baseMap[entry.id] = entry; });
  local.forEach(function (entry: LegacyValue) { localMap[entry.id] = entry; });
  remote.forEach(function (entry: LegacyValue) { remoteMap[entry.id] = entry; });
  remote.concat(local).concat(base).forEach(function (entry: LegacyValue) {
    if (entry && order.indexOf(entry.id) < 0) order.push(entry.id);
  });
  const missing = runtimeValue('MERGE_MISSING');
  return order.map(function (id) {
    return stateFunction('mergeNode')(
      Object.prototype.hasOwnProperty.call(baseMap, id) ? baseMap[id] : missing,
      Object.prototype.hasOwnProperty.call(localMap, id) ? localMap[id] : missing,
      Object.prototype.hasOwnProperty.call(remoteMap, id)
        ? remoteMap[id]
        : missing,
    );
  }).filter(function (entry) { return entry !== missing; });
}

export function mergeStates(
  base: LegacyValue,
  local: LegacyValue,
  remote: LegacyValue,
): LegacyValue {
  const normalize = stateFunction('normalizeState');
  const blank = stateFunction('blank');
  base = normalize(base || blank());
  local = normalize(local || blank());
  remote = normalize(remote || blank());
  const output = stateFunction('mergeNode')(base, local, remote);
  const lists = [
    'ingredientCategories',
    'ingredients',
    'mixtureDrafts',
    'packaging',
    'recipes',
    'products',
  ];
  lists.forEach(function (key) {
    output[key] = stateFunction('mergeEntityList')(
      base[key],
      local[key],
      remote[key],
    );
  });
  output.mixtureDrafts = stateFunction('mergeWholeEntityList')(
    base.mixtureDrafts,
    local.mixtureDrafts,
    remote.mixtureDrafts,
  );
  return normalize(output);
}

export function mergeWholeEntityList(
  base: LegacyValue,
  local: LegacyValue,
  remote: LegacyValue,
): LegacyValue {
  base = base || [];
  local = local || [];
  remote = remote || [];
  const baseMap: LegacyValue = {};
  const localMap: LegacyValue = {};
  const remoteMap: LegacyValue = {};
  const order: LegacyValue[] = [];
  const output: LegacyValue[] = [];
  const outputIndex: LegacyValue = {};
  function pushDraft(record: LegacyValue): void {
    if (!record || !record.id) return;
    const copy = stateFunction('snapshot')(record);
    const index = outputIndex[copy.id];
    if (index == null) {
      outputIndex[copy.id] = output.length;
      output.push(copy);
    } else if (
      stateFunction('draftConflictKey')(copy) >
      stateFunction('draftConflictKey')(output[index])
    ) {
      output[index] = copy;
    }
  }
  base.forEach(function (entry: LegacyValue) { baseMap[entry.id] = entry; });
  local.forEach(function (entry: LegacyValue) { localMap[entry.id] = entry; });
  remote.forEach(function (entry: LegacyValue) { remoteMap[entry.id] = entry; });
  remote.concat(local).concat(base).forEach(function (entry: LegacyValue) {
    if (entry && order.indexOf(entry.id) < 0) order.push(entry.id);
  });
  const missing = runtimeValue('MERGE_MISSING');
  order.forEach(function (id) {
    const hasBase = Object.prototype.hasOwnProperty.call(baseMap, id);
    const hasLocal = Object.prototype.hasOwnProperty.call(localMap, id);
    const hasRemote = Object.prototype.hasOwnProperty.call(remoteMap, id);
    const baseValue = hasBase ? baseMap[id] : missing;
    const localValue = hasLocal ? localMap[id] : missing;
    const remoteValue = hasRemote ? remoteMap[id] : missing;
    if (!hasLocal && !hasRemote) return;
    if (!hasLocal) {
      if (!hasBase) pushDraft(remoteValue);
      else if (!stateFunction('sameMergeValue')(remoteValue, baseValue)) {
        pushDraft(stateFunction('makeMergedDraftConflictCopy')(remoteValue, id));
      }
      return;
    }
    if (!hasRemote) {
      if (!hasBase) pushDraft(localValue);
      else if (!stateFunction('sameMergeValue')(localValue, baseValue)) {
        pushDraft(stateFunction('makeMergedDraftConflictCopy')(localValue, id));
      }
      return;
    }
    if (stateFunction('sameMergeValue')(localValue, baseValue)) {
      pushDraft(remoteValue);
      return;
    }
    if (
      stateFunction('sameMergeValue')(remoteValue, baseValue) ||
      stateFunction('sameMergeValue')(localValue, remoteValue)
    ) {
      pushDraft(localValue);
      return;
    }
    const localKey = stateFunction('draftConflictKey')(localValue);
    const remoteKey = stateFunction('draftConflictKey')(remoteValue);
    const winner = localKey >= remoteKey ? localValue : remoteValue;
    const loser = localKey >= remoteKey ? remoteValue : localValue;
    pushDraft(winner);
    pushDraft(stateFunction('makeMergedDraftConflictCopy')(loser, id));
  });
  return output;
}

export function draftConflictKey(record: LegacyValue): string {
  return runtimeFunction('String')(record && record.updatedAt || '') + '|' +
    runtimeFunction('stableSerialize')(record || {});
}

export function stableDraftHash(value: LegacyValue): string {
  const text = runtimeFunction('String')(value || '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = runtimeValue<LegacyValue>('Math').imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function remapDraftOwnedIds(
  data: LegacyValue,
  quick: LegacyValue,
  makeId: LegacyValue,
): void {
  data = data || {};
  const remap: LegacyValue = {};
  (data.pendingIngredients || []).forEach(function (
    item: LegacyValue,
    index: number,
  ) {
    const old = runtimeFunction('String')(item.id || '');
    const next = makeId(old, 'pending', index);
    if (old) remap[old] = next;
    item.id = next;
  });
  (data.components || []).forEach(function (component: LegacyValue) {
    if (remap[component.ingredientId]) {
      component.ingredientId = remap[component.ingredientId];
    }
  });
  if (quick) {
    quick.id = makeId(runtimeFunction('String')(quick.id || ''), 'quick', 0);
  }
}

export function makeMergedDraftConflictCopy(
  record: LegacyValue,
  originalId: LegacyValue,
): LegacyValue {
  const copy = stateFunction('snapshot')(record);
  const suffix = stateFunction('stableDraftHash')(
    runtimeFunction('stableSerialize')(record || {}),
  );
  copy.id = originalId + '_conflict_' + suffix;
  copy.conflictCopy = true;
  if (!copy.sourceMixtureId && copy.data) {
    copy.data.id = runtimeFunction('String')(copy.data.id || originalId) +
      '_copy_' + suffix;
  }
  stateFunction('remapDraftOwnedIds')(
    copy.data,
    copy.quickIngredient,
    function (old: LegacyValue, kind: LegacyValue, index: LegacyValue) {
      return (old || kind) + '_copy_' + suffix + '_' + index;
    },
  );
  return copy;
}
