import type { LegacyValue } from './types';

type EventsNamespace = Record<string, unknown>;
type RuntimeRoot = Record<string, unknown>;

let registeredEvents: EventsNamespace | undefined;
let registeredRoot: RuntimeRoot | undefined;

/**
 * Classic event handlers resolved application globals at event time. Keep the
 * Events namespace and browser root live while the handlers run as modules.
 */
export function attachEventsBindings(
  namespace: EventsNamespace,
  root: RuntimeRoot,
): void {
  registeredEvents = namespace;
  registeredRoot = root;
}

export function readEventsBinding<T>(name: string, fallback: T): T {
  if (
    registeredEvents &&
    Object.prototype.hasOwnProperty.call(registeredEvents, name)
  ) {
    return registeredEvents[name] as T;
  }
  return fallback;
}

export function runtimeValue<T = LegacyValue>(name: string): T {
  if (registeredRoot) return Reflect.get(registeredRoot, name) as T;
  return undefined as T;
}

export function writeRuntimeBinding(name: string, value: LegacyValue): void {
  if (registeredRoot) {
    Reflect.set(registeredRoot, name, value);
    return;
  }
  throw new ReferenceError(name + ' is not defined');
}

export function incrementRuntimeBinding(name: string): LegacyValue {
  let value = runtimeValue(name);
  value++;
  writeRuntimeBinding(name, value);
  return value;
}
