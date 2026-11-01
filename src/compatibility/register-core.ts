import { attachCoreBindings } from '../core/bindings';
import { CORE_API } from '../core';
import type { CompatibilityDomain, MatchaLunaFacade } from './facade';

export function registerCoreModule(facade: MatchaLunaFacade): CompatibilityDomain {
  const descriptors: Record<string, PropertyDescriptor> = {};
  Object.entries(CORE_API).forEach(([name, value]) => {
    descriptors[name] = {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    };
  });
  const namespace = facade.registerModule('core', descriptors);
  attachCoreBindings(namespace);
  return namespace;
}
