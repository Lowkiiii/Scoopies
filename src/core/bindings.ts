type CoreNamespace = Record<string, unknown>;

let registeredCore: CoreNamespace | undefined;

/**
 * Connects typed Core helpers to the public compatibility namespace.
 *
 * The original classic script resolved sibling globals at call time. Reading
 * through the registered namespace preserves that behavior when an existing
 * integration replaces a Core global, while direct module imports can still
 * use their local fallback before browser registration.
 */
export function attachCoreBindings(namespace: CoreNamespace): void {
  registeredCore = namespace;
}

export function readCoreBinding<T>(name: string, fallback: T): T {
  if (
    registeredCore &&
    Object.prototype.hasOwnProperty.call(registeredCore, name)
  ) {
    return registeredCore[name] as T;
  }
  return fallback;
}
