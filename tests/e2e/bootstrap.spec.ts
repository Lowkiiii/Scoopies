import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  activeRuntimeFiles,
  bootstrapBlob,
  bootstrapCanonicalSha256,
  bootstrapNames,
  phase4lDomainOrder,
  startBlob,
  startCanonicalSha256,
  transitionRuntimeFiles,
} from './bootstrap-contract';

const localTestOrigin = 'http://127.0.0.1:4173';
const exactSupabaseSdk = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
const guardedRequestLogs: string[][] = [];

const disabledSupabaseScript = `
  window.__bootstrapSdk = {
    guardsInstalled: true, createCalls: 0, listenerCalls: 0,
    getSessionCalls: 0, queryCalls: 0, rpcCalls: 0, storageCalls: 0
  };
  window.supabase = {
    createClient() {
      window.__bootstrapSdk.createCalls += 1;
      throw new Error('Unexpected Supabase client creation in Bootstrap fixture');
    }
  };
`;

const connectedSupabaseScript = `
  (() => {
    const probe = window.__bootstrapSdk = {
      guardsInstalled: true, createCalls: 0, listenerCalls: 0,
      getSessionCalls: 0, queryCalls: 0, rpcCalls: 0, storageCalls: 0,
      authReceivers: [], getSessionImpl: () => Promise.resolve({ data: { session: null } })
    };
    const auth = {
      getSession() {
        probe.getSessionCalls += 1;
        probe.authReceivers.push(this === auth);
        return probe.getSessionImpl();
      },
      onAuthStateChange(callback) {
        probe.listenerCalls += 1;
        probe.listenerShape = typeof callback === 'function';
      }
    };
    const client = {
      auth,
      realtime: { setAuth() {} },
      from() {
        probe.queryCalls += 1;
        throw new Error('Unexpected table query in Bootstrap fixture');
      },
      rpc() {
        probe.rpcCalls += 1;
        throw new Error('Unexpected RPC in Bootstrap fixture');
      },
      storage: {
        from() {
          probe.storageCalls += 1;
          throw new Error('Unexpected object-storage call in Bootstrap fixture');
        }
      }
    };
    probe.auth = auth;
    probe.client = client;
    window.supabase = {
      createClient(url, key, options) {
        probe.createCalls += 1;
        probe.createShape = {
          secureUrl: String(url).startsWith('https://'),
          hasKey: !!key,
          persistSession: options?.auth?.persistSession === true,
          autoRefreshToken: options?.auth?.autoRefreshToken === true
        };
        return client;
      }
    };
  })();
`;

test.beforeEach(() => {
  guardedRequestLogs.length = 0;
});

test.afterEach(() => {
  for (const escaped of guardedRequestLogs) expect(escaped).toEqual([]);
});

async function installStorageAndFetchGuards(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const root = window as typeof window & Record<string, any>;
    const probe = root.__bootstrapGuards = {
      installed: true,
      storageWrites: [] as string[],
      fetchCalls: 0,
    };
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      probe.storageWrites.push(String(key));
      return originalSetItem.call(this, key, value);
    };
    const originalFetch = window.fetch;
    window.fetch = function (...args: Parameters<typeof fetch>) {
      probe.fetchCalls += 1;
      return Reflect.apply(originalFetch, window, args);
    };
  });
}

async function installNetworkGuards(
  page: Page,
  supabaseScript = disabledSupabaseScript,
): Promise<string[]> {
  const escaped: string[] = [];
  guardedRequestLogs.push(escaped);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.href === exactSupabaseSdk) {
      await route.fulfill({
        contentType: 'application/javascript',
        body: supabaseScript,
      });
      return;
    }
    if (url.origin === localTestOrigin) {
      await route.continue();
      return;
    }
    escaped.push(url.href);
    await route.abort('blockedbyclient');
  });
  return escaped;
}

async function openTestPage(
  page: Page,
  supabaseScript = disabledSupabaseScript,
): Promise<void> {
  await installStorageAndFetchGuards(page);
  const escaped = await installNetworkGuards(page, supabaseScript);
  await page.goto('index.html?test=1', { waitUntil: 'load' });
  await page.evaluate(() => window.MatchaLunaApp.ready);
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
  expect(escaped).toEqual([]);
}

function canonicalLf(input: Buffer): Buffer {
  return Buffer.from(input.toString('utf8').replace(/\r\n?/g, '\n'), 'utf8');
}

function gitBlobId(input: Buffer): string {
  const header = Buffer.from(`blob ${input.length}\0`, 'utf8');
  return createHash('sha1').update(header).update(input).digest('hex');
}

async function cachedPhase4KProbe(context: BrowserContext): Promise<any> {
  const builtHtml = readFileSync(resolve(process.cwd(), 'dist/index.html'), 'utf8');
  const html = builtHtml
    .replace(/\s*<script type="module"[^>]*><\/script>/, '')
    .replace(
      '</body>',
      '<script type="module" src="/Scoopies/phase4k-cached-loader.js"></script></body>',
    );
  const page = await context.newPage();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const runtimeRequests: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/Scoopies/assets/js/')) {
      runtimeRequests.push(
        `${url.pathname.split('/').pop()}?${url.searchParams.toString()}`,
      );
    }
  });
  await installStorageAndFetchGuards(page);
  await installNetworkGuards(page);
  await page.route('**/index.html?test=1&phase4k-cached=1', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.route('**/phase4k-cached-loader.js', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `
        const files = ${JSON.stringify(transitionRuntimeFiles)};
        const root = window;
        root.__phase4kCached = {
          bootCalls: 0, finalizedAtBoot: false, typedBootstrap: false
        };
        const load = (file) => new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.async = false;
          script.src = '/Scoopies/assets/js/' + file + '?v=phase4k-cached';
          script.dataset.cachedPhase4kRuntime = file;
          script.onload = resolve;
          script.onerror = () => reject(new Error('cached runtime failed: ' + file));
          document.body.append(script);
        });
        for (const file of files) {
          await load(file);
          if (file === 'boot.js') {
            const originalBoot = root.boot;
            root.boot = function (...args) {
              root.__phase4kCached.bootCalls += 1;
              root.__phase4kCached.finalizedAtBoot = !!root.MatchaLunaApp?.finalized;
              root.__phase4kCached.typedBootstrap = !!root.MatchaLunaApp?.domains?.bootstrap;
              return originalBoot.apply(this, args);
            };
          }
        }
      `,
    });
  });
  await page.goto('index.html?test=1&phase4k-cached=1', { waitUntil: 'load' });
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
  const result = await page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    return {
      probe: root.__phase4kCached,
      finalized: root.MatchaLunaApp?.finalized,
      contractCount: root.MatchaLunaApp?.contractNames?.length,
      scripts: Array.from(
        document.querySelectorAll<HTMLScriptElement>(
          'script[data-cached-phase4k-runtime]',
        ),
        (script) => script.dataset.cachedPhase4kRuntime,
      ),
    };
  });
  await page.close();
  return { result, pageErrors, consoleErrors, runtimeRequests };
}

