import { attachSupportBindings } from '../support/bindings';
import { SUPPORT_API } from '../support';
import type { CompatibilityDomain, MatchaLunaFacade } from './facade';

export function registerSupportModule(
  facade: MatchaLunaFacade,
  target: Window & typeof globalThis,
): CompatibilityDomain {
  const descriptors: Record<string, PropertyDescriptor> = {};
  Object.entries(SUPPORT_API).forEach(([name, value]) => {
    descriptors[name] = {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    };
  });
  const namespace = facade.registerModule('support', descriptors);
  attachSupportBindings(
    namespace,
    target as unknown as Record<string, unknown>,
  );
  return namespace;
}
