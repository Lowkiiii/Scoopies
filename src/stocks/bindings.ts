import type { LegacyValue } from './types';

type StocksNamespace = Record<string, unknown>;
type RuntimeRoot = Record<string, unknown>;

let registeredStocks: StocksNamespace | undefined;
let registeredRoot: RuntimeRoot | undefined;

/**
 * The classic Stocks script resolves sibling functions and browser globals at
 * call time. Keep those bindings live while its implementation is split into
 * typed modules.
 */
export function attachStocksBindings(
  namespace: StocksNamespace,
  root: RuntimeRoot,
): void {
  registeredStocks = namespace;
  registeredRoot = root;
}

export function readStocksBinding<T>(name: string, fallback: T): T {
  if (
    registeredStocks &&
    Object.prototype.hasOwnProperty.call(registeredStocks, name)
  ) {
    return registeredStocks[name] as T;
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