test('typed Bootstrap preserves its exact API, registration slot, runtime, cached paths, and fallback bytes', async ({ page, context }) => {
  const runtimeRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/Scoopies/assets/js/')) {
      runtimeRequests.push(url.pathname.split('/').pop() || '');
    }
  });
  await openTestPage(page);
  const contract = await page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    const facade = root.MatchaLunaApp;
    const bootstrap = facade.domains.bootstrap;
    const domainDescriptor = Object.getOwnPropertyDescriptor(bootstrap, 'boot')!;
    const rootDescriptor = Object.getOwnPropertyDescriptor(root, 'boot')!;
    const original = bootstrap.boot;
    const marker = function markerBoot() {};
    bootstrap.boot = marker;
    const domainToRoot = root.boot === marker;
    root.boot = original;
    const rootToDomain = bootstrap.boot === original;
    return {
      names: Object.keys(bootstrap),
      domainOrder: Object.keys(facade.domains),
      protectedBoot: facade.contractNames.includes('boot'),
      contractVersion: facade.contractVersion,
      contractCount: facade.contractNames.length,
      finalized: facade.finalized,
      domainDescriptor: {
        configurable: domainDescriptor.configurable,
        enumerable: domainDescriptor.enumerable,
        writable: domainDescriptor.writable,
        get: typeof domainDescriptor.get,
        set: typeof domainDescriptor.set,
      },
      rootDescriptor: {
        configurable: rootDescriptor.configurable,
        enumerable: rootDescriptor.enumerable,
        writable: rootDescriptor.writable,
        get: typeof rootDescriptor.get,
        set: typeof rootDescriptor.set,
      },
      domainToRoot,
      rootToDomain,
      runtime: Array.from(
        document.querySelectorAll<HTMLScriptElement>(
          'script[data-matcha-luna-runtime]',
        ),
        (script) => script.dataset.matchaLunaRuntime,
      ),
    };
  });
  expect(contract).toEqual({
    names: bootstrapNames,
    domainOrder: phase4lDomainOrder,
    protectedBoot: false,
    contractVersion: 1,
    contractCount: 175,
    finalized: true,
    domainDescriptor: {
      configurable: true,
      enumerable: true,
      writable: true,
      get: 'undefined',
      set: 'undefined',
    },
    rootDescriptor: {
      configurable: true,
      enumerable: true,
      writable: undefined,
      get: 'function',
      set: 'function',
    },
    domainToRoot: true,
    rootToDomain: true,
    runtime: activeRuntimeFiles,
  });
  expect(runtimeRequests.filter((file) => file === 'start.js')).toHaveLength(1);
  expect(runtimeRequests.filter((file) => file === 'boot.js')).toEqual([]);
  expect(runtimeRequests.filter((file) => file === 'state.js')).toEqual([]);

  const cached = await cachedPhase4KProbe(context);
  expect(cached.result).toEqual({
    probe: { bootCalls: 1, finalizedAtBoot: true, typedBootstrap: false },
    finalized: true,
    contractCount: 175,
    scripts: transitionRuntimeFiles,
  });
  expect(cached.runtimeRequests).toEqual(
    transitionRuntimeFiles.map((file) => `${file}?v=phase4k-cached`),
  );
  expect(cached.pageErrors).toEqual([]);
  expect(cached.consoleErrors).toEqual([]);

  for (const [file, blob, sha] of [
    ['boot.js', bootstrapBlob, bootstrapCanonicalSha256],
    ['start.js', startBlob, startCanonicalSha256],
  ] as const) {
    const source = readFileSync(resolve(process.cwd(), `assets/js/${file}`));
    const unversioned = await page.request.get(`/Scoopies/assets/js/${file}`);
    const versioned = await page.request.get(
      `/Scoopies/assets/js/${file}?v=phase4k-cached`,
    );
    expect(unversioned.status()).toBe(200);
    expect(versioned.status()).toBe(200);
    const unversionedBody = await unversioned.body();
    const versionedBody = await versioned.body();
    expect(unversionedBody).toEqual(source);
    expect(versionedBody).toEqual(source);
    expect(gitBlobId(canonicalLf(source))).toBe(blob);
    expect(createHash('sha256').update(canonicalLf(source)).digest('hex')).toBe(
      sha,
    );
  }
});

