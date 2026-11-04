import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  phase4lDomainOrder,
  startBlob,
  startCanonicalSha256,
  transitionRuntimeFiles,
} from './bootstrap-contract';

const localTestOrigin = 'http://127.0.0.1:4173';
const exactSupabaseSdk = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
const disabledSupabaseScript = `
  window.__startSdk = { installed: true, createCalls: 0 };
  window.supabase = { createClient() {
    window.__startSdk.createCalls += 1;
    throw new Error('Unexpected Supabase client creation in Start fixture');
  } };
`;

function canonicalLf(input: Buffer): Buffer {
  return Buffer.from(input.toString('utf8').replace(/\r\n?/g, '\n'), 'utf8');
}

function gitBlobId(input: Buffer): string {
  const header = Buffer.from(`blob ${input.length}\0`, 'utf8');
  return createHash('sha1').update(header).update(input).digest('hex');
}

async function containNetwork(page: Page): Promise<string[]> {
  const escaped: string[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.href === exactSupabaseSdk) {
      await route.fulfill({
        contentType: 'application/javascript',
        body: disabledSupabaseScript,
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

async function installBoundaryProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const root = window as typeof window & Record<string, any>;
    root.__startBoundary = {
      trace: [] as string[],
      getterReads: 0,
      calls: 0,
      finalizedAtCall: false,
      args: -1,
      strictUndefined: false,
    };
    Object.defineProperty(root, 'MatchaLunaApp', {
      configurable: true,
      enumerable: true,
      get: () => undefined,
      set: (facade: any) => {
        Object.defineProperty(root, 'MatchaLunaApp', {
          configurable: true,
          enumerable: true,
          value: facade,
          writable: true,
        });
        const registerModule = facade.registerModule;
        facade.registerModule = function (
          domain: string,
          descriptors: Record<string, PropertyDescriptor>,
        ) {
          if (domain === 'bootstrap') root.__startBoundary.trace.push('register:bootstrap');
          return Reflect.apply(registerModule, this, [domain, descriptors]);
        };
        const bindClassic = facade.bindClassic;
        facade.bindClassic = function (domain: string, names: readonly string[]) {
          if (domain === 'legacy') root.__startBoundary.trace.push('bind:legacy');
          return Reflect.apply(bindClassic, this, [domain, names]);
        };
        const finalize = facade.finalize;
        facade.finalize = function () {
          const result = Reflect.apply(finalize, this, []);
          const probe = root.__startBoundary;
          probe.trace.push('finalize');
          const originalBoot = Reflect.get(root, 'boot');
          const replacement = Function(
            'root',
            'originalBoot',
            `return function () {
              "use strict";
              const probe = root.__startBoundary;
              probe.trace.push('start');
              probe.calls += 1;
              probe.finalizedAtCall = root.MatchaLunaApp.finalized === true;
              probe.args = arguments.length;
              probe.strictUndefined = this === undefined;
              return Reflect.apply(originalBoot, undefined, []);
            };`,
          )(root, originalBoot);
          Object.defineProperty(root, 'boot', {
            configurable: true,
            enumerable: true,
            get() {
              probe.getterReads += 1;
              return replacement;
            },
          });
          return result;
        };
      },
    });
  });
}

async function runTransitionProbe(context: BrowserContext): Promise<any> {
  const builtHtml = readFileSync(resolve(process.cwd(), 'dist/index.html'), 'utf8');
  const scripts = transitionRuntimeFiles.map((fileName) => {
    const wrap = fileName === 'start.js'
      ? `<script>
          window.__transitionStart = { calls: 0, finalized: false };
          const originalBoot = window.boot;
          window.boot = function () {
            window.__transitionStart.calls += 1;
            window.__transitionStart.finalized = window.MatchaLunaApp.finalized === true;
            return Reflect.apply(originalBoot, undefined, []);
          };
        </script>`
      : '';
    return `${wrap}<script data-transition-runtime="${fileName}" src="/Scoopies/assets/js/${fileName}?v=phase4m-transition"></script>`;
  }).join('\n');
  const html = builtHtml
    .replace(/\s*<script type="module"[^>]*><\/script>/, '')
    .replace('</body>', `${scripts}\n</body>`);
  const page = await context.newPage();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const escaped = await containNetwork(page);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.route('**/index.html?test=1&start-transition=1', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.goto('index.html?test=1&start-transition=1', { waitUntil: 'load' });
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
  const result = await page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    return {
      probe: root.__transitionStart,
      contractCount: root.MatchaLunaApp.contractNames.length,
      finalized: root.MatchaLunaApp.finalized,
      scripts: Array.from(
        document.querySelectorAll<HTMLScriptElement>('script[data-transition-runtime]'),
        (script) => script.dataset.transitionRuntime,
      ),
    };
  });
  await page.close();
  return { result, escaped, pageErrors, consoleErrors };
}

