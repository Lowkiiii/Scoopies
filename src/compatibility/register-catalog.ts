import { CATALOG_API } from '../catalog';
import { attachCatalogBindings } from '../catalog/bindings';
import type { CompatibilityDomain, MatchaLunaFacade } from './facade';

export function registerCatalogModule(
  facade: MatchaLunaFacade,
  target: Window & typeof globalThis,
): CompatibilityDomain {
  const descriptors: Record<string, PropertyDescriptor> = {};
  Object.entries(CATALOG_API).forEach(([name, value]) => {
    descriptors[name] = {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    };
  });
  const namespace = facade.registerModule('catalog', descriptors);
  attachCatalogBindings(
    namespace,
    target as unknown as Record<string, unknown>,
  );
  return namespace;
}
