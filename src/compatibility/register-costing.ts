import { attachCostingBindings } from '../costing/bindings';
import { COSTING_API } from '../costing';
import type { CompatibilityDomain, MatchaLunaFacade } from './facade';

export function registerCostingModule(
  facade: MatchaLunaFacade,
  target: Window & typeof globalThis,
): CompatibilityDomain {
  const descriptors: Record<string, PropertyDescriptor> = {};
  Object.entries(COSTING_API).forEach(([name, value]) => {
    descriptors[name] = {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    };
  });
  const namespace = facade.registerModule('costing', descriptors);
  attachCostingBindings(
    namespace,
    target as unknown as Record<string, unknown>,
  );
  return namespace;
}