test('typed Bootstrap preserves the exact Test-mode trace, synchronous effects, and zero-I/O boundary', async ({ page }) => {
  await openTestPage(page);
  const result = await page.evaluate(async () => {
    const root = window as typeof window & Record<string, any>;
    root.__bootstrapGuards.storageWrites.length = 0;
    const trace: any[] = [];
    const stateMarker = { marker: 'state' };
    const snapshotMarker = { marker: 'snapshot' };
    const functionNames = [
      'renderGate', 'showGate', 'setStatus', 'snapshot', 'renderAccount',
      'renderAll', 'activeUrl', 'activeKey', 'initClient', 'saveCfg',
      'handleAuth',
    ];
    const originals = Object.fromEntries(
      functionNames.map((name) => [name, root[name]]),
    );
    const descriptors = Object.fromEntries(
      ['TEST_MODE', 'offlineMode', 'lastState'].map((name) => [
        name,
        Object.getOwnPropertyDescriptor(root, name),
      ]),
    );
    let offline: unknown;
    let lastState: unknown;
    let forbiddenCalls = 0;
    try {
      Object.defineProperty(root, 'TEST_MODE', {
        configurable: true,
        enumerable: true,
        get() { trace.push(['TEST_MODE']); return true; },
      });
      Object.defineProperty(root, 'offlineMode', {
        configurable: true,
        enumerable: true,
        get: () => offline,
        set(value) { offline = value; trace.push(['offlineMode', value]); },
      });
      Object.defineProperty(root, 'lastState', {
        configurable: true,
        enumerable: true,
        get: () => lastState,
        set(value) { lastState = value; trace.push(['lastState', value === snapshotMarker]); },
      });
      root.state = stateMarker;
      root.renderGate = function (this: unknown) {
        'use strict'; trace.push(['renderGate', this === undefined]);
      };
      root.showGate = function (this: unknown, visible: boolean) {
        'use strict'; trace.push(['showGate', this === undefined, visible]);
      };
      root.setStatus = function (this: unknown, text: string, kind: string) {
        'use strict'; trace.push(['setStatus', this === undefined, text, kind]);
      };
      root.snapshot = function (this: unknown, value: unknown) {
        'use strict';
        trace.push(['snapshot', this === undefined, value === stateMarker]);
        return snapshotMarker;
      };
      root.renderAccount = function (this: unknown) {
        'use strict'; trace.push(['renderAccount', this === undefined]);
      };
      root.renderAll = function (this: unknown) {
        'use strict'; trace.push(['renderAll', this === undefined]);
      };
      ['activeUrl', 'activeKey', 'initClient', 'saveCfg', 'handleAuth']
        .forEach((name) => {
          root[name] = function () { forbiddenCalls += 1; };
        });

      const promise = root.boot.call({ ignoredReceiver: true }, 'ignored');
      let settled = false;
      promise.then(() => { settled = true; });
      const synchronous = {
        isPromise: promise instanceof Promise,
        settled,
        trace: structuredClone(trace),
      };
      const resolution = await promise;
      return {
        synchronous,
        resolutionWasUndefined: resolution === undefined,
        offline,
        lastStateIsSnapshot: lastState === snapshotMarker,
        forbiddenCalls,
        sdk: root.__bootstrapSdk,
        guards: root.__bootstrapGuards,
      };
    } finally {
      Object.entries(originals).forEach(([name, value]) => { root[name] = value; });
      Object.entries(descriptors).forEach(([name, descriptor]) => {
        Object.defineProperty(root, name, descriptor as PropertyDescriptor);
      });
    }
  });
  expect(result.synchronous).toEqual({
    isPromise: true,
    settled: false,
    trace: [
      ['renderGate', true],
      ['TEST_MODE'],
      ['offlineMode', true],
      ['showGate', true, false],
      ['setStatus', true, 'Test mode', ''],
      ['snapshot', true, true],
      ['lastState', true],
      ['renderAccount', true],
      ['renderAll', true],
    ],
  });
  expect(result).toMatchObject({
    resolutionWasUndefined: true,
    offline: true,
    lastStateIsSnapshot: true,
    forbiddenCalls: 0,
    sdk: {
      guardsInstalled: true,
      createCalls: 0,
      getSessionCalls: 0,
      queryCalls: 0,
      rpcCalls: 0,
      storageCalls: 0,
    },
    guards: { installed: true, storageWrites: [], fetchCalls: 0 },
  });
});

