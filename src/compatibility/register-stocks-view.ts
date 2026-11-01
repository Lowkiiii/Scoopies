import { attachStocksBindings } from '../stocks/bindings';
import { STOCKS_VIEW_API } from '../stocks/view-api';
import type { CompatibilityDomain, MatchaLunaFacade } from './facade';

export function registerStocksViewModule(
  facade: MatchaLunaFacade,
  target: Window & typeof globalThis,
): CompatibilityDomain {
  const descriptors: Record<string, PropertyDescriptor> = {};
  Object.entries(STOCKS_VIEW_API).forEach(([name, value]) => {
    descriptors[name] = {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    };
  });
  const namespace = facade.registerModule('stocks', descriptors);
  attachStocksBindings(
    namespace,
    target as unknown as Record<string, unknown>,
  );
  return namespace;
}
