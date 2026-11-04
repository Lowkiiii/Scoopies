import {
  initializeStateValues,
  STATE_API,
  STATE_BINDING_NAMES,
  STATE_FUNCTION_NAMES,
  STATE_VALUE_NAMES,
} from '../state';
import { attachStateBindings } from '../state/bindings';
import type { CompatibilityDomain, MatchaLunaFacade } from './facade';

export function registerStateModule(
  facade: MatchaLunaFacade,
  target: Window & typeof globalThis,
): CompatibilityDomain {
  const cells: Record<string, unknown> = {};
  STATE_VALUE_NAMES.forEach((name) => {
    cells[name] = undefined;
  });

  const descriptors: Record<string, PropertyDescriptor> = {};
  STATE_VALUE_NAMES.forEach((name) => {
    descriptors[name] = {
      configurable: true,
      enumerable: true,
      get: () => cells[name],
      set: (value) => {
        cells[name] = value;
      },
    };
  });
  STATE_FUNCTION_NAMES.forEach((name) => {
    descriptors[name] = {
      configurable: true,
      enumerable: true,
      value: STATE_API[name],
      writable: true,
    };
  });

  const namespace = facade.registerModule('state', descriptors);
  STATE_BINDING_NAMES.forEach((name) => {
    Object.defineProperty(target, name, {
      configurable: true,
      enumerable: true,
      get: () => Reflect.get(namespace, name),
      set: (value) => {
        Reflect.set(namespace, name, value);
      },
    });
  });
  attachStateBindings(
    namespace,
    target as unknown as Record<string, unknown>,
  );
  initializeStateValues();
  return namespace;
}
