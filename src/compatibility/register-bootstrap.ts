import { BOOTSTRAP_API } from '../bootstrap';
import { attachBootstrapBindings } from '../bootstrap/bindings';
import type { CompatibilityDomain, MatchaLunaFacade } from './facade';

export function registerBootstrapModule(
  facade: MatchaLunaFacade,
  target: Window & typeof globalThis,
): CompatibilityDomain {
  const descriptors: Record<string, PropertyDescriptor> = {};
  Object.entries(BOOTSTRAP_API).forEach(([name, value]) => {
    descriptors[name] = {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    };
  });
  const namespace = facade.registerModule('bootstrap', descriptors);
  attachBootstrapBindings(target as unknown as Record<string, unknown>);
  return namespace;
}
