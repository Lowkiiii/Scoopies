import type { CostingState } from './types';

type CostingNamespace = Record<string, unknown>;
type RuntimeRoot = Record<string, unknown>;

let registeredCosting: CostingNamespace | undefined;
let registeredRoot: RuntimeRoot | undefined;

/**
 * The classic Costing helpers resolved sibling functions, Core helpers, and
 * state globals at call time. Keep those bindings live while exposing the
 * implementation through typed modules.
 */
export function attachCostingBindings(
  namespace: CostingNamespace,
  root: RuntimeRoot,
): void {
  registeredCosting = namespace;
  registeredRoot = root;
}

export function readCostingBinding<T>(name: string, fallback: T): T {
  if (
    registeredCosting &&
    Object.prototype.hasOwnProperty.call(registeredCosting, name)
  ) {
    return registeredCosting[name] as T;
  }
  return fallback;
}

export function readRuntimeBinding<T>(name: string, fallback: T): T {
  if (registeredRoot) return Reflect.get(registeredRoot, name) as T;
  return fallback;
}

export function readCostingState(): CostingState {
  return readRuntimeBinding(
    'state',
    undefined as unknown as CostingState,
  );
}
