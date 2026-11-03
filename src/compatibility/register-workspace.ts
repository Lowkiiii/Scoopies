import { WORKSPACE_API } from '../workspace';
import { attachWorkspaceBindings } from '../workspace/bindings';
import type { CompatibilityDomain, MatchaLunaFacade } from './facade';

export function registerWorkspaceModule(
  facade: MatchaLunaFacade,
  target: Window & typeof globalThis,
): CompatibilityDomain {
  const descriptors: Record<string, PropertyDescriptor> = {};
  Object.entries(WORKSPACE_API).forEach(([name, value]) => {
    descriptors[name] = {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    };
  });
  const namespace = facade.registerModule('workspace', descriptors);
  attachWorkspaceBindings(
    namespace,
    target as unknown as Record<string, unknown>,
  );
  return namespace;
}