async function runCachedPhase4LProbe(context: BrowserContext): Promise<any> {
  const builtHtml = readFileSync(resolve(process.cwd(), 'dist/index.html'), 'utf8');
  const html = builtHtml
    .replace(/\s*<script type="module"[^>]*><\/script>/, '')
    .replace(
      '</body>',
      '<script type="module" src="/Scoopies/phase4l-cached-entry.js"></script></body>',
    );
  const page = await context.newPage();
  const requests: string[] = [];
  const applicationModules: string[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const escaped = await containNetwork(page);
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/assets/js/start.js')) requests.push(`${url.pathname}?${url.searchParams}`);
    if (/\/Scoopies\/assets\/index-[A-Za-z0-9_-]+\.js$/.test(url.pathname)) {
      applicationModules.push(url.pathname);
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.route('**/index.html?test=1&phase4l-cached=1', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.route('**/phase4l-cached-entry.js', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `
        const root = window;
        root.__phase4lCached = { calls: 0 };
        root.MatchaLunaApp = { finalized: true, domains: { bootstrap: {} } };
        root.boot = function () { root.__phase4lCached.calls += 1; };
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = '/Scoopies/assets/js/start.js?v=phase4l-cached';
          script.dataset.cachedPhase4lRuntime = 'start.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error('cached Phase 4L Start failed'));
          document.body.append(script);
        });
      `,
    });
  });
  await page.goto('index.html?test=1&phase4l-cached=1', { waitUntil: 'load' });
  const result = await page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    return {
      probe: root.__phase4lCached,
      scripts: Array.from(
        document.querySelectorAll<HTMLScriptElement>('script[data-cached-phase4l-runtime]'),
        (script) => script.dataset.cachedPhase4lRuntime,
      ),
    };
  });
  await page.close();
  return { result, requests, applicationModules, escaped, pageErrors, consoleErrors };
}