test('typed Bootstrap preserves the exact offline trace, accessors, timing, and zero-auth boundary', async ({ page }) => {
  await openTestPage(page);
  const result = await page.evaluate(async () => {
    const root = window as typeof window & Record<string, any>;
    root.__bootstrapGuards.storageWrites.length = 0;
    const trace: any[] = [];
    const stateMarker = { marker: 'offline-state' };
    const snapshotMarker = { marker: 'offline-snapshot' };
    const names = [
      'renderGate', 'activeUrl', 'activeKey', 'initClient', 'showGate',
      'setStatus', 'snapshot', 'renderAccount', 'renderAll', 'saveCfg',
      'handleAuth',
    ];
    const originals = Object.fromEntries(names.map((name) => [name, root[name]]));
    const descriptors = Object.fromEntries(
      ['TEST_MODE', 'offlineMode', 'lastState'].map((name) => [
        name,
        Object.getOwnPropertyDescriptor(root, name),
      ]),
    );
    let offline: unknown;
    let lastState: unknown;
    let forbiddenCalls = 0;
    try {
      Object.defineProperty(root, 'TEST_MODE', {
        configurable: true, enumerable: true,
        get() { trace.push(['TEST_MODE']); return false; },
      });
      Object.defineProperty(root, 'offlineMode', {
        configurable: true, enumerable: true, get: () => offline,
        set(value) { offline = value; trace.push(['offlineMode', value]); },
      });
      Object.defineProperty(root, 'lastState', {
        configurable: true, enumerable: true, get: () => lastState,
        set(value) { lastState = value; trace.push(['lastState', value === snapshotMarker]); },
      });
      root.state = stateMarker;
      root.renderGate = function (this: unknown) {
        'use strict'; trace.push(['renderGate', this === undefined]);
      };
      root.activeUrl = function (this: unknown) {
        'use strict'; trace.push(['activeUrl', this === undefined]); return 'offline-url';
      };
      root.activeKey = function (this: unknown) {
        'use strict'; trace.push(['activeKey', this === undefined]); return 'offline-key';
      };
      root.initClient = function (this: unknown, url: string, key: string) {
        'use strict'; trace.push(['initClient', this === undefined, url, key]); return false;
      };
      root.showGate = function (this: unknown, visible: boolean) {
        'use strict'; trace.push(['showGate', this === undefined, visible]);
      };
      root.setStatus = function (this: unknown, text: string, kind: string) {
        'use strict'; trace.push(['setStatus', this === undefined, text, kind]);
      };
      root.snapshot = function (this: unknown, value: unknown) {
        'use strict'; trace.push(['snapshot', this === undefined, value === stateMarker]);
        return snapshotMarker;
      };
      root.renderAccount = function (this: unknown) {
        'use strict'; trace.push(['renderAccount', this === undefined]);
      };
      root.renderAll = function (this: unknown) {
        'use strict'; trace.push(['renderAll', this === undefined]);
      };
      root.saveCfg = root.handleAuth = function () { forbiddenCalls += 1; };

      const promise = root.boot();
      let settled = false;
      promise.then(() => { settled = true; });
      const synchronousTrace = structuredClone(trace);
      const synchronousSettled = settled;
      const resolution = await promise;
      return {
        synchronousTrace,
        synchronousSettled,
        resolutionWasUndefined: resolution === undefined,
        offline,
        lastStateIsSnapshot: lastState === snapshotMarker,
        forbiddenCalls,
        sdk: root.__bootstrapSdk,
        guards: root.__bootstrapGuards,
      };
    } finally {
      Object.entries(originals).forEach(([name, value]) => { root[name] = value; });
      Object.entries(descriptors).forEach(([name, descriptor]) => {
        Object.defineProperty(root, name, descriptor as PropertyDescriptor);
      });
    }
  });
  expect(result.synchronousSettled).toBe(false);
  expect(result.synchronousTrace).toEqual([
    ['renderGate', true],
    ['TEST_MODE'],
    ['activeUrl', true],
    ['activeKey', true],
    ['initClient', true, 'offline-url', 'offline-key'],
    ['offlineMode', true],
    ['showGate', true, false],
    ['setStatus', true, 'Saved on device', ''],
    ['snapshot', true, true],
    ['lastState', true],
    ['renderAccount', true],
    ['renderAll', true],
  ]);
  expect(result).toMatchObject({
    resolutionWasUndefined: true,
    offline: true,
    lastStateIsSnapshot: true,
    forbiddenCalls: 0,
    sdk: { createCalls: 0, getSessionCalls: 0 },
    guards: { installed: true, storageWrites: [], fetchCalls: 0 },
  });
});

