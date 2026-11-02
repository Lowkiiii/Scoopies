type SupportNamespace = Record<string, unknown>;
type RuntimeRoot = Record<string, unknown>;

let registeredSupport: SupportNamespace | undefined;
let registeredRoot: RuntimeRoot | undefined;

/**
 * Classic Support helpers resolved application state, sibling functions, and
 * browser APIs from the global scope at call time. Keep those lookups live so
 * root and Support-domain replacements remain observable after registration.
 */
export function attachSupportBindings(
  namespace: SupportNamespace,
  root: RuntimeRoot,
): void {
  registeredSupport = namespace;
  registeredRoot = root;
}

export function readSupportBinding<T>(name: string, fallback: T): T {
  if (
    registeredSupport &&
    Object.prototype.hasOwnProperty.call(registeredSupport, name)
  ) {
    return registeredSupport[name] as T;
  }
  return fallback;
}

export function runtimeValue<T = unknown>(name: string): T {
  if (registeredRoot) return Reflect.get(registeredRoot, name) as T;
  return undefined as T;
}

export function writeRuntimeBinding(name: string, value: unknown): void {
  if (registeredRoot) {
    Reflect.set(registeredRoot, name, value);
    return;
  }
  throw new ReferenceError(name + ' is not defined');
}