test('typed Start preserves its exact private boundary, finalization slot, empty runtime, cached clients, and frozen fallback', async ({ page, context, request }) => {
  const runtimeRequests: string[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  await installBoundaryProbe(page);
  const escaped = await containNetwork(page);
  page.on('request', (entry) => {
    const url = new URL(entry.url());
    if (url.pathname.startsWith('/Scoopies/assets/js/')) runtimeRequests.push(url.pathname.split('/').pop() || '');
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto('index.html?test=1&typed-start-boundary=1', { waitUntil: 'load' });
  await page.evaluate(() => window.MatchaLunaApp.ready);
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
  const fresh = await page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    const resources = performance.getEntriesByType('resource').map((entry) => entry.name);
    return {
      probe: root.__startBoundary,
      contractVersion: root.MatchaLunaApp.contractVersion,
      contractCount: root.MatchaLunaApp.contractNames.length,
      domains: Object.keys(root.MatchaLunaApp.domains),
      hasStartDomain: Object.prototype.hasOwnProperty.call(root.MatchaLunaApp.domains, 'start'),
      hasStartGlobal: Object.prototype.hasOwnProperty.call(root, 'start'),
      runtime: Array.from(
        document.querySelectorAll<HTMLScriptElement>('script[data-matcha-luna-runtime]'),
        (script) => script.dataset.matchaLunaRuntime,
      ),
      forbiddenResources: resources.filter((name) => /\/assets\/js\/(?:state|boot|start)\.js(?:[?#]|$)/.test(name)),
    };
  });

  expect(fresh.probe).toEqual({
    trace: ['register:bootstrap', 'bind:legacy', 'finalize', 'start'],
    getterReads: 1,
    calls: 1,
    finalizedAtCall: true,
    args: 0,
    strictUndefined: true,
  });
  expect(fresh).toMatchObject({
    contractVersion: 1,
    contractCount: 175,
    domains: phase4lDomainOrder,
    hasStartDomain: false,
    hasStartGlobal: false,
    runtime: [],
    forbiddenResources: [],
  });
  expect(runtimeRequests).toEqual([]);
  expect(escaped).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);

  const transition = await runTransitionProbe(context);
  expect(transition.result).toEqual({
    probe: { calls: 1, finalized: true },
    contractCount: 175,
    finalized: true,
    scripts: transitionRuntimeFiles,
  });
  expect(transition.escaped).toEqual([]);
  expect(transition.pageErrors).toEqual([]);
  expect(transition.consoleErrors).toEqual([]);

  const cached = await runCachedPhase4LProbe(context);
  expect(cached.result).toEqual({
    probe: { calls: 1 },
    scripts: ['start.js'],
  });
  expect(cached.requests).toEqual(['/Scoopies/assets/js/start.js?v=phase4l-cached']);
  expect(cached.applicationModules, 'cached Phase 4L must not load the typed application entry').toEqual([]);
  expect(cached.escaped).toEqual([]);
  expect(cached.pageErrors).toEqual([]);
  expect(cached.consoleErrors).toEqual([]);

  const source = readFileSync(resolve(process.cwd(), 'assets/js/start.js'));
  const unversioned = await request.get('/Scoopies/assets/js/start.js');
  const priorVersion = await request.get('/Scoopies/assets/js/start.js?v=phase4l-cached');
  expect(unversioned.status()).toBe(200);
  expect(priorVersion.status()).toBe(200);
  const unversionedBytes = Buffer.from(await unversioned.body());
  const priorVersionBytes = Buffer.from(await priorVersion.body());
  expect(unversionedBytes).toEqual(source);
  expect(priorVersionBytes).toEqual(source);
  expect(gitBlobId(canonicalLf(source))).toBe(startBlob);
  expect(createHash('sha256').update(canonicalLf(source)).digest('hex')).toBe(startCanonicalSha256);
});

type StartMode = 'strict' | 'sloppy';

async function runTypedSemantics(context: BrowserContext, mode: StartMode): Promise<any> {
  const page = await context.newPage();
  await page.addInitScript((selectedMode) => {
    const root = window as typeof window & Record<string, any>;
    root.__startSemantics = { trace: [] as string[], getterReads: 0, calls: 0, args: -1, receiver: '', thenReads: 0 };
    Object.defineProperty(root, 'MatchaLunaApp', {
      configurable: true,
      set: (facade: any) => {
        Object.defineProperty(root, 'MatchaLunaApp', { configurable: true, value: facade, writable: true });
        const finalize = facade.finalize;
        facade.finalize = function () {
          const result = Reflect.apply(finalize, this, []);
          const probe = root.__startSemantics;
          const originalBoot = Reflect.get(root, 'boot');
          const body = selectedMode === 'strict'
            ? `return function () { "use strict"; probe.trace.push('call'); probe.calls += 1; probe.args = arguments.length; probe.receiver = this === undefined ? 'undefined' : 'other'; Reflect.apply(originalBoot, undefined, []); return returned; };`
            : `return function () { probe.trace.push('call'); probe.calls += 1; probe.args = arguments.length; probe.receiver = this === root ? 'window' : 'other'; Reflect.apply(originalBoot, undefined, []); return returned; };`;
          const returned = {};
          Object.defineProperty(returned, 'then', { get() { probe.thenReads += 1; throw new Error('Start must not inspect then'); } });
          const replacement = Function('root', 'probe', 'originalBoot', 'returned', body)(root, probe, originalBoot, returned);
          Object.defineProperty(root, 'boot', {
            configurable: true,
            enumerable: true,
            get() { probe.trace.push('get'); probe.getterReads += 1; return replacement; },
          });
          return result;
        };
      },
    });
  }, mode);
  const escaped = await containNetwork(page);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`index.html?test=1&start-semantics=${mode}`, { waitUntil: 'load' });
  await page.evaluate(() => window.MatchaLunaApp.ready);
  const result = await page.evaluate(() => (window as typeof window & Record<string, any>).__startSemantics);
  await page.close();
  return { result, escaped, pageErrors };
}

async function runClassicSemantics(context: BrowserContext, mode: StartMode): Promise<any> {
  const page = await context.newPage();
  await page.addInitScript((selectedMode) => {
    const root = window as typeof window & Record<string, any>;
    const probe = root.__classicStartSemantics = { trace: [] as string[], getterReads: 0, calls: 0, args: -1, receiver: '', thenReads: 0 };
    const returned = {};
    Object.defineProperty(returned, 'then', { get() { probe.thenReads += 1; throw new Error('Classic Start must not inspect then'); } });
    const body = selectedMode === 'strict'
      ? `return function () { "use strict"; probe.trace.push('call'); probe.calls += 1; probe.args = arguments.length; probe.receiver = this === undefined ? 'undefined' : 'other'; return returned; };`
      : `return function () { probe.trace.push('call'); probe.calls += 1; probe.args = arguments.length; probe.receiver = this === root ? 'window' : 'other'; return returned; };`;
    const replacement = Function('root', 'probe', 'returned', body)(root, probe, returned);
    Object.defineProperty(root, 'boot', {
      configurable: true,
      get() { probe.trace.push('get'); probe.getterReads += 1; return replacement; },
    });
  }, mode);
  const escaped = await containNetwork(page);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route(`**/classic-start-${mode}.html`, async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><script src="/Scoopies/assets/js/start.js?v=classic-oracle"></script>',
    });
  });
  await page.goto(`classic-start-${mode}.html`, { waitUntil: 'load' });
  const result = await page.evaluate(() => (window as typeof window & Record<string, any>).__classicStartSemantics);
  await page.close();
  return { result, escaped, pageErrors };
}