test('typed Bootstrap preserves connected session extraction, receivers, config, and late live dependencies', async ({ page }) => {
  const startupConsole: string[] = [];
  page.on('console', (message) => startupConsole.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => startupConsole.push(`pageerror: ${error.message}`));
  await openTestPage(page, connectedSupabaseScript);
  expect(
    await page.evaluate(() => ({
      sdk: !!(window as typeof window & Record<string, any>).__bootstrapSdk,
      supabase: !!(window as typeof window & Record<string, any>).supabase,
    })),
    startupConsole.join('\n'),
  ).toEqual({ sdk: true, supabase: true });
  const result = await page.evaluate(async () => {
    const root = window as typeof window & Record<string, any>;
    const sdk = root.__bootstrapSdk;
    const guards = root.__bootstrapGuards;
    guards.storageWrites.length = 0;
    const trace: any[] = [];
    const names = [
      'renderGate', 'activeUrl', 'activeKey', 'initClient', 'saveCfg',
      'setStatus', 'handleAuth', 'renderAll',
    ];
    const originals = Object.fromEntries(names.map((name) => [name, root[name]]));
    const testDescriptor = Object.getOwnPropertyDescriptor(root, 'TEST_MODE')!;
    const realInitClient = root.initClient;
    const realSaveCfg = root.saveCfg;
    const sessionArguments: any[] = [];
    let dataReads = 0;
    try {
      Object.defineProperty(root, 'TEST_MODE', {
        configurable: true, enumerable: true, value: false, writable: true,
      });
      root.renderGate = function (this: unknown) {
        'use strict'; trace.push(['renderGate', this === undefined]);
      };
      root.activeUrl = function (this: unknown) {
        'use strict'; trace.push(['activeUrl', this === undefined]);
        return 'https://bootstrap.invalid';
      };
      root.activeKey = function (this: unknown) {
        'use strict'; trace.push(['activeKey', this === undefined]);
        return 'fixture-key';
      };
      root.initClient = function (this: unknown, url: string, key: string) {
        'use strict'; trace.push(['initClient', this === undefined]);
        return Reflect.apply(realInitClient, undefined, [url, key]);
      };
      root.saveCfg = function (this: unknown, config: Record<string, unknown>) {
        'use strict';
        trace.push([
          'saveCfg', this === undefined, Object.keys(config),
          !!config.url, !!config.key,
        ]);
        return Reflect.apply(realSaveCfg, undefined, [config]);
      };
      root.setStatus = function (this: unknown, text: string, kind: string) {
        'use strict'; trace.push(['setStatus', this === undefined, text, kind]);
      };
      root.renderAll = Function(
        'window.__bootstrapConnectedTrace.push(["renderAll", this === window, "initial"]);',
      );
      root.__bootstrapConnectedTrace = trace;

      sdk.getSessionImpl = () => Promise.resolve(null);
      root.handleAuth = function (this: unknown, value: unknown) {
        'use strict'; sessionArguments.push(value); trace.push(['handleAuth', this === undefined, value === null]);
      };
      await root.boot();

      sdk.getSessionImpl = () => Promise.resolve({ data: {} });
      root.handleAuth = function (this: unknown, value: unknown) {
        'use strict'; sessionArguments.push(value); trace.push(['handleAuthUndefined', this === undefined, value === undefined]);
      };
      await root.boot();

      let releaseSession!: (value: unknown) => void;
      let releaseAuth!: () => void;
      let authStarted!: () => void;
      const authStartedPromise = new Promise<void>((resolve) => { authStarted = resolve; });
      sdk.getSessionImpl = () => new Promise((resolve) => { releaseSession = resolve; });
      root.handleAuth = () => { throw new Error('Early handleAuth binding was captured'); };
      const pending = root.boot();
      root.handleAuth = async function (this: unknown, value: any) {
        'use strict';
        sessionArguments.push(value);
        trace.push(['lateHandleAuth', this === undefined, value?.marker]);
        authStarted();
        await new Promise<void>((resolve) => { releaseAuth = resolve; });
      };
      const firstData = { session: { marker: 'first' } };
      const secondData = { session: { marker: 'second' } };
      releaseSession({
        get data() {
          dataReads += 1;
          return dataReads === 1 ? firstData : secondData;
        },
      });
      await authStartedPromise;
      root.renderAll = Function(
        'window.__bootstrapConnectedTrace.push(["renderAll", this === window, "late"]);',
      );
      releaseAuth();
      await pending;

      return {
        trace,
        dataReads,
        arguments: sessionArguments.map((value) => ({
          wasNull: value === null,
          wasUndefined: value === undefined,
          marker: value?.marker || '',
        })),
        sdk: {
          createCalls: sdk.createCalls,
          listenerCalls: sdk.listenerCalls,
          listenerShape: sdk.listenerShape,
          getSessionCalls: sdk.getSessionCalls,
          authReceivers: sdk.authReceivers,
          queryCalls: sdk.queryCalls,
          rpcCalls: sdk.rpcCalls,
          storageCalls: sdk.storageCalls,
          createShape: sdk.createShape,
        },
        guards: {
          installed: guards.installed,
          storageWrites: guards.storageWrites,
          fetchCalls: guards.fetchCalls,
        },
        cfgKey: root.CFG_KEY,
      };
    } finally {
      Object.entries(originals).forEach(([name, value]) => { root[name] = value; });
      Object.defineProperty(root, 'TEST_MODE', testDescriptor);
      delete root.__bootstrapConnectedTrace;
    }
  });
  expect(result.dataReads).toBe(2);
  expect(result.arguments).toEqual([
    { wasNull: true, wasUndefined: false, marker: '' },
    { wasNull: false, wasUndefined: true, marker: '' },
    { wasNull: false, wasUndefined: false, marker: 'second' },
  ]);
  expect(result.sdk).toEqual({
    createCalls: 3,
    listenerCalls: 3,
    listenerShape: true,
    getSessionCalls: 3,
    authReceivers: [true, true, true],
    queryCalls: 0,
    rpcCalls: 0,
    storageCalls: 0,
    createShape: {
      secureUrl: true,
      hasKey: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  expect(result.guards).toEqual({
    installed: true,
    storageWrites: [result.cfgKey, result.cfgKey, result.cfgKey],
    fetchCalls: 0,
  });
  expect(result.trace).toContainEqual(['lateHandleAuth', true, 'second']);
  expect(result.trace.at(-1)).toEqual(['renderAll', true, 'late']);
  expect(result.trace.filter((entry: any[]) => entry[0] === 'saveCfg')).toEqual([
    ['saveCfg', true, ['url', 'key'], true, true],
    ['saveCfg', true, ['url', 'key'], true, true],
    ['saveCfg', true, ['url', 'key'], true, true],
  ]);
});

test('classic Start invokes typed Bootstrap once after finalization without delaying facade readiness', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const runtimeRequests: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/Scoopies/assets/js/')) {
      runtimeRequests.push(url.pathname.split('/').pop() || '');
    }
  });
  await installStorageAndFetchGuards(page);
  await page.addInitScript(() => {
    const root = window as typeof window & Record<string, any>;
    root.__bootstrapStartProbe = {
      calls: 0,
      finalizedAtCall: false,
      returnedPromise: false,
      settled: false,
      lateAuth: null,
    };
    Object.defineProperty(window, 'MatchaLunaApp', {
      configurable: true,
      enumerable: true,
      get: () => undefined,
      set: (facade: any) => {
        Object.defineProperty(window, 'MatchaLunaApp', {
          configurable: true,
          enumerable: true,
          value: facade,
          writable: true,
        });
        const originalRegister = facade.registerModule;
        facade.registerModule = function (
          domain: string,
          descriptors: Record<string, PropertyDescriptor>,
        ) {
          if (domain === 'bootstrap') {
            const descriptor = descriptors.boot;
            const originalBoot = descriptor.value;
            descriptors = {
              ...descriptors,
              boot: {
                ...descriptor,
                value: function (this: unknown, ...args: unknown[]) {
                  const probe = root.__bootstrapStartProbe;
                  probe.calls += 1;
                  probe.finalizedAtCall = !!root.MatchaLunaApp.finalized;
                  const promise = Reflect.apply(originalBoot, this, args);
                  probe.returnedPromise = promise instanceof Promise;
                  Promise.resolve(promise).then(
                    () => { probe.settled = true; },
                    () => { probe.settled = true; },
                  );
                  return promise;
                },
              },
            };
          }
          return Reflect.apply(originalRegister, this, [domain, descriptors]);
        };
      },
    });
  });
  const deferredSdk = `${connectedSupabaseScript}
    (() => {
      let release;
      window.__bootstrapSdk.getSessionImpl = () =>
        new Promise((resolve) => { release = resolve; });
      window.__bootstrapSdk.releaseSession = () =>
        release({ data: { session: { user: { id: 'shape-only' } } } });
    })();
  `;
  await installNetworkGuards(page, deferredSdk);
  await page.goto('index.html?bootstrap-deferred=1', { waitUntil: 'load' });
  await page.evaluate(() => window.MatchaLunaApp.ready);
  const beforeRelease = await page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    return {
      ...root.__bootstrapStartProbe,
      readyResolved: root.MatchaLunaApp.finalized,
      bootstrapKeys: Object.keys(root.MatchaLunaApp.domains.bootstrap),
      sdk: {
        createCalls: root.__bootstrapSdk.createCalls,
        listenerCalls: root.__bootstrapSdk.listenerCalls,
        getSessionCalls: root.__bootstrapSdk.getSessionCalls,
      },
      storageWrites: root.__bootstrapGuards.storageWrites,
    };
  });
  expect(beforeRelease).toMatchObject({
    calls: 1,
    finalizedAtCall: true,
    returnedPromise: true,
    settled: false,
    readyResolved: true,
    bootstrapKeys: ['boot'],
    sdk: { createCalls: 1, listenerCalls: 1, getSessionCalls: 1 },
    storageWrites: ['scoopies_cloud_cfg'],
  });

  await page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    root.handleAuth = async (session: any, event: unknown) => {
      root.__bootstrapStartProbe.lateAuth = {
        hasSession: !!session,
        hasUser: !!session?.user,
        eventWasOmitted: event === undefined,
      };
      root.offlineMode = false;
      root.lastState = { writtenThroughRootAccessor: true };
    };
    root.MatchaLunaApp.domains.state.offlineMode = true;
    root.__bootstrapSdk.releaseSession();
  });
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & Record<string, any>).__bootstrapStartProbe.settled,
  )).toBe(true);
  const afterRelease = await page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    const state = root.MatchaLunaApp.domains.state as Record<string, any>;
    return {
      probe: root.__bootstrapStartProbe,
      rootOffline: root.offlineMode,
      domainOffline: state.offlineMode,
      rootLastState: root.lastState?.writtenThroughRootAccessor,
      domainLastState: state.lastState?.writtenThroughRootAccessor,
      guards: root.__bootstrapGuards,
      sdk: root.__bootstrapSdk,
    };
  });
  expect(afterRelease.probe).toMatchObject({
    calls: 1,
    settled: true,
    lateAuth: { hasSession: true, hasUser: true, eventWasOmitted: true },
  });
  expect(afterRelease).toMatchObject({
    rootOffline: false,
    domainOffline: false,
    rootLastState: true,
    domainLastState: true,
    guards: { installed: true, fetchCalls: 0 },
    sdk: { queryCalls: 0, rpcCalls: 0, storageCalls: 0 },
  });
  expect(runtimeRequests).toEqual(['start.js']);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('typed Bootstrap catches only connected client, session, extraction, and auth failures with exact recovery', async ({ page }) => {
  await openTestPage(page);
  const result = await page.evaluate(async () => {
    const root = window as typeof window & Record<string, any>;
    const functionNames = [
      'renderGate', 'activeUrl', 'activeKey', 'initClient', 'saveCfg',
      'setStatus', 'showGate', 'renderAccount', 'renderAll', 'handleAuth',
    ];
    const originals = Object.fromEntries(
      functionNames.map((name) => [name, root[name]]),
    );
    const testDescriptor = Object.getOwnPropertyDescriptor(root, 'TEST_MODE')!;
    const offlineDescriptor = Object.getOwnPropertyDescriptor(root, 'offlineMode')!;
    const originalCloud = root.cloud;
    const results: any[] = [];
    let currentTrace: any[] = [];
    let offline: unknown;
    try {
      Object.defineProperty(root, 'TEST_MODE', {
        configurable: true, enumerable: true, value: false, writable: true,
      });
      Object.defineProperty(root, 'offlineMode', {
        configurable: true, enumerable: true, get: () => offline,
        set(value) { offline = value; currentTrace.push(['offlineMode', value]); },
      });
      const scenarios = [
        'client-access', 'auth-access', 'getSession-throw', 'getSession-reject',
        'session-extraction', 'handleAuth-throw', 'handleAuth-reject',
      ];
      for (const scenario of scenarios) {
        currentTrace = [];
        offline = 'unchanged';
        const failure = { scenario };
        root.renderGate = () => currentTrace.push(['renderGate']);
        root.activeUrl = () => { currentTrace.push(['activeUrl']); return 'url'; };
        root.activeKey = () => { currentTrace.push(['activeKey']); return 'key'; };
        root.initClient = () => { currentTrace.push(['initClient']); return true; };
        root.saveCfg = (config: unknown) => currentTrace.push(['saveCfg', !!config]);
        root.setStatus = (text: string, kind: string) =>
          currentTrace.push(['setStatus', text, kind]);
        root.showGate = (visible: boolean) => currentTrace.push(['showGate', visible]);
        root.renderAccount = () => currentTrace.push(['renderAccount']);
        root.renderAll = () => currentTrace.push(['renderAll']);
        root.handleAuth = () => currentTrace.push(['handleAuth']);

        const getSession = () => Promise.resolve({ data: { session: null } });
        if (scenario === 'client-access') {
          root.cloud = Object.defineProperty({}, 'client', {
            get() { currentTrace.push(['fault', scenario]); throw failure; },
          });
        } else if (scenario === 'auth-access') {
          root.cloud = {
            client: Object.defineProperty({}, 'auth', {
              get() { currentTrace.push(['fault', scenario]); throw failure; },
            }),
          };
        } else {
          const auth: any = { getSession };
          root.cloud = { client: { auth } };
          if (scenario === 'getSession-throw') {
            auth.getSession = () => { currentTrace.push(['fault', scenario]); throw failure; };
          }
          if (scenario === 'getSession-reject') {
            auth.getSession = () => {
              currentTrace.push(['fault', scenario]); return Promise.reject(failure);
            };
          }
          if (scenario === 'session-extraction') {
            auth.getSession = () => Promise.resolve({
              get data() { currentTrace.push(['fault', scenario]); throw failure; },
            });
          }
          if (scenario === 'handleAuth-throw') {
            root.handleAuth = () => { currentTrace.push(['fault', scenario]); throw failure; };
          }
          if (scenario === 'handleAuth-reject') {
            root.handleAuth = () => {
              currentTrace.push(['fault', scenario]); return Promise.reject(failure);
            };
          }
        }
        const value = await root.boot();
        results.push({ scenario, valueWasUndefined: value === undefined, offline, trace: currentTrace });
      }
      return results;
    } finally {
      Object.entries(originals).forEach(([name, value]) => { root[name] = value; });
      Object.defineProperty(root, 'TEST_MODE', testDescriptor);
      Object.defineProperty(root, 'offlineMode', offlineDescriptor);
      root.cloud = originalCloud;
    }
  });
  expect(result.map((entry: any) => entry.scenario)).toEqual([
    'client-access', 'auth-access', 'getSession-throw', 'getSession-reject',
    'session-extraction', 'handleAuth-throw', 'handleAuth-reject',
  ]);
  result.forEach((entry: any) => {
    expect(entry.valueWasUndefined).toBe(true);
    expect(entry.offline).toBe(false);
    expect(entry.trace.slice(0, 6)).toEqual([
      ['renderGate'], ['activeUrl'], ['activeKey'], ['initClient'],
      ['saveCfg', true], ['setStatus', 'Connecting…', ''],
    ]);
    expect(entry.trace.slice(-5)).toEqual([
      ['offlineMode', false],
      ['showGate', true],
      ['setStatus', 'Sign in to sync', 'bad'],
      ['renderAccount'],
      ['renderAll'],
    ]);
  });
});

