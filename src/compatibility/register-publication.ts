import { PUBLICATION_API } from '../publication';
import { attachPublicationBindings } from '../publication/bindings';
import type { CompatibilityDomain, MatchaLunaFacade } from './facade';

export function registerPublicationModule(
  facade: MatchaLunaFacade,
  target: Window & typeof globalThis,
): CompatibilityDomain {
  const descriptors: Record<string, PropertyDescriptor> = {};
  Object.entries(PUBLICATION_API).forEach(([name, value]) => {
    descriptors[name] = {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    };
  });
  const namespace = facade.registerModule('publication', descriptors);
  attachPublicationBindings(
    namespace,
    target as unknown as Record<string, unknown>,
  );
  return namespace;
}