test('typed Start matches classic live lookup, bare-call receiver, zero-argument, and ignored-result semantics', async ({ context }) => {
  for (const mode of ['strict', 'sloppy'] as const) {
    const typed = await runTypedSemantics(context, mode);
    const classic = await runClassicSemantics(context, mode);
    const expected = {
      trace: ['get', 'call'],
      getterReads: 1,
      calls: 1,
      args: 0,
      receiver: mode === 'strict' ? 'undefined' : 'window',
      thenReads: 0,
    };
    expect(typed.result).toEqual(expected);
    expect(classic.result).toEqual(expected);
    expect(typed.escaped).toEqual([]);
    expect(classic.escaped).toEqual([]);
    expect(typed.pageErrors).toEqual([]);
    expect(classic.pageErrors).toEqual([]);
  }
});

type FailureCase = 'pending' | 'rejected' | 'getter-throw' | 'call-throw' | 'non-callable';

async function runTypedFailure(context: BrowserContext, failure: FailureCase): Promise<any> {
  const page = await context.newPage();
  await page.addInitScript((selectedFailure) => {
    const root = window as typeof window & Record<string, any>;
    const probe = root.__startFailure = {
      trace: [] as string[],
      errors: [] as string[],
      errorTypes: [] as string[],
      rejections: [] as string[],
      calls: 0,
    };
    addEventListener('error', (event) => {
      probe.trace.push('error');
      probe.errors.push(String(event.message || 'Error'));
      probe.errorTypes.push(String(event.error?.name || 'Error'));
      event.preventDefault();
    });
    addEventListener('unhandledrejection', (event) => {
      probe.trace.push('unhandledrejection');
      probe.rejections.push(String(event.reason?.message || event.reason));
      event.preventDefault();
    });
    Object.defineProperty(root, 'MatchaLunaApp', {
      configurable: true,
      set: (facade: any) => {
        Object.defineProperty(root, 'MatchaLunaApp', { configurable: true, value: facade, writable: true });
        const finalize = facade.finalize;
        facade.finalize = function () {
          const result = Reflect.apply(finalize, this, []);
          const originalBoot = Reflect.get(root, 'boot');
          if (selectedFailure === 'getter-throw') {
            Object.defineProperty(root, 'boot', { configurable: true, get() { probe.trace.push('get'); throw new Error('start-getter-sentinel'); } });
          } else if (selectedFailure === 'non-callable') {
            Object.defineProperty(root, 'boot', { configurable: true, get() { probe.trace.push('get'); return 17; } });
          } else {
            const replacement = function (this: unknown) {
              'use strict';
              probe.trace.push('call');
              probe.calls += 1;
              if (selectedFailure === 'call-throw') throw new Error('start-call-sentinel');
              Reflect.apply(originalBoot, undefined, []);
              if (selectedFailure === 'pending') return new Promise(() => {});
              return Promise.reject(new Error('start-rejected-sentinel'));
            };
            Object.defineProperty(root, 'boot', { configurable: true, get() { probe.trace.push('get'); return replacement; } });
          }
          return result;
        };
      },
    });
  }, failure);
  const escaped = await containNetwork(page);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto(`index.html?test=1&start-failure=${failure}`, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await window.MatchaLunaApp.ready;
    (window as typeof window & Record<string, any>).__startFailure.trace.push('ready');
  });
  if (failure !== 'pending') {
    await expect.poll(() => page.evaluate(() => {
      const probe = (window as typeof window & Record<string, any>).__startFailure;
      return probe.errors.length + probe.rejections.length;
    })).toBe(1);
  }
  const result = await page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    return {
      probe: root.__startFailure,
      finalized: root.MatchaLunaApp.finalized,
      status: document.getElementById('syncStatus')?.textContent,
    };
  });
  await page.close();
  return { result, escaped, pageErrors, consoleErrors };
}

