export type RuntimeValue = any;
export type RuntimeFunction = (...args: RuntimeValue[]) => RuntimeValue;

type RuntimeRoot = Record<string, unknown>;

let registeredRoot: RuntimeRoot | undefined;

export function attachBootstrapBindings(root: RuntimeRoot): void {
  registeredRoot = root;
}

export function runtimeValue<T = RuntimeValue>(name: string): T {
  if (!registeredRoot) throw new ReferenceError(name + ' is not defined');
  return Reflect.get(registeredRoot, name) as T;
}

export function runtimeFunction(name: string): RuntimeFunction {
  return runtimeValue<RuntimeFunction>(name);
}

export function writeRuntimeBinding(name: string, value: RuntimeValue): void {
  if (!registeredRoot) throw new ReferenceError(name + ' is not defined');
  Reflect.set(registeredRoot, name, value);
}
