export type LegacyValue = any;
export type LegacyFunction = (...args: LegacyValue[]) => LegacyValue;

type WorkspaceNamespace = Record<string, unknown>;
type RuntimeRoot = Record<string, unknown>;

let registeredWorkspace: WorkspaceNamespace | undefined;
let registeredRoot: RuntimeRoot | undefined;

/**
 * Workspace synchronization coordinates mutable browser state with catalog,
 * POS rendering, and classic operations. Resolve every dependency at call
 * time so root and compatibility-domain reassignment remain observable.
 */
export function attachWorkspaceBindings(
  namespace: WorkspaceNamespace,
  root: RuntimeRoot,
): void {
  registeredWorkspace = namespace;
  registeredRoot = root;
}

export function readWorkspaceBinding<T>(name: string, fallback: T): T {
  if (
    registeredWorkspace &&
    Object.prototype.hasOwnProperty.call(registeredWorkspace, name)
  ) {
    return registeredWorkspace[name] as T;
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

export function workspaceFunction(name: string): LegacyFunction {
  return readWorkspaceBinding<LegacyFunction>(name, runtimeFunction(name));
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