async function runClassicFailure(context: BrowserContext, failure: 'getter-throw' | 'call-throw' | 'non-callable'): Promise<any> {
  const page = await context.newPage();
  await page.addInitScript((selectedFailure) => {
    const root = window as typeof window & Record<string, any>;
    const probe = root.__classicStartFailure = {
      trace: [] as string[], errors: [] as string[], errorTypes: [] as string[],
    };
    addEventListener('error', (event) => {
      probe.trace.push('error');
      probe.errors.push(String(event.message || 'Error'));
      probe.errorTypes.push(String(event.error?.name || 'Error'));
      event.preventDefault();
    });
    if (selectedFailure === 'getter-throw') {
      Object.defineProperty(root, 'boot', { configurable: true, get() { probe.trace.push('get'); throw new Error('start-getter-sentinel'); } });
    } else if (selectedFailure === 'non-callable') {
      Object.defineProperty(root, 'boot', { configurable: true, get() { probe.trace.push('get'); return 17; } });
    } else {
      Object.defineProperty(root, 'boot', { configurable: true, get() { probe.trace.push('get'); return function () { probe.trace.push('call'); throw new Error('start-call-sentinel'); }; } });
    }
  }, failure);
  const escaped = await containNetwork(page);
  await page.route(`**/classic-start-failure-${failure}.html`, async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><script src="/Scoopies/assets/js/start.js?v=classic-error" onload="window.__classicStartFailure.trace.push('load')"></script>`,
    });
  });
  await page.goto(`classic-start-failure-${failure}.html`, { waitUntil: 'load' });
  const result = await page.evaluate(() => (window as typeof window & Record<string, any>).__classicStartFailure);
  await page.close();
  return { result, escaped };
}

test('typed Start preserves classic synchronous-error reporting and asynchronous readiness independence', async ({ context }) => {
  const pending = await runTypedFailure(context, 'pending');
  expect(pending.result.probe).toEqual({
    trace: ['get', 'call', 'ready'], errors: [], errorTypes: [], rejections: [], calls: 1,
  });
  expect(pending.result.finalized).toBe(true);
  expect(pending.result.status).toBe('Test mode');

  const rejected = await runTypedFailure(context, 'rejected');
  expect(rejected.result.probe.trace.slice(0, 2)).toEqual(['get', 'call']);
  expect(rejected.result.probe.trace.slice(2).sort()).toEqual(['ready', 'unhandledrejection']);
  expect(rejected.result.probe.errors).toEqual([]);
  expect(rejected.result.probe.errorTypes).toEqual([]);
  expect(rejected.result.probe.rejections).toEqual(['start-rejected-sentinel']);
  expect(rejected.result.probe.calls).toBe(1);
  expect(rejected.result.finalized).toBe(true);
  expect(rejected.result.status).not.toBe('App failed to start');

  for (const failure of ['getter-throw', 'call-throw', 'non-callable'] as const) {
    const typed = await runTypedFailure(context, failure);
    const classic = await runClassicFailure(context, failure);
    const prefix = failure === 'call-throw' ? ['get', 'call', 'error'] : ['get', 'error'];
    expect(typed.result.probe.trace.slice(0, prefix.length)).toEqual(prefix);
    expect(typed.result.probe.trace.at(-1)).toBe('ready');
    expect(typed.result.probe.errors).toHaveLength(1);
    expect(typed.result.probe.rejections).toEqual([]);
    expect(typed.result.finalized).toBe(true);
    expect(typed.result.status).not.toBe('App failed to start');
    expect(classic.result.trace).toEqual([...prefix, 'load']);
    expect(classic.result.errors).toHaveLength(1);
    if (failure === 'non-callable') {
      expect(typed.result.probe.errorTypes).toEqual(['TypeError']);
      expect(classic.result.errorTypes).toEqual(['TypeError']);
    } else {
      const sentinel = failure === 'getter-throw' ? 'start-getter-sentinel' : 'start-call-sentinel';
      expect(typed.result.probe.errorTypes).toEqual(['Error']);
      expect(classic.result.errorTypes).toEqual(['Error']);
      expect(typed.result.probe.errors[0]).toContain(sentinel);
      expect(classic.result.errors[0]).toContain(sentinel);
    }
    expect(typed.escaped).toEqual([]);
    expect(classic.escaped).toEqual([]);
    expect(typed.pageErrors).toEqual([]);
    expect(typed.consoleErrors).toEqual([]);
  }
  expect(pending.escaped).toEqual([]);
  expect(rejected.escaped).toEqual([]);
  expect(pending.pageErrors).toEqual([]);
  expect(rejected.pageErrors).toEqual([]);
  expect(pending.consoleErrors).toEqual([]);
  expect(rejected.consoleErrors).toEqual([]);
});
