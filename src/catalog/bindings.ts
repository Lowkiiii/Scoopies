export type LegacyValue = any;
export type LegacyFunction = (...args: LegacyValue[]) => LegacyValue;

type CatalogNamespace = Record<string, unknown>;
type RuntimeRoot = Record<string, unknown>;

let registeredCatalog: CatalogNamespace | undefined;
let registeredRoot: RuntimeRoot | undefined;

/**
 * POS catalog workflows share mutable browser globals with classic state,
 * workspace sync, operations, and later typed domains. Resolve every binding
 * at call time so root/domain reassignment keeps the compatibility contract.
 */
export function attachCatalogBindings(
  namespace: CatalogNamespace,
  root: RuntimeRoot,
): void {
  registeredCatalog = namespace;
  registeredRoot = root;
}

export function readCatalogBinding<T>(name: string, fallback: T): T {
  if (
    registeredCatalog &&
    Object.prototype.hasOwnProperty.call(registeredCatalog, name)
  ) {
    return registeredCatalog[name] as T;
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

export function catalogFunction(name: string): LegacyFunction {
  return readCatalogBinding<LegacyFunction>(name, runtimeFunction(name));
}

export function writeRuntimeBinding(name: string, value: LegacyValue): void {
  if (registeredRoot) {
    Reflect.set(registeredRoot, name, value);
    return;
  }
  throw new ReferenceError(name + ' is not defined');
}