test('typed Bootstrap rejects outside-try, recovery, and final-render failures without coupling Start readiness', async ({ page, context }) => {
  await openTestPage(page);
  const manual = await page.evaluate(async () => {
    const root = window as typeof window & Record<string, any>;
    const names = [
      'renderGate', 'activeUrl', 'activeKey', 'initClient', 'saveCfg',
      'setStatus', 'showGate', 'snapshot', 'renderAccount', 'renderAll',
      'handleAuth',
    ];
    const originals = Object.fromEntries(names.map((name) => [name, root[name]]));
    const testDescriptor = Object.getOwnPropertyDescriptor(root, 'TEST_MODE')!;
    const originalCloud = root.cloud;
    const scenarios = [
      'renderGate', 'TEST_MODE', 'activeUrl', 'activeKey', 'initClient',
      'saveCfg', 'connectingStatus', 'testShowGate', 'offlineSnapshot',
      'recoveryShowGate', 'finalRender',
    ];
    const results: any[] = [];
    try {
      for (const scenario of scenarios) {
        const trace: string[] = [];
        const failure = { scenario };
        Object.defineProperty(root, 'TEST_MODE', {
          configurable: true,
          enumerable: true,
          get() {
            trace.push('TEST_MODE');
            if (scenario === 'TEST_MODE') throw failure;
            return scenario === 'testShowGate';
          },
        });
        root.renderGate = () => {
          trace.push('renderGate'); if (scenario === 'renderGate') throw failure;
        };
        root.activeUrl = () => {
          trace.push('activeUrl'); if (scenario === 'activeUrl') throw failure; return 'url';
        };
        root.activeKey = () => {
          trace.push('activeKey'); if (scenario === 'activeKey') throw failure; return 'key';
        };
        root.initClient = () => {
          trace.push('initClient');
          if (scenario === 'initClient') throw failure;
          return !['offlineSnapshot', 'finalRender'].includes(scenario);
        };
        root.saveCfg = () => {
          trace.push('saveCfg'); if (scenario === 'saveCfg') throw failure;
        };
        root.setStatus = (text: string) => {
          trace.push(`status:${text}`);
          if (scenario === 'connectingStatus' && text === 'Connecting…') throw failure;
        };
        root.showGate = (visible: boolean) => {
          trace.push(`showGate:${visible}`);
          if (scenario === 'testShowGate' ||
              (scenario === 'recoveryShowGate' && visible)) throw failure;
        };
        root.snapshot = () => {
          trace.push('snapshot'); if (scenario === 'offlineSnapshot') throw failure; return {};
        };
        root.renderAccount = () => trace.push('renderAccount');
        root.renderAll = () => {
          trace.push('renderAll'); if (scenario === 'finalRender') throw failure;
        };
        root.handleAuth = async () => trace.push('handleAuth');
        root.cloud = {
          client: {
            auth: {
              getSession: () => scenario === 'recoveryShowGate'
                ? Promise.reject({ original: true })
                : Promise.resolve({ data: { session: null } }),
            },
          },
        };
        let caught: unknown;
        try { await root.boot(); } catch (error) { caught = error; }
        results.push({
          scenario,
          rejected: caught !== undefined,
          sameFailure: caught === failure,
          trace,
        });
      }
      return results;
    } finally {
      Object.entries(originals).forEach(([name, value]) => { root[name] = value; });
      Object.defineProperty(root, 'TEST_MODE', testDescriptor);
      root.cloud = originalCloud;
    }
  });
  expect(manual.map((entry: any) => entry.scenario)).toEqual([
    'renderGate', 'TEST_MODE', 'activeUrl', 'activeKey', 'initClient',
    'saveCfg', 'connectingStatus', 'testShowGate', 'offlineSnapshot',
    'recoveryShowGate', 'finalRender',
  ]);
  manual.forEach((entry: any) => {
    expect(entry.rejected, entry.scenario).toBe(true);
    expect(entry.sameFailure, entry.scenario).toBe(true);
  });
  expect(manual[0].trace).toEqual(['renderGate']);
  expect(manual[1].trace).toEqual(['renderGate', 'TEST_MODE']);
  expect(manual.at(-1).trace.at(-1)).toBe('renderAll');

  const autoPage = await context.newPage();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  autoPage.on('pageerror', (error) => pageErrors.push(error.message));
  autoPage.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await installStorageAndFetchGuards(autoPage);
  await autoPage.addInitScript(() => {
    const root = window as typeof window & Record<string, any>;
    root.__bootstrapRejectedStart = { calls: 0, caught: false, ready: false };
    Object.defineProperty(window, 'MatchaLunaApp', {
      configurable: true,
      enumerable: true,
      get: () => undefined,
      set: (facade: any) => {
        Object.defineProperty(window, 'MatchaLunaApp', {
          configurable: true, enumerable: true, value: facade, writable: true,
        });
        const register = facade.registerModule;
        facade.registerModule = function (
          domain: string,
          descriptors: Record<string, PropertyDescriptor>,
        ) {
          if (domain === 'bootstrap') {
            const descriptor = descriptors.boot;
            const original = descriptor.value;
            descriptors = {
              ...descriptors,
              boot: {
                ...descriptor,
                value: function (this: unknown, ...args: unknown[]) {
                  root.__bootstrapRejectedStart.calls += 1;
                  root.renderGate = () => { throw { automatic: true }; };
                  const promise = Reflect.apply(original, this, args);
                  Promise.resolve(promise).catch(() => {
                    root.__bootstrapRejectedStart.caught = true;
                  });
                  return promise;
                },
              },
            };
          }
          return Reflect.apply(register, this, [domain, descriptors]);
        };
      },
    });
  });
  await installNetworkGuards(autoPage);
  await autoPage.goto('index.html?test=1&rejected-start=1', { waitUntil: 'load' });
  await autoPage.evaluate(async () => {
    await window.MatchaLunaApp.ready;
    (window as typeof window & Record<string, any>).__bootstrapRejectedStart.ready = true;
  });
  await expect.poll(() => autoPage.evaluate(() =>
    (window as typeof window & Record<string, any>).__bootstrapRejectedStart.caught,
  )).toBe(true);
  expect(await autoPage.evaluate(() =>
    (window as typeof window & Record<string, any>).__bootstrapRejectedStart,
  )).toEqual({ calls: 1, caught: true, ready: true });
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  await autoPage.close();
});

