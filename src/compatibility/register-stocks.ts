import { STOCKS_API } from '../stocks';
import { attachStocksBindings } from '../stocks/bindings';
import type { CompatibilityDomain, MatchaLunaFacade } from './facade';

export function registerStocksModule(
  facade: MatchaLunaFacade,
  target: Window & typeof globalThis,
): CompatibilityDomain {
  const descriptors: Record<string, PropertyDescriptor> = {};
  Object.entries(STOCKS_API).forEach(([name, value]) => {
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
