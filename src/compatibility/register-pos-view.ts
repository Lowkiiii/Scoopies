import { attachPosBindings } from '../pos/bindings';
import { POS_VIEW_API } from '../pos/view-api';
import type { CompatibilityDomain, MatchaLunaFacade } from './facade';

export function registerPosViewModule(
  facade: MatchaLunaFacade,
  target: Window & typeof globalThis,
): CompatibilityDomain {
  const descriptors: Record<string, PropertyDescriptor> = {};
  Object.entries(POS_VIEW_API).forEach(([name, value]) => {
    descriptors[name] = {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    };
  });
  const namespace = facade.registerModule('pos', descriptors);
  attachPosBindings(
    namespace,
    target as unknown as Record<string, unknown>,
  );
  return namespace;
}
