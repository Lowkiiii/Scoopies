import type { LegacyValue } from '../stocks/types';

type PosNamespace = Record<string, unknown>;
type RuntimeRoot = Record<string, unknown>;

let registeredPos: PosNamespace | undefined;
let registeredRoot: RuntimeRoot | undefined;

/**
 * The classic POS presentation script resolves sibling functions, state, and
 * browser globals at call time. Keep those bindings live after moving the
 * implementation behind the compatibility facade.
 */
export function attachPosBindings(
  namespace: PosNamespace,
  root: RuntimeRoot,
): void {
  registeredPos = namespace;
  registeredRoot = root;
}

export function readPosBinding<T>(name: string, fallback: T): T {
  if (
    registeredPos &&
    Object.prototype.hasOwnProperty.call(registeredPos, name)
  ) {
    return registeredPos[name] as T;
  }
  return fallback;
}

export function readRuntimeBinding<T>(name: string, fallback: T): T {
  if (registeredRoot) return Reflect.get(registeredRoot, name) as T;
  return fallback;
}

export function runtimeValue<T = LegacyValue>(name: string): T {
  return readRuntimeBinding(name, undefined as T);
}
