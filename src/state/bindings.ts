export type LegacyValue = any;
export type LegacyFunction = (...args: LegacyValue[]) => LegacyValue;

type StateNamespace = Record<string, unknown>;
type RuntimeRoot = Record<string, unknown>;

let registeredState: StateNamespace | undefined;
let registeredRoot: RuntimeRoot | undefined;

export function attachStateBindings(
  namespace: StateNamespace,
  root: RuntimeRoot,
): void {
  registeredState = namespace;
  registeredRoot = root;
}

export function runtimeValue<T = LegacyValue>(name: string): T {
  if (registeredRoot) return Reflect.get(registeredRoot, name) as T;
  return undefined as T;
}

export function runtimeFunction(name: string): LegacyFunction {
  return runtimeValue<LegacyFunction>(name);
}

export function stateFunction(name: string): LegacyFunction {
  if (
    registeredState &&
    Object.prototype.hasOwnProperty.call(registeredState, name)
  ) {
    return Reflect.get(registeredState, name) as LegacyFunction;
  }
  return runtimeFunction(name);
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
