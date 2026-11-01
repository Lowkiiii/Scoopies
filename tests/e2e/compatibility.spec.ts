import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const browserNativeNames = new Set([
  'alert',
  'Blob',
  'clearTimeout',
  'confirm',
  'dispatchEvent',
  'document',
  'Event',
  'File',
  'getComputedStyle',
  'KeyboardEvent',
  'localStorage',
  'MouseEvent',
  'sessionStorage',
  'setTimeout',
]);

function legacyContractNames() {
  const source = readFileSync(resolve(process.cwd(), 'tests/costing.test.html'), 'utf8');
  const names = Array.from(source.matchAll(/\bapp\.([A-Za-z_$][\w$]*)/g), (match) => match[1]);
  return Array.from(new Set(names)).filter((name) => !browserNativeNames.has(name)).sort();
}

test('the compatibility facade exactly protects the legacy browser contract', async ({ page }) => {
  await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/, async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: 'window.supabase={createClient:function(){throw new Error("Supabase is disabled in browser tests");}};',
    });
  });
  await page.goto('index.html?test=1', { waitUntil: 'load' });
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');

  const contract = await page.evaluate(async (nativeNames) => {
    const appWindow = window as typeof window & {
      MatchaLunaApp: {
        contractVersion: number;
        contractNames: string[];
        domains: { legacy: Record<string, unknown> };
        finalized: boolean;
        ready: Promise<void>;
      };
      state: unknown;
      renderAll: unknown;
    };
    await appWindow.MatchaLunaApp.ready;
    return {
      version: appWindow.MatchaLunaApp.contractVersion,
      finalized: appWindow.MatchaLunaApp.finalized,
      readyResolved: true,
      contractNames: appWindow.MatchaLunaApp.contractNames.slice().sort(),
      namespaceNames: Object.keys(appWindow.MatchaLunaApp.domains.legacy).sort(),
      missing: appWindow.MatchaLunaApp.contractNames.filter(
        (name) => !Object.prototype.hasOwnProperty.call(appWindow, name),
      ),
      invalidProxies: appWindow.MatchaLunaApp.contractNames.filter((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(appWindow.MatchaLunaApp.domains.legacy, name);
        return !descriptor || typeof descriptor.get !== 'function' || typeof descriptor.set !== 'function';
      }),
      missingBrowserNatives: nativeNames.filter((name) => !(name in appWindow)),
      facadeBrowserNatives: nativeNames.filter((name) => appWindow.MatchaLunaApp.contractNames.includes(name)),
    };
  }, Array.from(browserNativeNames));

  expect(contract.version).toBe(1);
  expect(contract.finalized).toBe(true);
  expect(contract.readyResolved).toBe(true);
  expect(contract.contractNames).toEqual(legacyContractNames());
  expect(contract.namespaceNames).toEqual(contract.contractNames);
  expect(contract.missing).toEqual([]);
  expect(contract.invalidProxies).toEqual([]);
  expect(contract.missingBrowserNatives).toEqual([]);
  expect(contract.facadeBrowserNatives).toEqual([]);

  const proxyResult = await page.evaluate(() => {
    const appWindow = window as typeof window & {
      MatchaLunaApp: { domains: { legacy: Record<string, unknown> } };
      state: unknown;
      renderAll: unknown;
      categoryModalOpen: boolean;
    };
    const legacy = appWindow.MatchaLunaApp.domains.legacy;
    const originalState = appWindow.state;
    const originalRenderAll = appWindow.renderAll;
    const originalCategoryModalOpen = appWindow.categoryModalOpen;
    const stateFromNamespace = { source: 'namespace' };
    const stateFromGlobal = { source: 'global' };
    const renderFromNamespace = () => 'namespace';
    const renderFromGlobal = () => 'global';

    try {
      legacy.state = stateFromNamespace;
      const namespaceStateReachedGlobal = appWindow.state === stateFromNamespace;
      appWindow.state = stateFromGlobal;
      const globalStateReachedNamespace = legacy.state === stateFromGlobal;

      legacy.renderAll = renderFromNamespace;
      const namespaceFunctionReachedGlobal = appWindow.renderAll === renderFromNamespace;
      appWindow.renderAll = renderFromGlobal;
      const globalFunctionReachedNamespace = legacy.renderAll === renderFromGlobal;

      legacy.categoryModalOpen = true;
      const namespacePrimitiveReachedGlobal = appWindow.categoryModalOpen === true;
      appWindow.categoryModalOpen = false;
      const globalPrimitiveReachedNamespace = legacy.categoryModalOpen === false;

      return {
        namespaceStateReachedGlobal,
        globalStateReachedNamespace,
        namespaceFunctionReachedGlobal,
        globalFunctionReachedNamespace,
        namespacePrimitiveReachedGlobal,
        globalPrimitiveReachedNamespace,
      };
    } finally {
      appWindow.state = originalState;
      appWindow.renderAll = originalRenderAll;
      appWindow.categoryModalOpen = originalCategoryModalOpen;
    }
  });

  expect(proxyResult).toEqual({
    namespaceStateReachedGlobal: true,
    globalStateReachedNamespace: true,
    namespaceFunctionReachedGlobal: true,
    globalFunctionReachedNamespace: true,
    namespacePrimitiveReachedGlobal: true,
    globalPrimitiveReachedNamespace: true,
  });

  const moduleBridgeResult = await page.evaluate(() => {
    const appWindow = window as typeof window & {
      MatchaLunaApp: {
        domains: Record<string, Record<string, unknown>>;
        registerModule: (
          domain: string,
          descriptors: Record<string, PropertyDescriptor>,
        ) => Record<string, unknown>;
      };
      __phase2ModuleBridge?: string;
    };
    let value = 'initial';
    const namespace = appWindow.MatchaLunaApp.registerModule('future', {
      __phase2ModuleBridge: {
        get: () => value,
        set: (next: string) => {
          value = next;
        },
      },
    });
    try {
      namespace.__phase2ModuleBridge = 'from-namespace';
      const namespaceReachedGlobal = appWindow.__phase2ModuleBridge === 'from-namespace';
      appWindow.__phase2ModuleBridge = 'from-global';
      const globalReachedNamespace = namespace.__phase2ModuleBridge === 'from-global';
      return { namespaceReachedGlobal, globalReachedNamespace };
    } finally {
      delete appWindow.__phase2ModuleBridge;
      delete namespace.__phase2ModuleBridge;
    }
  });

  expect(moduleBridgeResult).toEqual({ namespaceReachedGlobal: true, globalReachedNamespace: true });
});
