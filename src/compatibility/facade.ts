import { CLASSIC_CONTRACT } from './contract';

export type CompatibilityDomain = Record<string, unknown>;

export interface MatchaLunaFacade {
  contractVersion: 1;
  contractNames: readonly string[];
  domains: Record<string, CompatibilityDomain>;
  finalized: boolean;
  ready: Promise<void>;
  bindClassic(domain: string, names: readonly string[]): CompatibilityDomain;
  registerModule(
    domain: string,
    descriptors: Record<string, PropertyDescriptor>,
  ): CompatibilityDomain;
  finalize(): MatchaLunaFacade;
}

type GlobalRoot = Window & typeof globalThis & Record<string, unknown>;

function ensureDomain(facade: MatchaLunaFacade, domain: string): CompatibilityDomain {
  if (!facade.domains[domain]) facade.domains[domain] = {};
  return facade.domains[domain];
}

export function installCompatibilityFacade(target: Window & typeof globalThis): MatchaLunaFacade {
  const root = target as GlobalRoot;
  if (root.MatchaLunaApp) throw new Error('Matcha Luna compatibility facade is already installed.');

  const facade: MatchaLunaFacade = {
    contractVersion: 1,
    contractNames: Object.freeze([...CLASSIC_CONTRACT]),
    domains: {},
    finalized: false,
    ready: Promise.resolve(),
    bindClassic(domain, names) {
      const namespace = ensureDomain(this, domain);
      names.forEach((name) => {
        Object.defineProperty(namespace, name, {
          configurable: true,
          enumerable: true,
          get: () => Reflect.get(root, name),
          set: (value) => {
            Reflect.set(root, name, value);
          },
        });
      });
      return namespace;
    },
    registerModule(domain, descriptors) {
      const namespace = ensureDomain(this, domain);
      Object.keys(descriptors || {}).forEach((name) => {
        const descriptor = Object.assign(
          { configurable: true, enumerable: true },
          descriptors[name],
        );
        Object.defineProperty(namespace, name, descriptor);
        if (!(name in root)) {
          Object.defineProperty(root, name, {
            configurable: true,
            enumerable: true,
            get: () => Reflect.get(namespace, name),
            set: (value) => {
              Reflect.set(namespace, name, value);
            },
          });
        }
      });
      return namespace;
    },
    finalize() {
      const missing = this.contractNames.filter(
        (name) => !Object.prototype.hasOwnProperty.call(root, name),
      );
      if (missing.length) {
        throw new Error(`Compatibility contract is missing: ${missing.join(', ')}`);
      }
      this.finalized = true;
      return this;
    },
  };

  root.MatchaLunaApp = facade;
  return facade;
}