test('typed Bootstrap keeps repeated and overlapping calls independent, live, and naturally interleaved', async ({ page }) => {
  await openTestPage(page);
  const result = await page.evaluate(async () => {
    const root = window as typeof window & Record<string, any>;
    const names = [
      'renderGate', 'activeUrl', 'activeKey', 'initClient', 'saveCfg',
      'setStatus', 'handleAuth', 'renderAll',
    ];
    const originals = Object.fromEntries(names.map((name) => [name, root[name]]));
    const testDescriptor = Object.getOwnPropertyDescriptor(root, 'TEST_MODE')!;
    const originalCloud = root.cloud;
    const trace: any[] = [];
    const releases: Array<(value: unknown) => void> = [];
    const settled: string[] = [];
    try {
      Object.defineProperty(root, 'TEST_MODE', {
        configurable: true, enumerable: true, value: false, writable: true,
      });
      let call = 0;
      root.renderGate = () => trace.push(['renderGate', ++call]);
      root.activeUrl = () => 'url';
      root.activeKey = () => 'key';
      root.initClient = () => true;
      root.saveCfg = () => trace.push(['saveCfg']);
      root.setStatus = (text: string) => trace.push(['status', text]);
      const auth: any = {
        getSession() {
          const index = releases.length;
          trace.push(['getSession', index, this === auth]);
          return new Promise((resolve) => releases.push(resolve));
        },
      };
      root.cloud = { client: { auth } };
      root.handleAuth = () => { throw new Error('Captured initial handleAuth'); };
      root.renderAll = () => { throw new Error('Captured initial renderAll'); };

      const first = root.boot.call({ ignored: 1 }, 'first-argument');
      const second = root.boot.call({ ignored: 2 }, 'second-argument');
      first.then(() => settled.push('first'));
      second.then(() => settled.push('second'));
      const distinctPromises = first !== second;

      root.handleAuth = async (session: any) => trace.push(['handleAuth-second', session.order]);
      root.renderAll = () => trace.push(['renderAll-second']);
      releases[1]({ data: { session: { order: 2 } } });
      await second;
      const settledAfterSecond = [...settled];

      root.handleAuth = async (session: any) => trace.push(['handleAuth-first', session.order]);
      root.renderAll = () => trace.push(['renderAll-first']);
      releases[0]({ data: { session: { order: 1 } } });
      await first;
      await Promise.resolve();
      return { distinctPromises, settledAfterSecond, settled, trace };
    } finally {
      Object.entries(originals).forEach(([name, value]) => { root[name] = value; });
      Object.defineProperty(root, 'TEST_MODE', testDescriptor);
      root.cloud = originalCloud;
    }
  });
  expect(result.distinctPromises).toBe(true);
  expect(result.settledAfterSecond).toEqual(['second']);
  expect(result.settled).toEqual(['second', 'first']);
  expect(result.trace.filter((entry: any[]) => entry[0] === 'saveCfg')).toHaveLength(2);
  expect(result.trace.filter((entry: any[]) => entry[0] === 'getSession')).toEqual([
    ['getSession', 0, true],
    ['getSession', 1, true],
  ]);
  expect(result.trace).toContainEqual(['handleAuth-second', 2]);
  expect(result.trace).toContainEqual(['renderAll-second']);
  expect(result.trace).toContainEqual(['handleAuth-first', 1]);
  expect(result.trace.at(-1)).toEqual(['renderAll-first']);
});
