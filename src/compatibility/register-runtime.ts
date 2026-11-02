import { RUNTIME_FACTORIES_API } from '../runtime';
import type { CompatibilityDomain, MatchaLunaFacade } from './facade';

export function registerRuntimeModule(
  facade: MatchaLunaFacade,
): CompatibilityDomain {
  const descriptors: Record<string, PropertyDescriptor> = {};
  Object.entries(RUNTIME_FACTORIES_API).forEach(([name, value]) => {
    descriptors[name] = {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    };
  });
  return facade.registerModule('runtime', descriptors);
}
