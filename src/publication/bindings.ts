export type LegacyValue = any;
export type LegacyFunction = (...args: LegacyValue[]) => LegacyValue;

type PublicationNamespace = Record<string, unknown>;
type RuntimeRoot = Record<string, unknown>;

let registeredPublication: PublicationNamespace | undefined;
let registeredRoot: RuntimeRoot | undefined;

/**
 * Classic publication functions resolve siblings, application state, and
 * browser globals at call time. Keep those bindings live after moving the
 * implementation behind the compatibility facade.
 */
export function attachPublicationBindings(
  namespace: PublicationNamespace,
  root: RuntimeRoot,
): void {
  registeredPublication = namespace;
  registeredRoot = root;
}

export function readPublicationBinding<T>(name: string, fallback: T): T {
  if (
    registeredPublication &&
    Object.prototype.hasOwnProperty.call(registeredPublication, name)
  ) {
    return registeredPublication[name] as T;
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

export function writeRuntimeBinding(name: string, value: LegacyValue): void {
  if (registeredRoot) {
    Reflect.set(registeredRoot, name, value);
    return;
  }
  throw new ReferenceError(name + ' is not defined');
}
