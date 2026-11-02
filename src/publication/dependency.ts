import {
  readPublicationBinding,
  runtimeFunction,
  type LegacyFunction,
  type LegacyValue,
} from './bindings';

export function ingredientDependsOn(
  startId: LegacyValue,
  targetId: LegacyValue,
  seen?: LegacyValue,
  lookup?: LegacyFunction,
): boolean {
  lookup = lookup || runtimeFunction('stateIngredientLookup');
  seen = seen || {};
  if (startId === targetId) return true;
  if (seen[startId]) return false;
  seen[startId] = true;
  const ingredient = lookup(startId);
  if (!runtimeFunction('isMixture')(ingredient)) return false;
  return (ingredient.components || []).some(function (component: LegacyValue) {
    return readPublicationBinding<LegacyFunction>(
      'ingredientDependsOn',
      ingredientDependsOn,
    )(component.ingredientId, targetId, seen, lookup);
  });
}
