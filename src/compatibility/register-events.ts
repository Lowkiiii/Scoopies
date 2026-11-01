import { attachEventsBindings } from '../events/bindings';
import { EVENTS_API } from '../events/api';
import type { CompatibilityDomain, MatchaLunaFacade } from './facade';

export function registerEventsModule(
  facade: MatchaLunaFacade,
  target: Window & typeof globalThis,
): CompatibilityDomain {
  const descriptors: Record<string, PropertyDescriptor> = {};
  Object.entries(EVENTS_API).forEach(([name, value]) => {
    descriptors[name] = {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    };
  });
  const namespace = facade.registerModule('events', descriptors);
  attachEventsBindings(
    namespace,
    target as unknown as Record<string, unknown>,
  );
  return namespace;
}
