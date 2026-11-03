export type LegacyValue = any;
export type LegacyFunction = (...args: LegacyValue[]) => LegacyValue;

type ModalsNamespace = Record<string, unknown>;
type RuntimeRoot = Record<string, unknown>;

let registeredModals: ModalsNamespace | undefined;
let registeredRoot: RuntimeRoot | undefined;

/**
 * Modal workflows share mutable browser globals with classic state, Events,
 * Publication, POS, and Stocks code. Keep every lookup live after the typed
 * boundary is registered.
 */
export function attachModalBindings(
  namespace: ModalsNamespace,
  root: RuntimeRoot,
): void {
  registeredModals = namespace;
  registeredRoot = root;
}

export function readModalBinding<T>(name: string, fallback: T): T {
  if (
    registeredModals &&
    Object.prototype.hasOwnProperty.call(registeredModals, name)
  ) {
    return registeredModals[name] as T;
  }
  return fallback;
}

export function runtimeValue<T = LegacyValue>(name: string): T {
  if (registeredRoot) return Reflect.get(registeredRoot, name) as T;
  return undefined as T;
}

export function runtimeFunction(name: string): LegacyFunction {
  return runtimeValue<LegacyFunction>(name);
}

export function modalFunction(name: string): LegacyFunction {
  return readModalBinding<LegacyFunction>(name, runtimeFunction(name));
}

export function writeRuntimeBinding(name: string, value: LegacyValue): void {
  if (registeredRoot) {
    Reflect.set(registeredRoot, name, value);
    return;
  }
  throw new ReferenceError(name + ' is not defined');
}
