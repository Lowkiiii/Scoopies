import { MODALS_API } from '../modals';
import { attachModalBindings } from '../modals/bindings';
import type { CompatibilityDomain, MatchaLunaFacade } from './facade';

export function registerModalsModule(
  facade: MatchaLunaFacade,
  target: Window & typeof globalThis,
): CompatibilityDomain {
  const descriptors: Record<string, PropertyDescriptor> = {};
  Object.entries(MODALS_API).forEach(([name, value]) => {
    descriptors[name] = {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    };
  });
  const namespace = facade.registerModule('modals', descriptors);
  attachModalBindings(namespace, target as unknown as Record<string, unknown>);
  return namespace;
}
