import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workspaceNames = [
  'posRequestIsCurrent', 'costingRequestIsCurrent',
  'loadPosPublicationStatus', 'loadPosContext', 'posRpcErrorText',
  'posHandleAccessDenied', 'loadPosCheckoutData', 'refreshPosSilently',
  'refreshPosAfterMutation', 'refreshPosCatalogOnly', 'openPosRegister',
  'posCheckoutValidation', 'buildPosPendingSale', 'posDeterministicError',
  'posCheckoutErrorText', 'reviewPosSale', 'cancelPosConfirmation',
  'submitPosSale',
] as const;

const protectedWorkspaceNames = [
  'loadPosPublicationStatus', 'loadPosContext', 'loadPosCheckoutData',
  'refreshPosSilently', 'refreshPosCatalogOnly', 'posCheckoutValidation',
  'buildPosPendingSale', 'posDeterministicError', 'posCheckoutErrorText',
  'reviewPosSale', 'submitPosSale',
] as const;

const activeRuntimeFiles = [] as const;

const transitionRuntimeFiles = [
  'core.js', 'runtime-factories.js', 'state.js', 'costing.js',
  'pos-catalog.js', 'stocks.js', 'workspace-sync.js', 'pos-operations.js',
  'publication.js', 'render-costing.js', 'render-modals.js',
  'render-pos.js', 'render-stocks.js', 'support.js', 'events.js',
  'boot.js', 'compatibility.js', 'start.js',
] as const;

async function stubSupabase(page: Page): Promise<void> {
  await page.route(
    /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/,
    async (route) => route.fulfill({
      contentType: 'application/javascript',
      body: 'window.supabase={createClient:function(){throw new Error("Supabase is disabled in browser tests");}};',
    }),
  );
}

async function installHarness(page: Page): Promise<void> {
  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const h: Record<string, any> = {};
    h.freshCheckout = () => {
      const value = app.freshPosCheckout();
      value.catalog = [];
      value.cart = {};
      value.paymentMethod = 'cash';
      value.cashReceived = '200';
      value.referenceNumber = '';
      return value;
    };
    h.line = (overrides: Record<string, unknown> = {}) => Object.assign({
      key: 'product-1|version-1|standard|standard',
      productId: 'product-1', productVersionId: 'version-1',
      name: 'Matcha Latte', size: '12oz', basePriceCentavos: 17_000,
      priceCentavos: 17_000, quantity: 1, matchaOptionId: '',
      matchaOptionRevision: null, matchaOptionCode: '', matchaOptionName: '',
      matchaSurchargeCentavos: 0, stale: false, latest: null,
    }, overrides);
    h.reset = () => {
      h.trace = [];
      h.rpc = [];
      h.saved = [];
      h.cleared = 0;
      app.session = { user: { id: 'workspace-user', email: 'owner@example.test' } };
      app.currentUserId = 'workspace-user';
      app.cloud = { connected: true, url: 'https://workspace.example.test', client: null };
      app.posContext = {
        loaded: true, loading: false, businessId: 'business-1',
        businessName: 'Matcha Luna', role: 'owner', publications: {}, error: '',
      };
      app.posCheckout = h.freshCheckout();
      app.posSalesHistory = app.freshPosSalesHistory();
      app.posOpsModal = app.freshPosOpsModal();
      app.posLoadGeneration = 10;
      app.costingLoadGeneration = 20;
      app.posStatusGeneration = 30;
      app.posCheckoutLoadGeneration = 40;
      app.posCatalogGeneration = 50;
      app.posCheckoutSubmitGeneration = 60;
      app.posLastSilentRefreshAttemptAt = 0;
      app.posSilentRefreshPromise = null;
      app.POS_SILENT_REFRESH_MIN_AGE_MS = 30_000;
      document.body.classList.remove('pos-training', 'pos-reports-loading');
    };
    app.__phase4iWorkspaceHarness = h;
    h.reset();
  });
}

async function openPrimary(page: Page): Promise<void> {
  await stubSupabase(page);
  await page.goto('index.html?test=1', { waitUntil: 'load' });
  await page.evaluate(() =>
    (window as typeof window & { MatchaLunaApp: { ready: Promise<void> } })
      .MatchaLunaApp.ready,
  );
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
  await installHarness(page);
}

async function openClassic(context: BrowserContext): Promise<Page> {
  const builtHtml = readFileSync(resolve(process.cwd(), 'dist/index.html'), 'utf8');
  const scripts = transitionRuntimeFiles
    .map((file) => `<script src="/Scoopies/assets/js/${file}"></script>`)
    .join('\n');
  const html = builtHtml
    .replace(/\s*<script type="module"[^>]*><\/script>/, '')
    .replace('</body>', `${scripts}\n</body>`);
  const page = await context.newPage();
  await stubSupabase(page);
  await page.route('**/index.html?test=1&workspace-transition=1', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.goto('index.html?test=1&workspace-transition=1', { waitUntil: 'load' });
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
  await installHarness(page);
  return page;
}

async function openPair(
  page: Page,
  context: BrowserContext,
): Promise<[Page, Page]> {
  await openPrimary(page);
  const classic = await openClassic(context);
  return [page, classic];
}

test('typed Workspace boundary preserves API, registration, descriptors, runtime paths, and fallback', async ({ page, context }) => {
  await openPrimary(page);
  const contract = await page.evaluate((names) => {
    const root = window as typeof window & Record<string, any>;
    const facade = root.MatchaLunaApp;
    const workspace = facade.domains.workspace as Record<string, any>;
    const descriptor = (target: object, name: string) => {
      const value = Object.getOwnPropertyDescriptor(target, name)!;
      return {
        configurable: value.configurable, enumerable: value.enumerable,
        writable: value.writable, hasGetter: typeof value.get === 'function',
        hasSetter: typeof value.set === 'function',
      };
    };
    const originals = Object.fromEntries(names.map((name) => [name, workspace[name]]));
    const roundTrips = names.map((name, index) => {
      const viaDomain = function viaDomain() { return index; };
      workspace[name] = viaDomain;
      const domainReachedRoot = root[name] === viaDomain;
      const domainReachedLegacy = facade.domains.legacy[name] === viaDomain;
      const viaRoot = function viaRoot() { return index + 100; };
      root[name] = viaRoot;
      const rootReachedDomain = workspace[name] === viaRoot;
      const rootReachedLegacy = facade.domains.legacy[name] === viaRoot;
      workspace[name] = originals[name];
      return { domainReachedRoot, domainReachedLegacy, rootReachedDomain, rootReachedLegacy };
    });
    return {
      version: facade.contractVersion,
      contractLength: facade.contractNames.length,
      domainOrder: Object.keys(facade.domains),
      domainSizes: Object.fromEntries(Object.entries(facade.domains)
        .map(([name, domain]) => [name, Object.keys(domain as object).length])),
      workspaceOrder: Object.keys(workspace),
      protectedNames: names.filter((name) => facade.contractNames.includes(name)),
      rootMatches: names.map((name) => root[name] === workspace[name]),
      namespaceDescriptors: names.map((name) => descriptor(workspace, name)),
      rootDescriptors: names.map((name) => descriptor(root, name)),
      roundTrips,
      activeRuntime: Array.from(
        document.querySelectorAll<HTMLScriptElement>('script[data-matcha-luna-runtime]'),
        (script) => script.dataset.matchaLunaRuntime,
      ),
    };
  }, [...workspaceNames]);

  const classic = await openClassic(context);
  const classicRuntime = await classic.evaluate(() => ({
    modules: document.querySelectorAll('script[type="module"]').length,
    scripts: Array.from(
      document.querySelectorAll<HTMLScriptElement>('script[src*="/assets/js/"]'),
      (script) => new URL(script.src).pathname.split('/').pop(),
    ),
    hasWorkspaceDomain: Boolean(
      (window as typeof window & Record<string, any>).MatchaLunaApp?.domains?.workspace,
    ),
  }));
  await classic.close();

  const response = await page.request.get(
    'http://127.0.0.1:4173/Scoopies/assets/js/workspace-sync.js',
  );
  const served = (await response.text()).replace(/\r\n?/g, '\n');
  const source = readFileSync(resolve(process.cwd(), 'assets/js/workspace-sync.js'), 'utf8')
    .replace(/\r\n?/g, '\n');
  const bytes = Buffer.from(served, 'utf8');
  const sha256 = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  const gitBlob = createHash('sha1')
    .update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');
  const main = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8');
  const stocksSlot = main.indexOf('registerStocksModule(facade, window)');
  const workspaceSlot = main.indexOf('registerWorkspaceModule(facade, window)');
  const readySlot = main.indexOf('const ready');
  const operationsSlot = main.indexOf(
    'loadClassicScripts(AFTER_STOCKS_BEFORE_COSTING_VIEW)',
    readySlot,
  );

  expect(contract).toMatchObject({
    version: 1,
    contractLength: 175,
    domainOrder: [
      'core', 'runtime', 'state', 'costing', 'catalog', 'stocks', 'workspace', 'pos',
      'publication', 'modals', 'support', 'events', 'bootstrap', 'legacy',
    ],
    domainSizes: {
      core: 15, runtime: 4, state: 141, costing: 37, catalog: 81, stocks: 63,
      workspace: 18, publication: 10, modals: 46, pos: 79,
      support: 3, events: 1, bootstrap: 1,
    },
    workspaceOrder: workspaceNames,
    protectedNames: protectedWorkspaceNames,
    activeRuntime: activeRuntimeFiles,
  });
  expect(contract.rootMatches).toEqual(workspaceNames.map(() => true));
  expect(contract.namespaceDescriptors).toEqual(workspaceNames.map(() => ({
    configurable: true, enumerable: true, writable: true,
    hasGetter: false, hasSetter: false,
  })));
  expect(contract.rootDescriptors).toEqual(workspaceNames.map(() => ({
    configurable: true, enumerable: true, writable: undefined,
    hasGetter: true, hasSetter: true,
  })));
  expect(contract.roundTrips).toEqual(workspaceNames.map((name) => ({
    domainReachedRoot: true,
    domainReachedLegacy: (protectedWorkspaceNames as readonly string[]).includes(name),
    rootReachedDomain: true,
    rootReachedLegacy: (protectedWorkspaceNames as readonly string[]).includes(name),
  })));
  expect(classicRuntime).toEqual({
    modules: 0, scripts: transitionRuntimeFiles, hasWorkspaceDomain: false,
  });
  expect(response.status()).toBe(200);
  expect(served).toBe(source);
  expect(gitBlob).toBe('714fa588cb0c483414ee236afd2e7f2815f25eee');
  expect(sha256).toBe('7FEA61163419D78F1B3CD1C11B8BC6FE4E3E4FCB97B030566D6CF28BE23FAFA8');
  expect(workspaceSlot).toBeGreaterThan(stocksSlot);
  expect(operationsSlot).toBeGreaterThan(workspaceSlot);
});

async function collectRequestCurrency(page: Page) {
  return page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const api: any = app.MatchaLunaApp?.domains?.workspace || app;
    const h = app.__phase4iWorkspaceHarness;
    h.reset();
    const pos: unknown[] = [];
    pos.push(api.posRequestIsCurrent(10, 'workspace-user', 'business-1'));
    pos.push(api.posRequestIsCurrent(9, 'workspace-user', 'business-1'));
    app.session = null;
    pos.push(api.posRequestIsCurrent(10, 'workspace-user', 'business-1'));
    app.session = {};
    pos.push(api.posRequestIsCurrent(10, 'workspace-user', 'business-1'));
    app.session = { user: { id: 7 } };
    app.posContext.businessId = 9;
    pos.push(api.posRequestIsCurrent(10, 7, 9));
    pos.push(api.posRequestIsCurrent(10, '7', null));
    pos.push(api.posRequestIsCurrent(10, '7', undefined));
    pos.push(api.posRequestIsCurrent(10, '8', '9'));
    pos.push(api.posRequestIsCurrent(10, '7', '8'));
    let businessReads = 0;
    app.posContext = {
      get businessId() { businessReads += 1; throw new Error('business getter'); },
    };
    const shortCircuit = api.posRequestIsCurrent(9, '7', '9');
    let thrown = '';
    try { api.posRequestIsCurrent(10, '7', '9'); } catch (error) { thrown = String(error); }

    h.reset();
    const costing: unknown[] = [];
    costing.push(api.costingRequestIsCurrent(20, 'workspace-user'));
    costing.push(api.costingRequestIsCurrent(19, 'workspace-user'));
    app.session = null;
    costing.push(api.costingRequestIsCurrent(20, 'workspace-user'));
    app.session = { user: { id: 42 } };
    costing.push(api.costingRequestIsCurrent(20, '42'));
    costing.push(api.costingRequestIsCurrent(20, 42));
    costing.push(api.costingRequestIsCurrent(20, '41'));
    app.costingLoadGeneration = 21;
    costing.push(api.costingRequestIsCurrent(20, '42'));
    app.costingLoadGeneration = 20;
    costing.push(api.costingRequestIsCurrent(20, '42'));
    return { pos, shortCircuit, businessReads, thrown, costing };
  });
}

test('request currency preserves generation, identity, coercion, short-circuit, and repeated-call behavior', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectRequestCurrency(typedPage);
  const classic = await collectRequestCurrency(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed).toEqual({
    pos: [true, false, false, false, true, true, true, false, false],
    shortCircuit: false,
    businessReads: 1,
    thrown: 'Error: business getter',
    costing: [true, false, false, true, true, false, false, true],
  });
});

async function collectContextLoading(page: Page) {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const api: any = app.MatchaLunaApp?.domains?.workspace || app;
    const h = app.__phase4iWorkspaceHarness;
    const installRows = () => {
      app.rpcRows = (result: any) => {
        if (result?.throwRows) throw new Error('rpcRows failed');
        if (result?.error) throw result.error;
        return result?.data || [];
      };
    };

    const publicationGuards: Record<string, unknown> = {};
    for (const kind of ['client', 'session', 'user', 'business']) {
      h.reset();
      installRows();
      const retained = { retained: kind };
      app.posContext.publications = retained;
      app.cloud.client = {
        rpc: async (name: string, args: unknown) => {
          h.rpc.push([name, args]);
          return { data: [{ source_costing_product_id: 'must-not-load' }] };
        },
      };
      if (kind === 'client') app.cloud.client = null;
      if (kind === 'session') app.session = null;
      if (kind === 'user') app.session = {};
      if (kind === 'business') app.posContext.businessId = '';
      const statusGeneration = app.posStatusGeneration;
      publicationGuards[kind] = {
        ok: await api.loadPosPublicationStatus(),
        rpc: h.rpc.slice(),
        statusGeneration: app.posStatusGeneration,
        statusUnchanged: app.posStatusGeneration === statusGeneration,
        publicationsUnchanged: app.posContext.publications === retained,
      };
    }

    h.reset();
    installRows();
    app.posStatusGeneration = '30';
    app.cloud.client = {
      rpc: async (name: string, args: unknown) => {
        h.rpc.push([name, args]);
        return { data: [
          { source_costing_product_id: 'a', revision: 1 },
          null,
          { source_costing_product_id: '', revision: 9 },
          { source_costing_product_id: 'a', revision: 2 },
          { source_costing_product_id: 7, revision: 3 },
        ] };
      },
    };
    const publication = await api.loadPosPublicationStatus(null);
    const publicationState = {
      ok: publication,
      statusGeneration: app.posStatusGeneration,
      rpc: h.rpc,
      publications: app.posContext.publications,
    };

    h.reset();
    installRows();
    const originalPublications = { keep: true };
    app.posContext.publications = originalPublications;
    app.cloud.client = {
      rpc: async () => {
        app.posLoadGeneration += 1;
        return { data: [{ source_costing_product_id: 'late' }] };
      },
    };
    const stalePublication = await api.loadPosPublicationStatus(10);
    const staleState = {
      ok: stalePublication,
      unchanged: app.posContext.publications === originalPublications,
    };

    const publicationDrift: Record<string, unknown> = {};
    for (const kind of ['status', 'user', 'business']) {
      h.reset();
      installRows();
      const retained = { retained: kind };
      app.posContext.publications = retained;
      app.cloud.client = {
        rpc: async () => {
          if (kind === 'status') app.posStatusGeneration += 1;
          if (kind === 'user') app.session.user.id = 'changed-user';
          if (kind === 'business') app.posContext.businessId = 'changed-business';
          return { data: [{ source_costing_product_id: `late-${kind}` }] };
        },
      };
      const ok = await api.loadPosPublicationStatus(10);
      publicationDrift[kind] = {
        ok,
        unchanged: app.posContext.publications === retained,
      };
    }

    h.reset();
    installRows();
    const rejectedPublications = { retained: 'rpc-rejection' };
    app.posContext.publications = rejectedPublications;
    app.cloud.client = { rpc: async () => { throw new Error('publication offline'); } };
    let publicationRejection = '';
    try { await api.loadPosPublicationStatus(); }
    catch (error) { publicationRejection = String(error); }
    const publicationRejectionState = {
      error: publicationRejection,
      unchanged: app.posContext.publications === rejectedPublications,
    };

    h.reset();
    installRows();
    app.cloud.client = { rpc: async () => ({ throwRows: true }) };
    let rowFailure = '';
    try { await api.loadPosPublicationStatus(); } catch (error) { rowFailure = String(error); }

    const mappings = [
      api.posRpcErrorText({ code: 42501 }),
      api.posRpcErrorText({ code: '42501' }),
      api.posRpcErrorText({ code: 40001 }),
      api.posRpcErrorText(null),
    ];

    h.reset();
    app.setPosReportsLoading = (value: unknown) => h.trace.push(['reports', value]);
    app.posClearCatalogCache = () => h.trace.push(['clear-cache']);
    app.resetPosContext = (message: string) => h.trace.push(['reset', message]);
    app.renderProducts = () => h.trace.push(['products']);
    app.renderPos = () => h.trace.push(['pos']);
    const deniedOther = api.posHandleAccessDenied({ code: '40001' });
    const noEffectTrace = h.trace.slice();
    const denied = api.posHandleAccessDenied({ code: 42501 });
    const deniedTrace = h.trace.slice();

    const contextScenario = async (
      businesses: any,
      role = 'owner',
      publicationResult = true,
    ) => {
      h.reset();
      installRows();
      app.cloud.client = {
        rpc: async (name: string) => {
          h.trace.push(['rpc', name]);
          if (businesses instanceof Error) throw businesses;
          return { data: businesses };
        },
      };
      app.renderProducts = () => h.trace.push(['products']);
      app.renderPos = () => h.trace.push(['pos']);
      app.posFriendlyError = (error: unknown) => `friendly:${String(error)}`;
      app.posLoadGeneration = '10';
      app.loadPosPublicationStatus = async (generation: number) => {
        h.trace.push(['publication', generation]);
        return publicationResult;
      };
      if (Array.isArray(businesses) && businesses[0]) {
        businesses[0].member_role = role;
      }
      const ok = await api.loadPosContext();
      return {
        ok,
        context: JSON.parse(JSON.stringify(app.posContext)),
        loadGeneration: app.posLoadGeneration,
        statusGeneration: app.posStatusGeneration,
        trace: h.trace.slice(),
      };
    };

    h.reset();
    app.cloud.client = null;
    app.session = null;
    app.resetPosContext = (message: string) => {
      h.trace.push(['reset', message]);
      app.posContext = { loading: false, error: message };
    };
    app.renderProducts = () => h.trace.push(['products']);
    app.renderPos = () => h.trace.push(['pos']);
    const signedOut = await api.loadPosContext();
    const signedOutTrace = h.trace.slice();

    h.reset();
    app.posContext.loading = true;
    app.cloud.client = { rpc: () => { throw new Error('must not call'); } };
    const concurrent = await api.loadPosContext();

    const owner = await contextScenario([{
      business_id: 22, business_name: '', member_role: 'owner',
    }]);
    const manager = await contextScenario([{
      business_id: 'manager-business', business_name: 'Managed Cafe',
      member_role: 'manager',
    }], 'manager');
    const cashier = await contextScenario([{
      business_id: 'cashier-business', business_name: 'Cafe',
      member_role: 'cashier',
    }], 'cashier');
    const zero = await contextScenario([]);
    const multiple = await contextScenario([
      { business_id: 'a', business_name: 'A', member_role: 'owner' },
      { business_id: 'b', business_name: 'B', member_role: 'owner' },
    ]);
    const rejected = await contextScenario(new Error('offline'));

    h.reset();
    installRows();
    app.cloud.client = { rpc: async () => ({ data: [{
      business_id: 'partial', business_name: 'Partial', member_role: 'owner',
    }] }) };
    app.renderProducts = () => h.trace.push(['products']);
    app.renderPos = () => h.trace.push(['pos']);
    app.loadPosPublicationStatus = async () => {
      h.trace.push(['publication']);
      app.posLoadGeneration += 1;
      return false;
    };
    const staleContext = await api.loadPosContext();
    const staleContextState = {
      ok: staleContext,
      context: JSON.parse(JSON.stringify(app.posContext)),
      trace: h.trace.slice(),
    };

    h.reset();
    installRows();
    app.cloud.client = { rpc: async () => ({ data: [{
      business_id: 'finally', business_name: 'Finally', member_role: 'cashier',
    }] }) };
    let renderCount = 0;
    app.renderProducts = () => { h.trace.push(['products']); };
    app.renderPos = () => {
      renderCount += 1;
      h.trace.push(['pos', renderCount]);
      if (renderCount === 2) throw new Error('finally render failed');
    };
    let finallyFailure = '';
    try { await api.loadPosContext(); } catch (error) { finallyFailure = String(error); }
    const finallyState = {
      finallyFailure, loading: app.posContext.loading, trace: h.trace.slice(),
    };

    return {
      publicationGuards, publicationState, staleState, publicationDrift,
      publicationRejectionState, rowFailure, mappings,
      deniedOther, noEffectTrace, denied, deniedTrace,
      signedOut, signedOutTrace, concurrent, owner, manager, cashier, zero, multiple,
      rejected, staleContextState, finallyState,
    };
  });
}

test('publication, context, RPC errors, and access denial preserve guards, stale work, partial effects, and order', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectContextLoading(typedPage);
  const classic = await collectContextLoading(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed.publicationGuards).toEqual({
    client: {
      ok: false, rpc: [], statusGeneration: 30,
      statusUnchanged: true, publicationsUnchanged: true,
    },
    session: {
      ok: false, rpc: [], statusGeneration: 30,
      statusUnchanged: true, publicationsUnchanged: true,
    },
    user: {
      ok: false, rpc: [], statusGeneration: 30,
      statusUnchanged: true, publicationsUnchanged: true,
    },
    business: {
      ok: false, rpc: [], statusGeneration: 30,
      statusUnchanged: true, publicationsUnchanged: true,
    },
  });
  expect(typed.publicationState).toEqual({
    ok: true,
    statusGeneration: 31,
    rpc: [['pos_get_publication_status', { p_business_id: 'business-1' }]],
    publications: {
      '7': { source_costing_product_id: 7, revision: 3 },
      a: { source_costing_product_id: 'a', revision: 2 },
    },
  });
  expect(typed.staleState).toEqual({ ok: false, unchanged: true });
  expect(typed.publicationDrift).toEqual({
    status: { ok: false, unchanged: true },
    user: { ok: false, unchanged: true },
    business: { ok: false, unchanged: true },
  });
  expect(typed.publicationRejectionState).toEqual({
    error: 'Error: publication offline', unchanged: true,
  });
  expect(typed.rowFailure).toBe('Error: rpcRows failed');
  expect(typed.mappings).toEqual([
    'Your account no longer has access to this POS workspace.',
    'Your account no longer has access to this POS workspace.',
    'Could not load the POS. Check your connection and try again.',
    'Could not load the POS. Check your connection and try again.',
  ]);
  expect(typed.deniedOther).toBe(false);
  expect(typed.noEffectTrace).toEqual([]);
  expect(typed.denied).toBe(true);
  expect(typed.deniedTrace).toEqual([
    ['reports', false], ['clear-cache'],
    ['reset', 'Your account no longer has access to this POS workspace.'],
    ['products'], ['pos'],
  ]);
  expect(typed.signedOut).toBe(false);
  expect(typed.signedOutTrace).toEqual([
    ['reset', 'Sign in to use the POS.'], ['products'], ['pos'],
  ]);
  expect(typed.concurrent).toBe(false);
  expect(typed.owner.ok).toBe(true);
  expect(typed.owner.loadGeneration).toBe(11);
  expect(typed.owner.context).toMatchObject({
    loaded: true, loading: false, businessId: '22',
    businessName: 'Matcha Luna', role: 'owner', error: '',
  });
  expect(typed.owner.trace).toEqual([
    ['products'], ['pos'], ['rpc', 'pos_get_my_businesses'],
    ['publication', 11], ['products'], ['pos'],
  ]);
  expect(typed.manager).toMatchObject({
    ok: true,
    context: {
      businessId: 'manager-business', businessName: 'Managed Cafe',
      role: 'manager', loaded: true, loading: false,
    },
  });
  expect(typed.manager.trace).toContainEqual(['publication', 11]);
  expect(typed.cashier.ok).toBe(true);
  expect(typed.cashier.context.publications).toEqual({});
  expect(typed.cashier.trace.some((entry: unknown[]) => entry[0] === 'publication')).toBe(false);
  expect(typed.zero.context.error).toBe('Your POS workspace has not been set up yet.');
  expect(typed.multiple.context.error).toBe(
    'More than one POS workspace was found. Workspace selection is required.',
  );
  expect(typed.rejected.context.error).toBe('friendly:Error: offline');
  expect(typed.staleContextState).toMatchObject({
    ok: false,
    context: { businessId: 'partial', businessName: 'Partial', role: 'owner', loading: true },
  });
  expect(typed.finallyState).toEqual({
    finallyFailure: 'Error: finally render failed',
    loading: false,
    trace: [['products'], ['pos', 1], ['products'], ['pos', 2]],
  });
});

async function collectColdCheckout(page: Page) {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const api: any = app.MatchaLunaApp?.domains?.workspace || app;
    const h = app.__phase4iWorkspaceHarness;
    const install = (responses: Record<string, any>) => {
      h.reset();
      app.posHydrateCatalogCache = () => { h.trace.push(['hydrate']); return false; };
      app.rpcRows = (result: any) => {
        if (result?.error) throw result.error;
        return result?.data || [];
      };
      app.posLoadRequestStillCurrent = () => true;
      app.normalizePosCategory = () => h.trace.push(['normalize']);
      app.markPosCartAgainstCatalog = () => h.trace.push(['mark']);
      app.posRestorePending = () => h.trace.push(['restore']);
      app.posRememberCatalogCache = () => h.trace.push(['remember']);
      app.clearPosReportData = () => {
        h.trace.push(['clear-reports']);
        app.posCheckout.summary = null;
        app.posCheckout.dailyReport = null;
        app.posCheckout.recent = [];
        app.posCheckout.reportLoadedMode = '';
        app.posCheckout.reportLoadedDate = '';
      };
      app.setPosReportsLoading = (value: unknown) => {
        h.trace.push(['reports-loading', value]);
        app.posCheckout.reportsLoading = !!value;
      };
      app.renderPos = () => h.trace.push(['render']);
      app.renderPosPreservingInteraction = () => h.trace.push(['render-preserve']);
      app.syncOpenPosReportModal = () => h.trace.push(['sync-modal']);
      app.posModeFromPending = () => { h.trace.push(['pending-mode']); return 'training'; };
      app.posStatusCanManage = () => true;
      app.posHandleAccessDenied = (error: any) => {
        h.trace.push(['access-check', error?.code || '']);
        return String(error?.code || '') === '42501';
      };
      app.cloud.client = {
        rpc: (name: string, args: unknown) => {
          h.rpc.push([name, args]);
          const value = responses[name];
          if (value?.syncThrow) throw value.syncThrow;
          if (value?.reject) return Promise.reject(value.reject);
          return Promise.resolve(value);
        },
      };
    };
    const state = () => ({
      catalog: app.posCheckout.catalog,
      catalogLoading: app.posCheckout.catalogLoading,
      shiftLoading: app.posCheckout.shiftLoading,
      loaded: app.posCheckout.loaded,
      shift: app.posCheckout.shift,
      shiftStatus: app.posCheckout.shiftStatus,
      reportMode: app.posCheckout.reportMode,
      summary: app.posCheckout.summary,
      dailyReport: app.posCheckout.dailyReport,
      recent: app.posCheckout.recent,
      reportsError: app.posCheckout.reportsError,
      catalogError: app.posCheckout.catalogError,
      shiftError: app.posCheckout.shiftError,
      checkoutRefreshRequired: app.posCheckout.checkoutRefreshRequired,
      refreshError: app.posCheckout.refreshError,
      catalogVerifiedGeneration: app.posCheckout.catalogVerifiedGeneration,
      training: document.body.classList.contains('pos-training'),
    });
    const baseResponses = (): Record<string, any> => ({
      pos_get_catalog_v2: { data: [{ product_id: 'p1' }] },
      pos_get_shift_status: { data: [{
        has_open_shift: true, shift_id: 'shift-1', is_training: false,
      }] },
      pos_get_end_of_day_summary: { data: [{
        business_date: '2026-11-03', gross_sales_centavos: 17_000,
      }] },
      pos_get_recent_sales_v2: { data: [{ sale_id: 'sale-1' }] },
    });

    install(baseResponses());
    app.posCheckoutLoadGeneration = '40';
    app.posCatalogGeneration = '50';
    const success = await api.loadPosCheckoutData();
    const successResult = {
      ok: success, rpc: h.rpc.slice(), trace: h.trace.slice(), state: state(),
      generations: [app.posCheckoutLoadGeneration, app.posCatalogGeneration],
      attempted: typeof app.posLastSilentRefreshAttemptAt === 'number' &&
        app.posLastSilentRefreshAttemptAt > 0,
    };

    h.reset();
    app.renderPos = () => h.trace.push(['render']);
    app.cloud.client = null;
    const missingClient = await api.loadPosCheckoutData();
    const missingClientTrace = h.trace.slice();
    const guardedEntries: Record<string, unknown> = {};
    for (const kind of ['session', 'user', 'business']) {
      h.reset();
      app.renderPos = () => h.trace.push(['render']);
      app.cloud.client = { rpc: () => { throw new Error('guarded RPC ran'); } };
      if (kind === 'session') app.session = null;
      if (kind === 'user') app.session = {};
      if (kind === 'business') app.posContext.businessId = '';
      guardedEntries[kind] = {
        ok: await api.loadPosCheckoutData(), trace: h.trace.slice(),
      };
    }
    h.reset();
    app.renderPos = () => h.trace.push(['render']);
    app.cloud.client = { rpc: () => { throw new Error('must not call'); } };
    app.posCheckout.submitting = true;
    const checkoutSubmitting = await api.loadPosCheckoutData();
    app.posCheckout.submitting = false;
    app.posOpsModal.submitting = true;
    const operationsSubmitting = await api.loadPosCheckoutData();
    const submissionTrace = h.trace.slice();

    const noShiftResponses = baseResponses();
    noShiftResponses.pos_get_shift_status = { data: [] };
    install(noShiftResponses);
    app.posCheckout.lastReceipt = { shift_id: 'old' };
    document.body.classList.add('pos-training');
    const noShift = await api.loadPosCheckoutData();
    const noShiftResult = { ok: noShift, state: state(), trace: h.trace.slice() };

    const pendingNoShiftResponses = baseResponses();
    pendingNoShiftResponses.pos_get_shift_status = { data: [{
      has_open_shift: false, shift_id: null, is_training: false,
    }] };
    install(pendingNoShiftResponses);
    const pendingReceipt = { shift_id: 'receipt-shift', receipt: 'kept' };
    app.posCheckout.pending = { pending_id: 'pending-retry' };
    app.posCheckout.lastReceipt = pendingReceipt;
    app.posCheckout.reportMode = 'live';
    const pendingNoShift = await api.loadPosCheckoutData();
    const pendingNoShiftResult = {
      ok: pendingNoShift,
      state: state(),
      receiptRetained: app.posCheckout.lastReceipt === pendingReceipt,
      rpc: h.rpc.slice(), trace: h.trace.slice(),
    };

    const cashierNoShiftResponses = baseResponses();
    cashierNoShiftResponses.pos_get_shift_status = { data: [{
      has_open_shift: false, shift_id: null, is_training: false,
    }] };
    install(cashierNoShiftResponses);
    app.posContext.role = 'cashier';
    app.posCheckout.reportMode = 'training';
    app.posStatusCanManage = (status: unknown) => {
      h.trace.push(['can-manage', status]);
      return false;
    };
    const cashierNoShift = await api.loadPosCheckoutData();
    const cashierNoShiftResult = {
      ok: cashierNoShift, state: state(), rpc: h.rpc.slice(), trace: h.trace.slice(),
    };

    const shiftRpcFailureResponses = baseResponses();
    shiftRpcFailureResponses.pos_get_shift_status = {
      reject: { code: '57000', message: 'shift offline' },
    };
    install(shiftRpcFailureResponses);
    const shiftRpcFailure = await api.loadPosCheckoutData();
    const shiftRpcFailureResult = {
      ok: shiftRpcFailure, state: state(), trace: h.trace.slice(),
    };

    const catalogFailureResponses = baseResponses();
    catalogFailureResponses.pos_get_catalog_v2 = { error: { code: '50000' } };
    install(catalogFailureResponses);
    const catalogFailure = await api.loadPosCheckoutData();
    const catalogFailureResult = {
      ok: catalogFailure, state: state(), trace: h.trace.slice(),
    };

    const reportFailureResponses = baseResponses();
    reportFailureResponses.pos_get_end_of_day_summary = {
      reject: { code: '57000', message: 'summary failed' },
    };
    install(reportFailureResponses);
    const reportFailure = await api.loadPosCheckoutData();
    const reportFailureResult = {
      ok: reportFailure, state: state(), trace: h.trace.slice(),
    };

    const deniedResponses = baseResponses();
    deniedResponses.pos_get_shift_status = { error: { code: '42501' } };
    install(deniedResponses);
    const denied = await api.loadPosCheckoutData();
    const deniedResult = { ok: denied, trace: h.trace.slice() };

    const receiptResponses = baseResponses();
    receiptResponses.pos_get_shift_status = { data: [{
      has_open_shift: true, shift_id: 'shift-new', is_training: true,
    }] };
    install(receiptResponses);
    app.posCheckout.lastReceipt = { shift_id: 'shift-old' };
    app.posCheckout.shift = { shift_id: 'shift-old', is_training: false };
    app.posCheckout.reportLoadedMode = 'live';
    app.posCheckout.reportLoadedDate = '2026-11-02';
    app.posCheckout.reportDate = '2026-11-03';
    const transition = await api.loadPosCheckoutData();
    const transitionResult = {
      ok: transition, lastReceipt: app.posCheckout.lastReceipt,
      reportMode: app.posCheckout.reportMode,
      training: document.body.classList.contains('pos-training'),
      trace: h.trace.slice(),
    };
    return {
      successResult, missingClient, missingClientTrace, guardedEntries,
      checkoutSubmitting, operationsSubmitting, submissionTrace,
      noShiftResult, pendingNoShiftResult, cashierNoShiftResult,
      shiftRpcFailureResult, catalogFailureResult, reportFailureResult,
      deniedResult, transitionResult,
    };
  });
}

test('cold checkout loading preserves exact reads, guards, shift/report paths, foreground effects, and render order', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectColdCheckout(typedPage);
  const classic = await collectColdCheckout(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed.successResult).toMatchObject({
    ok: true,
    generations: [41, 51],
    attempted: true,
    rpc: [
      ['pos_get_catalog_v2', { p_business_id: 'business-1' }],
      ['pos_get_shift_status', { p_business_id: 'business-1' }],
      ['pos_get_end_of_day_summary', {
        p_business_id: 'business-1', p_business_date: null,
        p_is_training: false,
      }],
      ['pos_get_recent_sales_v2', {
        p_business_id: 'business-1', p_is_training: false, p_limit: 20,
      }],
    ],
    state: {
      catalog: [{ product_id: 'p1' }], loaded: true,
      shift: { has_open_shift: true, shift_id: 'shift-1', is_training: false },
      catalogError: '', shiftError: '', reportsError: '',
      checkoutRefreshRequired: false, refreshError: '',
      catalogVerifiedGeneration: 51, training: false,
    },
  });
  expect(typed.successResult.trace).toEqual([
    ['hydrate'], ['reports-loading', true], ['render'], ['sync-modal'],
    ['access-check', ''], ['access-check', ''],
    ['normalize'], ['mark'], ['restore'], ['remember'],
    ['reports-loading', false], ['access-check', ''], ['access-check', ''],
    ['render'], ['sync-modal'],
  ]);
  expect(typed.missingClient).toBe(false);
  expect(typed.missingClientTrace).toEqual([['render']]);
  expect(typed.guardedEntries).toEqual({
    session: { ok: false, trace: [['render']] },
    user: { ok: false, trace: [['render']] },
    business: { ok: false, trace: [['render']] },
  });
  expect(typed.checkoutSubmitting).toBe(false);
  expect(typed.operationsSubmitting).toBe(false);
  expect(typed.submissionTrace).toEqual([]);
  expect(typed.noShiftResult).toMatchObject({
    ok: false,
    state: {
      loaded: false, shift: null, shiftStatus: null,
      checkoutRefreshRequired: true,
      shiftError: 'No active register was found. Ask an owner to check the POS setup.',
      reportsError: 'Shift and report totals were not loaded.', training: false,
    },
  });
  expect(typed.pendingNoShiftResult).toMatchObject({
    ok: true,
    receiptRetained: true,
    state: {
      loaded: true, shift: null, reportMode: 'training', training: false,
      reportsError: '', checkoutRefreshRequired: false,
    },
  });
  expect(typed.pendingNoShiftResult.trace).toContainEqual(['pending-mode']);
  expect(typed.pendingNoShiftResult.rpc.slice(2)).toEqual([
    ['pos_get_end_of_day_summary', {
      p_business_id: 'business-1', p_business_date: null,
      p_is_training: true,
    }],
    ['pos_get_recent_sales_v2', {
      p_business_id: 'business-1', p_is_training: true, p_limit: 20,
    }],
  ]);
  expect(typed.cashierNoShiftResult).toMatchObject({
    ok: true,
    state: {
      loaded: true, shift: null, reportMode: 'live', training: false,
      reportsError: '', checkoutRefreshRequired: false,
    },
  });
  expect(typed.cashierNoShiftResult.trace).toContainEqual([
    'can-manage', { has_open_shift: false, shift_id: null, is_training: false },
  ]);
  expect(typed.cashierNoShiftResult.rpc.slice(2)).toEqual([
    ['pos_get_end_of_day_summary', {
      p_business_id: 'business-1', p_business_date: null,
      p_is_training: false,
    }],
    ['pos_get_recent_sales_v2', {
      p_business_id: 'business-1', p_is_training: false, p_limit: 20,
    }],
  ]);
  expect(typed.shiftRpcFailureResult).toMatchObject({
    ok: false,
    state: {
      loaded: false, shift: null, shiftStatus: null,
      checkoutRefreshRequired: true,
      shiftError: 'Could not load the POS. Check your connection and try again.',
      reportsError: 'Shift and report totals were not loaded.',
    },
  });
  expect(typed.catalogFailureResult).toMatchObject({
    ok: false,
    state: {
      catalogError: 'Could not load the POS. Check your connection and try again.',
      checkoutRefreshRequired: true,
      refreshError: 'Could not refresh the menu. Existing cards are preserved; retry before confirming payment.',
    },
  });
  expect(typed.reportFailureResult).toMatchObject({
    ok: true,
    state: {
      reportsError: 'The live totals could not be refreshed.',
      refreshError: 'Checkout is ready, but sales totals could not refresh.',
      summary: null, dailyReport: null, recent: [{ sale_id: 'sale-1' }],
    },
  });
  expect(typed.deniedResult.ok).toBe(false);
  expect(typed.deniedResult.trace).toContainEqual(['access-check', '42501']);
  expect(typed.transitionResult).toMatchObject({
    ok: true, lastReceipt: null, reportMode: 'training', training: true,
  });
  expect(typed.transitionResult.trace).toContainEqual(['clear-reports']);
});

async function collectBackgroundCheckout(page: Page) {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const api: any = app.MatchaLunaApp?.domains?.workspace || app;
    const h = app.__phase4iWorkspaceHarness;
    const base = (): Record<string, any> => ({
      pos_get_catalog_v2: { data: [{ product_id: 'fresh' }] },
      pos_get_shift_status: { data: [{
        has_open_shift: true, shift_id: 'shift-warm', is_training: false,
      }] },
      pos_get_end_of_day_summary: { data: [{
        business_date: '2026-11-03', gross_sales_centavos: 34_000,
      }] },
      pos_get_recent_sales_v2: { data: [{ sale_id: 'recent-new' }] },
    });
    const install = (responses: Record<string, any>, hydrate = true) => {
      h.reset();
      app.posCheckout.loaded = true;
      app.posCheckout.catalog = [{ product_id: 'cached' }];
      app.posCheckout.catalogFromCache = true;
      app.posCheckout.summary = { business_date: '2026-11-02', old: true };
      app.posCheckout.dailyReport = app.posCheckout.summary;
      app.posCheckout.recent = [{ sale_id: 'recent-old' }];
      app.posHydrateCatalogCache = () => {
        h.trace.push(['hydrate']);
        return hydrate;
      };
      app.rpcRows = (result: any) => {
        if (result?.error) throw result.error;
        return result?.data || [];
      };
      app.posLoadRequestStillCurrent = () => true;
      app.normalizePosCategory = () => h.trace.push(['normalize']);
      app.markPosCartAgainstCatalog = () => h.trace.push(['mark']);
      app.posRestorePending = () => h.trace.push(['restore']);
      app.posRememberCatalogCache = () => h.trace.push(['remember']);
      app.clearPosReportData = () => {
        h.trace.push(['clear-reports']);
        app.posCheckout.summary = null;
        app.posCheckout.dailyReport = null;
        app.posCheckout.recent = [];
        app.posCheckout.reportLoadedMode = '';
        app.posCheckout.reportLoadedDate = '';
      };
      app.setPosReportsLoading = (value: unknown) => {
        h.trace.push(['reports-loading', value]);
        app.posCheckout.reportsLoading = !!value;
      };
      app.renderPos = () => h.trace.push(['render']);
      app.renderPosPreservingInteraction = () => h.trace.push(['render-preserve']);
      app.syncOpenPosReportModal = () => h.trace.push(['sync-modal']);
      app.posStatusCanManage = () => true;
      app.posHandleAccessDenied = (error: any) => {
        h.trace.push(['access', error?.code || '']);
        return String(error?.code || '') === '42501';
      };
      app.cloud.client = {
        rpc: (name: string, args: unknown) => {
          h.rpc.push([name, args]);
          const value = responses[name];
          if (typeof value === 'function') return value();
          if (value?.syncThrow) throw value.syncThrow;
          if (value?.reject) return Promise.reject(value.reject);
          return Promise.resolve(value);
        },
      };
    };
    const snapshot = () => ({
      catalog: app.posCheckout.catalog,
      summary: app.posCheckout.summary,
      recent: app.posCheckout.recent,
      refreshing: app.posCheckout.refreshing,
      reportsLoading: app.posCheckout.reportsLoading,
      checkoutRefreshRequired: app.posCheckout.checkoutRefreshRequired,
      refreshError: app.posCheckout.refreshError,
      reportsError: app.posCheckout.reportsError,
      catalogError: app.posCheckout.catalogError,
      verified: app.posCheckout.catalogVerifiedGeneration,
    });

    const shiftFailureResponses = base();
    shiftFailureResponses.pos_get_shift_status = { reject: { code: '57000' } };
    install(shiftFailureResponses);
    const shiftFailure = await api.loadPosCheckoutData({ background: false });
    const shiftFailureResult = {
      ok: shiftFailure, state: snapshot(), trace: h.trace.slice(),
    };

    const catalogFailureResponses = base();
    catalogFailureResponses.pos_get_catalog_v2 = {
      syncThrow: { code: '57000', message: 'sync catalog failure' },
    };
    install(catalogFailureResponses);
    const catalogFailure = await api.loadPosCheckoutData({ background: true });
    const catalogFailureResult = {
      ok: catalogFailure, state: snapshot(), trace: h.trace.slice(),
    };

    const reportFailureResponses = base();
    reportFailureResponses.pos_get_end_of_day_summary = {
      reject: { code: '57000' },
    };
    reportFailureResponses.pos_get_recent_sales_v2 = {
      syncThrow: { code: '57001' },
    };
    install(reportFailureResponses);
    const reportFailure = await api.loadPosCheckoutData({ background: true });
    const reportFailureResult = {
      ok: reportFailure, state: snapshot(), trace: h.trace.slice(),
    };

    const overlapResponses = base();
    install(overlapResponses);
    overlapResponses.pos_get_catalog_v2 = () => {
      app.posCatalogGeneration += 1;
      app.posCheckout.catalogVerifiedGeneration = app.posCatalogGeneration;
      return Promise.resolve({ data: [{ product_id: 'overlap-ignored' }] });
    };
    const overlap = await api.loadPosCheckoutData({ background: true });
    const overlapResult = {
      ok: overlap, state: snapshot(), catalogGeneration: app.posCatalogGeneration,
    };

    install(base());
    let currentCalls = 0;
    app.posLoadRequestStillCurrent = () => { currentCalls += 1; return false; };
    const staleInitial = await api.loadPosCheckoutData({ background: true });
    const staleInitialResult = {
      ok: staleInitial, calls: currentCalls, state: snapshot(), trace: h.trace.slice(),
    };

    install(base());
    currentCalls = 0;
    app.posLoadRequestStillCurrent = () => {
      currentCalls += 1;
      return currentCalls === 1;
    };
    const staleReports = await api.loadPosCheckoutData({ background: true });
    const staleReportsResult = {
      ok: staleReports, calls: currentCalls, state: snapshot(), trace: h.trace.slice(),
    };

    const accessResults: Record<string, any> = {};
    for (const deniedName of [
      'pos_get_catalog_v2', 'pos_get_shift_status',
      'pos_get_end_of_day_summary', 'pos_get_recent_sales_v2',
    ]) {
      const responses = base();
      responses[deniedName] = { error: { code: '42501' } };
      install(responses);
      const ok = await api.loadPosCheckoutData({ background: true });
      accessResults[deniedName] = {
        ok,
        accessChecks: h.trace.filter((entry: unknown[]) => entry[0] === 'access'),
      };
    }

    install(base());
    app.normalizePosCategory = () => { throw new Error('normalize failed'); };
    let helperFailure = '';
    try { await api.loadPosCheckoutData({ background: true }); }
    catch (error) { helperFailure = String(error); }
    const helperFailureState = { helperFailure, state: snapshot(), trace: h.trace.slice() };

    return {
      shiftFailureResult, catalogFailureResult, reportFailureResult,
      overlapResult, staleInitialResult, staleReportsResult,
      accessResults, helperFailureState,
    };
  });
}

test('background checkout loading preserves warm screens, stale points, overlapping verification, access denial, and helper failures', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectBackgroundCheckout(typedPage);
  const classic = await collectBackgroundCheckout(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed.shiftFailureResult).toMatchObject({
    ok: false,
    state: {
      catalog: [{ product_id: 'fresh' }],
      summary: { business_date: '2026-11-02', old: true },
      recent: [{ sale_id: 'recent-old' }],
      refreshing: false, checkoutRefreshRequired: true,
      refreshError: 'Could not verify the register. Your current screen is preserved; retry before confirming payment.',
      reportsError: 'Sales totals were not refreshed.',
    },
  });
  expect(typed.shiftFailureResult.trace).toContainEqual(['render-preserve']);
  expect(typed.catalogFailureResult).toMatchObject({
    ok: false,
    state: {
      catalog: [{ product_id: 'cached' }], catalogError: '',
      checkoutRefreshRequired: true,
      refreshError: 'Could not refresh the menu. Existing cards are preserved; retry before confirming payment.',
    },
  });
  expect(typed.reportFailureResult).toMatchObject({
    ok: true,
    state: {
      summary: { business_date: '2026-11-02', old: true },
      recent: [{ sale_id: 'recent-old' }],
      reportsError: 'The live totals could not be refreshed.',
      checkoutRefreshRequired: false,
      refreshError: 'Checkout is ready, but sales totals could not refresh.',
    },
  });
  expect(typed.overlapResult).toMatchObject({
    ok: true,
    state: {
      catalog: [{ product_id: 'cached' }],
      checkoutRefreshRequired: false,
      verified: 52,
    },
    catalogGeneration: 52,
  });
  expect(typed.staleInitialResult).toMatchObject({
    ok: false, calls: 1,
    state: { refreshing: true, reportsLoading: true },
  });
  expect(typed.staleReportsResult).toMatchObject({
    ok: false, calls: 2,
    state: { refreshing: true, reportsLoading: true },
  });
  for (const deniedName of [
    'pos_get_catalog_v2', 'pos_get_shift_status',
    'pos_get_end_of_day_summary', 'pos_get_recent_sales_v2',
  ]) {
    expect(typed.accessResults[deniedName].ok).toBe(false);
    expect(typed.accessResults[deniedName].accessChecks).toContainEqual(['access', '42501']);
  }
  expect(typed.helperFailureState).toMatchObject({
    helperFailure: 'Error: normalize failed',
    state: { catalog: [{ product_id: 'fresh' }], refreshing: true },
  });
});

async function collectRefreshCoordination(page: Page) {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const api: any = app.MatchaLunaApp?.domains?.workspace || app;
    const h = app.__phase4iWorkspaceHarness;

    h.reset();
    const guardPromise = api.refreshPosSilently(false);
    const guard = {
      isPromise: guardPromise instanceof Promise,
      value: await guardPromise,
    };
    h.reset();
    app.cloud.client = {};
    app.posCheckout.submitting = true;
    const submitGuard = await api.refreshPosSilently(true);
    const silentEntryGuards: Record<string, unknown> = {};
    for (const kind of [
      'client', 'session', 'user', 'business',
      'checkout-submitting', 'operations-submitting',
    ]) {
      h.reset();
      app.cloud.client = {};
      app.loadPosCheckoutData = () => {
        h.trace.push(['load']);
        return Promise.resolve(true);
      };
      if (kind === 'client') app.cloud.client = null;
      if (kind === 'session') app.session = null;
      if (kind === 'user') app.session = {};
      if (kind === 'business') app.posContext.businessId = '';
      if (kind === 'checkout-submitting') app.posCheckout.submitting = true;
      if (kind === 'operations-submitting') app.posOpsModal.submitting = true;
      const before = JSON.stringify({
        checkout: app.posCheckout,
        checkoutGeneration: app.posCheckoutLoadGeneration,
        catalogGeneration: app.posCatalogGeneration,
        lastAttempt: app.posLastSilentRefreshAttemptAt,
      });
      const promise = api.refreshPosSilently(true);
      silentEntryGuards[kind] = {
        isPromise: promise instanceof Promise,
        value: await promise,
        trace: h.trace.slice(),
        unchanged: before === JSON.stringify({
          checkout: app.posCheckout,
          checkoutGeneration: app.posCheckoutLoadGeneration,
          catalogGeneration: app.posCatalogGeneration,
          lastAttempt: app.posLastSilentRefreshAttemptAt,
        }),
      };
    }

    h.reset();
    app.cloud.client = {};
    const existing = Promise.resolve('existing');
    app.posSilentRefreshPromise = existing;
    const existingReturn = api.refreshPosSilently(true);
    const existingIdentity = existingReturn === existing;
    await existingReturn;

    h.reset();
    app.cloud.client = {};
    app.posLastSilentRefreshAttemptAt = Date.now();
    app.loadPosCheckoutData = () => { h.trace.push(['load']); return Promise.resolve(false); };
    const throttle = await api.refreshPosSilently(false);
    const throttleTrace = h.trace.slice();

    const NativeDate = app.Date;
    const throttleBoundaries: Record<string, unknown> = {};
    for (const [name, age, force] of [
      ['inside', app.POS_SILENT_REFRESH_MIN_AGE_MS - 1, false],
      ['exact', app.POS_SILENT_REFRESH_MIN_AGE_MS, false],
      ['forced', 0, true],
    ] as const) {
      h.reset();
      app.cloud.client = {};
      (app as Record<string, any>).Date = { now: () => 100_000 };
      app.posLastSilentRefreshAttemptAt = 100_000 - age;
      app.loadPosCheckoutData = (options: unknown) => {
        h.trace.push(['load', options]);
        return Promise.resolve(true);
      };
      throttleBoundaries[name] = {
        value: await api.refreshPosSilently(force), trace: h.trace.slice(),
      };
    }
    (app as Record<string, any>).Date = NativeDate;

    h.reset();
    app.cloud.client = {};
    app.posCheckout.loaded = true;
    let resolveTask!: (value: boolean) => void;
    const task = new Promise<boolean>((resolve) => { resolveTask = resolve; });
    app.loadPosCheckoutData = (options: unknown) => {
      h.trace.push(['load', options]);
      return task;
    };
    const first = api.refreshPosSilently(true);
    const storedExact = app.posSilentRefreshPromise === task;
    const second = api.refreshPosSilently(false);
    const identity = {
      firstIsTask: first === task,
      secondIsTask: second === task,
      firstIsSecond: first === second,
      storedExact,
    };
    resolveTask(true);
    const firstValue = await first;
    const secondValue = await second;
    await Promise.resolve();
    const cleared = app.posSilentRefreshPromise === null;

    h.reset();
    app.cloud.client = {};
    const rejectedTask = Promise.reject(new Error('refresh rejected'));
    app.loadPosCheckoutData = () => rejectedTask;
    let rejection = '';
    try { await api.refreshPosSilently(true); } catch (error) { rejection = String(error); }
    const rejectionCleared = app.posSilentRefreshPromise === null;

    h.reset();
    app.refreshPosSilently = (force: unknown) => {
      h.trace.push(['direct-forced', force]);
      return Promise.resolve(true);
    };
    const directAfterMutationPromise = api.refreshPosAfterMutation();
    const directAfterMutationResult = {
      isPromise: directAfterMutationPromise instanceof Promise,
      value: await directAfterMutationPromise,
      trace: h.trace.slice(),
    };

    h.reset();
    const rejectingActive = Promise.reject(new Error('active refresh failed'));
    app.posSilentRefreshPromise = rejectingActive;
    app.refreshPosSilently = (force: unknown) => {
      h.trace.push(['forced-after-rejection', force, app.posSilentRefreshPromise === null]);
      return Promise.resolve(true);
    };
    const rejectedActiveValue = await api.refreshPosAfterMutation();
    const rejectedActiveResult = {
      value: rejectedActiveValue,
      trace: h.trace.slice(),
      cleared: app.posSilentRefreshPromise === null,
    };

    h.reset();
    app.cloud.client = {};
    let finishActive!: () => void;
    const active = new Promise<void>((resolve) => { finishActive = resolve; });
    app.posSilentRefreshPromise = active;
    app.refreshPosSilently = (force: unknown) => {
      h.trace.push(['forced', force, app.posSilentRefreshPromise === null]);
      return Promise.resolve(true);
    };
    const afterMutation = api.refreshPosAfterMutation();
    h.trace.push(['before-active']);
    finishActive();
    const afterMutationValue = await afterMutation;
    const afterMutationResult = {
      value: afterMutationValue, trace: h.trace.slice(),
      cleared: app.posSilentRefreshPromise === null,
    };

    h.reset();
    app.cloud.client = {};
    let finishDrift!: () => void;
    const driftActive = new Promise<void>((resolve) => { finishDrift = resolve; });
    app.posSilentRefreshPromise = driftActive;
    app.refreshPosSilently = () => { h.trace.push(['must-not-refresh']); return Promise.resolve(true); };
    const driftTask = api.refreshPosAfterMutation();
    app.session.user.id = 'other-user';
    finishDrift();
    const driftValue = await driftTask;

    h.reset();
    let finishBusinessDrift!: () => void;
    const businessDriftActive = new Promise<void>((resolve) => {
      finishBusinessDrift = resolve;
    });
    app.posSilentRefreshPromise = businessDriftActive;
    app.refreshPosSilently = () => {
      h.trace.push(['must-not-refresh']);
      return Promise.resolve(true);
    };
    const businessDriftTask = api.refreshPosAfterMutation();
    app.posContext.businessId = 'other-business';
    finishBusinessDrift();
    const businessDriftResult = {
      value: await businessDriftTask,
      trace: h.trace.slice(),
      activeRetained: app.posSilentRefreshPromise === businessDriftActive,
    };

    const afterMutationEntryGuards: Record<string, unknown> = {};
    for (const kind of ['session', 'user', 'business']) {
      h.reset();
      app.refreshPosSilently = () => {
        h.trace.push(['refresh']);
        return Promise.resolve(true);
      };
      if (kind === 'session') app.session = null;
      if (kind === 'user') app.session = {};
      if (kind === 'business') app.posContext.businessId = '';
      afterMutationEntryGuards[kind] = {
        value: await api.refreshPosAfterMutation(), trace: h.trace.slice(),
      };
    }

    h.reset();
    app.cloud.client = {};
    const replacement = Promise.resolve('replacement');
    let finishReplace!: () => void;
    const captured = new Promise<void>((resolve) => { finishReplace = resolve; });
    app.posSilentRefreshPromise = captured;
    app.refreshPosSilently = () => {
      h.trace.push(['replacement-preserved', app.posSilentRefreshPromise === replacement]);
      return Promise.resolve(true);
    };
    const replaceTask = api.refreshPosAfterMutation();
    app.posSilentRefreshPromise = replacement;
    finishReplace();
    const replaceValue = await replaceTask;
    const replaceTrace = h.trace.slice();
    const replacementPreserved = app.posSilentRefreshPromise === replacement;

    const installCatalog = (response: any, catalog: any[] = []) => {
      h.reset();
      app.posCheckout.catalog = catalog;
      app.posCheckout.loaded = true;
      app.posCheckout.checkoutRefreshRequired = true;
      app.posCheckout.refreshError = 'existing verification lock';
      app.rpcRows = (result: any) => {
        if (result?.error) throw result.error;
        return result?.data || [];
      };
      app.posCatalogRequestStillCurrent = () => true;
      app.normalizePosCategory = () => h.trace.push(['normalize']);
      app.markPosCartAgainstCatalog = () => h.trace.push(['mark']);
      app.posRestorePending = () => h.trace.push(['restore']);
      app.posRememberCatalogCache = () => h.trace.push(['remember']);
      app.renderPos = () => h.trace.push(['render']);
      app.posHandleAccessDenied = (error: any) => {
        h.trace.push(['access', error?.code || '']);
        return String(error?.code || '') === '42501';
      };
      app.cloud.client = {
        rpc: async (name: string, args: unknown) => {
          h.rpc.push([name, args]);
          if (response?.reject) throw response.reject;
          return response;
        },
      };
    };
    const catalogEntryGuards: Record<string, unknown> = {};
    for (const kind of ['client', 'session', 'user', 'business']) {
      h.reset();
      app.renderPos = () => h.trace.push(['render']);
      app.cloud.client = { rpc: () => { h.trace.push(['rpc']); } };
      if (kind === 'client') app.cloud.client = null;
      if (kind === 'session') app.session = null;
      if (kind === 'user') app.session = {};
      if (kind === 'business') app.posContext.businessId = '';
      const before = JSON.stringify({
        checkout: app.posCheckout,
        catalogGeneration: app.posCatalogGeneration,
      });
      catalogEntryGuards[kind] = {
        value: await api.refreshPosCatalogOnly(), trace: h.trace.slice(),
        unchanged: before === JSON.stringify({
          checkout: app.posCheckout,
          catalogGeneration: app.posCatalogGeneration,
        }),
      };
    }

    installCatalog({ data: [{ product_id: 'operations-allowed' }] });
    app.posOpsModal.submitting = true;
    const catalogOperationsSubmitting = await api.refreshPosCatalogOnly();
    const catalogOperationsSubmittingResult = {
      ok: catalogOperationsSubmitting,
      catalog: app.posCheckout.catalog,
      rpc: h.rpc.slice(), trace: h.trace.slice(),
    };
    installCatalog({ data: [{ product_id: 'checkout-allowed' }] });
    app.posCheckout.submitting = true;
    const catalogCheckoutSubmitting = await api.refreshPosCatalogOnly();
    const catalogCheckoutSubmittingResult = {
      ok: catalogCheckoutSubmitting,
      catalog: app.posCheckout.catalog,
      rpc: h.rpc.slice(), trace: h.trace.slice(),
    };
    installCatalog({ data: [{ product_id: 'catalog-new' }] });
    const catalogSuccess = await api.refreshPosCatalogOnly();
    const catalogSuccessResult = {
      ok: catalogSuccess,
      state: {
        catalog: app.posCheckout.catalog,
        loading: app.posCheckout.catalogLoading,
        fromCache: app.posCheckout.catalogFromCache,
        verified: app.posCheckout.catalogVerifiedGeneration,
        locked: app.posCheckout.checkoutRefreshRequired,
        refreshError: app.posCheckout.refreshError,
      },
      rpc: h.rpc.slice(), trace: h.trace.slice(),
    };

    installCatalog({ reject: { code: '57000' } }, []);
    const catalogEmptyFailure = await api.refreshPosCatalogOnly();
    const catalogEmptyResult = {
      ok: catalogEmptyFailure,
      error: app.posCheckout.catalogError,
      locked: app.posCheckout.checkoutRefreshRequired,
      refreshError: app.posCheckout.refreshError,
      trace: h.trace.slice(),
    };

    installCatalog(
      { reject: { code: '57000', message: 'warm catalog offline' } },
      [{ product_id: 'warm-kept' }],
    );
    app.posCheckout.catalogError = 'must-clear';
    app.posCheckout.checkoutRefreshRequired = false;
    app.posCheckout.refreshError = '';
    const catalogWarmFailure = await api.refreshPosCatalogOnly();
    const catalogWarmFailureResult = {
      ok: catalogWarmFailure,
      catalog: app.posCheckout.catalog,
      catalogError: app.posCheckout.catalogError,
      locked: app.posCheckout.checkoutRefreshRequired,
      refreshError: app.posCheckout.refreshError,
      trace: h.trace.slice(),
    };

    installCatalog({ reject: { code: '42501' } }, [{ product_id: 'warm' }]);
    const catalogDenied = await api.refreshPosCatalogOnly();
    const catalogDeniedResult = { ok: catalogDenied, trace: h.trace.slice() };

    installCatalog({ data: [{ product_id: 'late' }] });
    app.posCatalogRequestStillCurrent = () => false;
    const catalogStale = await api.refreshPosCatalogOnly();
    const catalogStaleResult = {
      ok: catalogStale,
      catalog: app.posCheckout.catalog,
      loading: app.posCheckout.catalogLoading,
      trace: h.trace.slice(),
    };

    installCatalog({ reject: { code: '57000' } }, []);
    app.posCatalogRequestStillCurrent = () => false;
    const catalogStaleFailure = await api.refreshPosCatalogOnly();
    const catalogStaleFailureResult = {
      ok: catalogStaleFailure,
      loading: app.posCheckout.catalogLoading,
      error: app.posCheckout.catalogError,
      trace: h.trace.slice(),
    };

    installCatalog({ data: [{ product_id: 'helper-partial' }] });
    app.normalizePosCategory = () => {
      h.trace.push(['normalize-throw']);
      throw new Error('catalog helper failed');
    };
    const catalogHelperFailure = await api.refreshPosCatalogOnly();
    const catalogHelperFailureResult = {
      ok: catalogHelperFailure,
      catalog: app.posCheckout.catalog,
      loading: app.posCheckout.catalogLoading,
      locked: app.posCheckout.checkoutRefreshRequired,
      refreshError: app.posCheckout.refreshError,
      trace: h.trace.slice(),
    };

    installCatalog({ data: [{ product_id: 'never-read' }] }, []);
    app.renderPos = () => {
      h.trace.push(['initial-render-throw']);
      throw new Error('initial catalog render failed');
    };
    let initialRenderFailure = '';
    try { await api.refreshPosCatalogOnly(); }
    catch (error) { initialRenderFailure = String(error); }
    const catalogInitialRenderFailure = {
      error: initialRenderFailure, rpc: h.rpc.slice(),
      loading: app.posCheckout.catalogLoading, trace: h.trace.slice(),
    };

    installCatalog({ reject: { code: '57000' } }, []);
    let catalogRenderCount = 0;
    app.renderPos = () => {
      catalogRenderCount += 1;
      h.trace.push(['render', catalogRenderCount]);
      if (catalogRenderCount === 2) throw new Error('catch catalog render failed');
    };
    let catchRenderFailure = '';
    try { await api.refreshPosCatalogOnly(); }
    catch (error) { catchRenderFailure = String(error); }
    const catalogCatchRenderFailure = {
      error: catchRenderFailure, loading: app.posCheckout.catalogLoading,
      trace: h.trace.slice(),
    };

    const openScenario = async (kind: string) => {
      h.reset();
      app.cloud.client = {};
      app.posCheckout.loaded = false;
      app.posCheckout.catalogFromCache = false;
      app.posCheckout.catalog = [];
      app.posCheckout.catalogError = '';
      app.loadPosContext = async () => {
        h.trace.push(['context']);
        if (kind === 'context-failure') return false;
        if (kind === 'context-no-business') return true;
        app.posContext.businessId = 'business-after-context';
        return true;
      };
      app.refreshPosSilently = (force: unknown) => {
        h.trace.push(['silent', force]); return Promise.resolve('silent');
      };
      app.loadPosCheckoutData = (options?: unknown) => {
        h.trace.push(['checkout', options ?? null]); return Promise.resolve('checkout');
      };
      app.renderPos = () => h.trace.push(['render']);
      if (
        kind === 'missing-context' || kind === 'context-failure' ||
        kind === 'context-no-business'
      ) app.posContext.businessId = '';
      if (kind === 'warm-refresh') { app.posCheckout.loaded = true; }
      if (kind === 'cache-refresh') app.posCheckout.catalogFromCache = true;
      if (kind === 'catalog-refresh') app.posCheckout.catalog = [{ id: 'warm' }];
      if (kind === 'cold') { app.posCheckout.loaded = false; app.posCheckout.catalog = []; }
      if (kind === 'error') { app.posCheckout.loaded = true; app.posCheckout.catalogError = 'bad'; }
      if (kind === 'ready') { app.posCheckout.loaded = true; app.posCheckout.catalog = [{ id: 1 }]; }
      if (kind === 'catalog-ready-unloaded') app.posCheckout.catalog = [{ id: 2 }];
      if (kind === 'submitting') app.posCheckout.submitting = true;
      const refresh = [
        'warm-refresh', 'cache-refresh', 'catalog-refresh', 'cold',
      ].includes(kind);
      const value = await api.openPosRegister(refresh);
      return { value, trace: h.trace.slice() };
    };
    const open = {
      missingContext: await openScenario('missing-context'),
      contextFailure: await openScenario('context-failure'),
      contextNoBusiness: await openScenario('context-no-business'),
      warmRefresh: await openScenario('warm-refresh'),
      cacheRefresh: await openScenario('cache-refresh'),
      catalogRefresh: await openScenario('catalog-refresh'),
      cold: await openScenario('cold'),
      error: await openScenario('error'),
      ready: await openScenario('ready'),
      catalogReadyUnloaded: await openScenario('catalog-ready-unloaded'),
      submitting: await openScenario('submitting'),
    };

    return {
      guard, submitGuard, silentEntryGuards,
      existingIdentity, throttle, throttleTrace,
      throttleBoundaries,
      identity, firstValue, secondValue, cleared, rejection, rejectionCleared,
      directAfterMutationResult, rejectedActiveResult,
      afterMutationResult, driftValue, businessDriftResult, afterMutationEntryGuards,
      replaceValue, replaceTrace,
      replacementPreserved,
      catalogEntryGuards, catalogOperationsSubmittingResult,
      catalogCheckoutSubmittingResult,
      catalogSuccessResult, catalogEmptyResult, catalogWarmFailureResult,
      catalogDeniedResult,
      catalogStaleResult, catalogStaleFailureResult,
      catalogHelperFailureResult, catalogInitialRenderFailure,
      catalogCatchRenderFailure, open,
    };
  });
}

test('refresh coordination preserves promise identity, throttle, cleanup, verification locks, catalog paths, and register dispatch', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectRefreshCoordination(typedPage);
  const classic = await collectRefreshCoordination(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed.guard).toEqual({ isPromise: true, value: false });
  expect(typed.submitGuard).toBe(false);
  expect(typed.silentEntryGuards).toEqual({
    client: { isPromise: true, value: false, trace: [], unchanged: true },
    session: { isPromise: true, value: false, trace: [], unchanged: true },
    user: { isPromise: true, value: false, trace: [], unchanged: true },
    business: { isPromise: true, value: false, trace: [], unchanged: true },
    'checkout-submitting': {
      isPromise: true, value: false, trace: [], unchanged: true,
    },
    'operations-submitting': {
      isPromise: true, value: false, trace: [], unchanged: true,
    },
  });
  expect(typed.existingIdentity).toBe(true);
  expect(typed.throttle).toBe(true);
  expect(typed.throttleTrace).toEqual([]);
  expect(typed.throttleBoundaries).toEqual({
    inside: { value: true, trace: [] },
    exact: { value: true, trace: [['load', { background: false }]] },
    forced: { value: true, trace: [['load', { background: false }]] },
  });
  expect(typed.identity).toEqual({
    firstIsTask: false, secondIsTask: true, firstIsSecond: false,
    storedExact: true,
  });
  expect([typed.firstValue, typed.secondValue, typed.cleared]).toEqual([true, true, true]);
  expect(typed.rejection).toBe('Error: refresh rejected');
  expect(typed.rejectionCleared).toBe(true);
  expect(typed.directAfterMutationResult).toEqual({
    isPromise: true, value: true, trace: [['direct-forced', true]],
  });
  expect(typed.rejectedActiveResult).toEqual({
    value: true,
    trace: [['forced-after-rejection', true, true]],
    cleared: true,
  });
  expect(typed.afterMutationResult).toEqual({
    value: true,
    trace: [['before-active'], ['forced', true, true]],
    cleared: true,
  });
  expect(typed.driftValue).toBe(false);
  expect(typed.businessDriftResult).toEqual({
    value: false, trace: [], activeRetained: true,
  });
  expect(typed.afterMutationEntryGuards).toEqual({
    session: { value: false, trace: [] },
    user: { value: false, trace: [] },
    business: { value: false, trace: [] },
  });
  expect(typed.replaceValue).toBe(true);
  expect(typed.replaceTrace).toEqual([['replacement-preserved', true]]);
  expect(typed.replacementPreserved).toBe(true);
  expect(typed.catalogEntryGuards).toEqual({
    client: { value: false, trace: [], unchanged: true },
    session: { value: false, trace: [], unchanged: true },
    user: { value: false, trace: [], unchanged: true },
    business: { value: false, trace: [], unchanged: true },
  });
  expect(typed.catalogOperationsSubmittingResult).toEqual({
    ok: true,
    catalog: [{ product_id: 'operations-allowed' }],
    rpc: [['pos_get_catalog_v2', { p_business_id: 'business-1' }]],
    trace: [['render'], ['normalize'], ['mark'], ['restore'], ['remember'], ['render']],
  });
  expect(typed.catalogCheckoutSubmittingResult).toEqual({
    ok: true,
    catalog: [{ product_id: 'checkout-allowed' }],
    rpc: [['pos_get_catalog_v2', { p_business_id: 'business-1' }]],
    trace: [['render'], ['normalize'], ['mark'], ['restore'], ['remember'], ['render']],
  });
  expect(typed.catalogSuccessResult).toMatchObject({
    ok: true,
    state: {
      catalog: [{ product_id: 'catalog-new' }], loading: false,
      fromCache: false, verified: 51, locked: true,
      refreshError: 'existing verification lock',
    },
    rpc: [['pos_get_catalog_v2', { p_business_id: 'business-1' }]],
    trace: [['render'], ['normalize'], ['mark'], ['restore'], ['remember'], ['render']],
  });
  expect(typed.catalogEmptyResult).toMatchObject({
    ok: false,
    error: 'Could not load the POS. Check your connection and try again.',
    locked: true,
    refreshError: 'Could not refresh the menu. Retry before confirming payment.',
  });
  expect(typed.catalogWarmFailureResult).toEqual({
    ok: false,
    catalog: [{ product_id: 'warm-kept' }],
    catalogError: '',
    locked: true,
    refreshError: 'Could not refresh the menu. Retry before confirming payment.',
    trace: [['render'], ['access', '57000'], ['render']],
  });
  expect(typed.catalogDeniedResult).toEqual({
    ok: false,
    trace: [['render'], ['access', '42501']],
  });
  expect(typed.catalogStaleResult).toMatchObject({
    ok: false, catalog: [], loading: true, trace: [['render']],
  });
  expect(typed.catalogStaleFailureResult).toEqual({
    ok: false, loading: true, error: '', trace: [['render']],
  });
  expect(typed.catalogHelperFailureResult).toMatchObject({
    ok: false,
    catalog: [{ product_id: 'helper-partial' }],
    loading: false, locked: true,
    refreshError: 'Could not refresh the menu. Retry before confirming payment.',
    trace: [
      ['render'], ['normalize-throw'], ['access', ''], ['render'],
    ],
  });
  expect(typed.catalogInitialRenderFailure).toEqual({
    error: 'Error: initial catalog render failed', rpc: [], loading: true,
    trace: [['initial-render-throw']],
  });
  expect(typed.catalogCatchRenderFailure).toEqual({
    error: 'Error: catch catalog render failed', loading: false,
    trace: [['render', 1], ['access', '57000'], ['render', 2]],
  });
  expect(typed.open).toEqual({
    missingContext: { value: 'checkout', trace: [['context'], ['checkout', null]] },
    contextFailure: { value: false, trace: [['context']] },
    contextNoBusiness: { value: false, trace: [['context']] },
    warmRefresh: { value: 'silent', trace: [['silent', true]] },
    cacheRefresh: { value: 'silent', trace: [['silent', true]] },
    catalogRefresh: { value: 'silent', trace: [['silent', true]] },
    cold: { value: 'checkout', trace: [['checkout', null]] },
    error: { value: 'checkout', trace: [['checkout', null]] },
    ready: { value: true, trace: [['render']] },
    catalogReadyUnloaded: { value: true, trace: [['render']] },
    submitting: { value: false, trace: [] },
  });
});

async function collectValidationAndPending(page: Page) {
  return page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const api: any = app.MatchaLunaApp?.domains?.workspace || app;
    const h = app.__phase4iWorkspaceHarness;
    const validBase = () => {
      h.reset();
      app.posCheckout.shift = { shift_id: 'shift-1', is_training: false };
      app.posCheckout.shiftStatus = { shift_id: 'shift-1' };
      app.posCheckout.paymentMethod = 'cash';
      app.posCheckout.cashReceived = '200.00';
      app.posCheckout.referenceNumber = '';
      app.posCheckout.catalogChanged = false;
      app.posCartLines = () => [h.line()];
      app.posCartTotalCentavos = () => 17_000;
    };
    const info = (value: Record<string, unknown>) => ({
      value, keys: Object.keys(value),
    });
    const scenarios: Record<string, any> = {};

    validBase();
    app.posCheckout.pending = { rpcArgs: { p_cash_tendered_centavos: 25_000 } };
    app.posCheckout.refreshing = true;
    scenarios.pending = info(api.posCheckoutValidation());
    validBase(); app.posCheckout.refreshing = true;
    scenarios.refreshing = info(api.posCheckoutValidation());
    validBase(); app.posCheckout.checkoutRefreshRequired = true;
    scenarios.refreshRequired = info(api.posCheckoutValidation());
    validBase(); app.posCheckout.shiftLoading = true;
    scenarios.shiftLoading = info(api.posCheckoutValidation());
    validBase(); app.posCheckout.shift = null;
    scenarios.noShift = info(api.posCheckoutValidation());
    validBase(); app.posCheckout.shiftStatus.shift_id = 'shift-2';
    scenarios.shiftChanged = info(api.posCheckoutValidation());
    validBase(); app.posCartLines = () => [];
    scenarios.empty = info(api.posCheckoutValidation());
    validBase(); app.posCheckout.catalogChanged = true;
    scenarios.catalogChanged = info(api.posCheckoutValidation());
    validBase(); app.posCartLines = () => [h.line({ stale: true })];
    scenarios.staleLine = info(api.posCheckoutValidation());
    for (const [name, total] of [
      ['zeroTotal', 0], ['negativeTotal', -1], ['fractionTotal', 1.5],
      ['tooLarge', 100_000_000_001], ['unsafe', Number.MAX_SAFE_INTEGER + 1],
    ] as const) {
      validBase(); app.posCartTotalCentavos = () => total;
      scenarios[name] = info(api.posCheckoutValidation());
    }
    validBase(); app.posCartTotalCentavos = () => 100_000_000_000;
    app.posCheckout.cashReceived = '1000000000.00';
    scenarios.maxTotal = info(api.posCheckoutValidation());
    validBase(); app.posCheckout.referenceNumber = ` ${'x'.repeat(120)} `;
    scenarios.reference120 = info(api.posCheckoutValidation());
    validBase(); app.posCheckout.referenceNumber = 'x'.repeat(121);
    scenarios.reference121 = info(api.posCheckoutValidation());
    validBase(); app.posCheckout.referenceNumber = '😀'.repeat(60);
    scenarios.referenceEmoji120 = info(api.posCheckoutValidation());
    validBase(); app.posCheckout.referenceNumber = `${'😀'.repeat(60)}x`;
    scenarios.referenceEmoji121 = info(api.posCheckoutValidation());
    for (const [name, cash] of [
      ['cashSyntax', '17.001'], ['cashText', 'abc'], ['cashLow', '169.99'],
      ['cashExact', '170'], ['cashHigher', '200.25'],
    ] as const) {
      validBase(); app.posCheckout.cashReceived = cash;
      scenarios[name] = info(api.posCheckoutValidation());
    }
    for (const method of ['gcash', 'gotyme', 'GCash', '', 'card']) {
      validBase(); app.posCheckout.paymentMethod = method;
      scenarios[`method:${method}`] = info(api.posCheckoutValidation());
    }

    const precedence: Record<string, any> = {};
    validBase();
    app.posCheckout.pending = { rpcArgs: { p_cash_tendered_centavos: 777 } };
    app.posCheckout.refreshing = true;
    app.posCheckout.checkoutRefreshRequired = true;
    app.posCheckout.shiftLoading = true;
    app.posCheckout.shift = null;
    app.posCartLines = () => { throw new Error('pending precedence reached cart'); };
    precedence.pending = info(api.posCheckoutValidation());
    validBase();
    app.posCheckout.refreshing = true;
    app.posCheckout.checkoutRefreshRequired = true;
    app.posCheckout.shiftLoading = true;
    app.posCheckout.shift = null;
    app.posCartLines = () => { throw new Error('refreshing precedence reached cart'); };
    precedence.refreshing = info(api.posCheckoutValidation());
    validBase();
    app.posCheckout.checkoutRefreshRequired = true;
    app.posCheckout.shiftLoading = true;
    app.posCheckout.shift = null;
    precedence.refreshRequired = info(api.posCheckoutValidation());
    validBase();
    app.posCheckout.shiftLoading = true;
    app.posCheckout.shift = null;
    precedence.shiftLoading = info(api.posCheckoutValidation());
    validBase();
    app.posCheckout.shift = null;
    app.posCartLines = () => [];
    precedence.noShift = info(api.posCheckoutValidation());
    validBase();
    app.posCheckout.shiftStatus.shift_id = 'other-shift';
    app.posCartLines = () => [];
    precedence.shiftChanged = info(api.posCheckoutValidation());
    validBase();
    app.posCartLines = () => [];
    app.posCheckout.catalogChanged = true;
    precedence.empty = info(api.posCheckoutValidation());
    validBase();
    app.posCheckout.catalogChanged = true;
    app.posCartTotalCentavos = () => 0;
    app.posCheckout.referenceNumber = 'x'.repeat(121);
    precedence.catalogChanged = info(api.posCheckoutValidation());
    validBase();
    app.posCartTotalCentavos = () => 0;
    app.posCheckout.referenceNumber = 'x'.repeat(121);
    precedence.total = info(api.posCheckoutValidation());
    validBase();
    app.posCheckout.referenceNumber = 'x'.repeat(121);
    app.posCheckout.cashReceived = '17.001';
    precedence.reference = info(api.posCheckoutValidation());
    validBase();
    app.posCheckout.cashReceived = '17.001';
    precedence.cashSyntax = info(api.posCheckoutValidation());

    validBase();
    app.posCheckout.paymentMethod = 'cash';
    app.posCheckout.referenceNumber = '  REF-1  ';
    app.session.user.id = 77;
    app.posContext.businessId = 88;
    let cartReads = 0;
    app.posCartLines = () => {
      cartReads += 1;
      if (cartReads === 1) return [
        h.line(),
        h.line({
          key: 'product-2|version-2|aya|2', productId: 2,
          productVersionId: 3, quantity: '2', matchaOptionId: 9,
          matchaOptionRevision: '4', matchaOptionCode: 'aya',
          matchaOptionName: 'Aya no Mori', matchaSurchargeCentavos: 8_000,
        }),
      ];
      return [h.line({ key: 'snapshot-only', name: 'Snapshot Name' })];
    };
    app.posUuid = () => 'uuid-live';
    const OriginalDate = app.Date;
    const FixedDate: any = function (...args: any[]) {
      return new OriginalDate(args.length ? args[0] : '2026-11-03T01:02:03.000Z');
    };
    FixedDate.now = OriginalDate.now.bind(OriginalDate);
    FixedDate.parse = OriginalDate.parse.bind(OriginalDate);
    FixedDate.UTC = OriginalDate.UTC.bind(OriginalDate);
    FixedDate.prototype = OriginalDate.prototype;
    (app as Record<string, any>).Date = FixedDate;
    const cashRecord = api.buildPosPendingSale({
      valid: true, error: '', cashCentavos: 20_025,
    });
    (app as Record<string, any>).Date = OriginalDate;
    const cashShape = {
      recordKeys: Object.keys(cashRecord),
      argsKeys: Object.keys(cashRecord.rpcArgs),
      itemKeys: cashRecord.rpcArgs.p_items.map((item: object) => Object.keys(item)),
      snapshotKeys: cashRecord.cartSnapshot.map((item: object) => Object.keys(item)),
      cartReads,
      record: cashRecord,
    };

    validBase();
    app.posCheckout.paymentMethod = 'gcash';
    app.posCheckout.referenceNumber = '   ';
    app.posCheckout.shift.is_training = true;
    app.posCartLines = () => [h.line()];
    app.posUuid = () => 'uuid-gcash';
    const noncash = api.buildPosPendingSale({ valid: true, error: '', cashCentavos: null });
    noncash.createdAt = '[live ISO timestamp]';
    return { scenarios, precedence, cashShape, noncash };
  });
}

test('checkout validation and schema-3 pending construction preserve precedence, boundaries, shapes, and live values', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectValidationAndPending(typedPage);
  const classic = await collectValidationAndPending(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  const invalid = (error: string) => ({
    value: { valid: false, error }, keys: ['valid', 'error'],
  });
  expect(typed.scenarios.pending).toEqual({
    value: { valid: true, error: '', cashCentavos: 25_000 },
    keys: ['valid', 'error', 'cashCentavos'],
  });
  expect(typed.scenarios.refreshing).toEqual(invalid(
    'The register is syncing. Wait for the latest shift check before confirming payment.',
  ));
  expect(typed.scenarios.refreshRequired).toEqual(invalid(
    'Refresh the register before confirming payment.',
  ));
  expect(typed.scenarios.shiftLoading).toEqual(invalid(
    'The register shift is still loading.',
  ));
  expect(typed.scenarios.noShift).toEqual(invalid(
    'Open a shift before accepting a payment.',
  ));
  expect(typed.scenarios.shiftChanged).toEqual(invalid(
    'The active shift changed. Refresh before accepting payment.',
  ));
  expect(typed.scenarios.empty).toEqual(invalid('Add at least one product to the sale.'));
  expect(typed.scenarios.catalogChanged).toEqual(invalid(
    'The menu changed. Review the cart before charging the customer.',
  ));
  expect(typed.scenarios.staleLine).toEqual(typed.scenarios.catalogChanged);
  for (const key of ['zeroTotal', 'negativeTotal', 'fractionTotal', 'tooLarge', 'unsafe']) {
    expect(typed.scenarios[key]).toEqual(invalid(
      'This order total is outside the supported range.',
    ));
  }
  expect(typed.scenarios.maxTotal.value).toEqual({
    valid: true, error: '', cashCentavos: 100_000_000_000,
  });
  expect(typed.scenarios.reference120.value.valid).toBe(true);
  expect(typed.scenarios.referenceEmoji120.value.valid).toBe(true);
  expect(typed.scenarios.reference121).toEqual(invalid(
    'Keep the payment reference under 120 characters.',
  ));
  expect(typed.scenarios.referenceEmoji121).toEqual(typed.scenarios.reference121);
  expect(typed.scenarios.cashSyntax).toEqual(invalid(
    'Enter cash received using pesos and up to 2 decimal places.',
  ));
  expect(typed.scenarios.cashText).toEqual(typed.scenarios.cashSyntax);
  expect(typed.scenarios.cashLow).toEqual(invalid(
    'Cash received is less than the order total.',
  ));
  expect(typed.scenarios.cashExact.value).toEqual({
    valid: true, error: '', cashCentavos: 17_000,
  });
  expect(typed.scenarios.cashHigher.value.cashCentavos).toBe(20_025);
  expect(typed.scenarios['method:gcash'].value).toEqual({
    valid: true, error: '', cashCentavos: null,
  });
  expect(typed.scenarios['method:gotyme'].value).toEqual(
    typed.scenarios['method:gcash'].value,
  );
  for (const key of ['method:GCash', 'method:', 'method:card']) {
    expect(typed.scenarios[key]).toEqual(invalid('Choose Cash, GCash, or GoTyme.'));
  }
  expect(typed.precedence).toEqual({
    pending: {
      value: { valid: true, error: '', cashCentavos: 777 },
      keys: ['valid', 'error', 'cashCentavos'],
    },
    refreshing: typed.scenarios.refreshing,
    refreshRequired: typed.scenarios.refreshRequired,
    shiftLoading: typed.scenarios.shiftLoading,
    noShift: typed.scenarios.noShift,
    shiftChanged: typed.scenarios.shiftChanged,
    empty: typed.scenarios.empty,
    catalogChanged: typed.scenarios.catalogChanged,
    total: typed.scenarios.zeroTotal,
    reference: typed.scenarios.reference121,
    cashSyntax: typed.scenarios.cashSyntax,
  });
  expect(typed.cashShape).toMatchObject({
    recordKeys: [
      'schemaVersion', 'rpcName', 'userId', 'businessId', 'createdAt',
      'rpcArgs', 'cartSnapshot',
    ],
    argsKeys: [
      'p_business_id', 'p_shift_id', 'p_is_training', 'p_client_sale_id',
      'p_items', 'p_payment_method', 'p_cash_tendered_centavos',
      'p_reference_number', 'p_note',
    ],
    itemKeys: [
      ['product_id', 'product_version_id', 'quantity', 'matcha_option_id', 'matcha_option_revision'],
      ['product_id', 'product_version_id', 'quantity', 'matcha_option_id', 'matcha_option_revision'],
    ],
    snapshotKeys: [[
      'key', 'productId', 'productVersionId', 'name', 'size',
      'basePriceCentavos', 'priceCentavos', 'quantity', 'matchaOptionId',
      'matchaOptionRevision', 'matchaOptionCode', 'matchaOptionName',
      'matchaSurchargeCentavos',
    ]],
    cartReads: 2,
    record: {
      schemaVersion: 3, rpcName: 'pos_complete_shift_sale_v3',
      userId: '77', businessId: '88', createdAt: '2026-11-03T01:02:03.000Z',
      rpcArgs: {
        p_business_id: '88', p_shift_id: 'shift-1', p_is_training: false,
        p_client_sale_id: 'uuid-live', p_payment_method: 'cash',
        p_cash_tendered_centavos: 20_025, p_reference_number: 'REF-1',
        p_note: null,
      },
      cartSnapshot: [{ key: 'snapshot-only', name: 'Snapshot Name' }],
    },
  });
  expect(typed.cashShape.record.rpcArgs.p_items).toEqual([
    {
      product_id: 'product-1', product_version_id: 'version-1', quantity: 1,
      matcha_option_id: null, matcha_option_revision: null,
    },
    {
      product_id: '2', product_version_id: '3', quantity: 2,
      matcha_option_id: '9', matcha_option_revision: 4,
    },
  ]);
  expect(typed.noncash.rpcArgs).toMatchObject({
    p_is_training: true, p_payment_method: 'gcash',
    p_cash_tendered_centavos: null, p_reference_number: null,
  });
});

async function collectReviewAndErrors(page: Page) {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const api: any = app.MatchaLunaApp?.domains?.workspace || app;
    const h = app.__phase4iWorkspaceHarness;
    const codes = [
      '40001', '42501', '22003', '22023', '23514', '23505', '55000',
      'PGRST100', 'PGRST', 'pgrst100', '57000', '', null,
    ];
    const deterministic = codes.map((code) => api.posDeterministicError({ code }));
    const errorText = codes.map((code) => api.posCheckoutErrorText({ code }));
    const coercion = {
      deterministicNumeric: api.posDeterministicError({ code: 42501 }),
      errorNumeric: api.posCheckoutErrorText({ code: 42501 }),
      deterministicObject: api.posDeterministicError({
        code: { toString: () => '40001' },
      }),
      errorObject: api.posCheckoutErrorText({
        code: { toString: () => '42501' },
      }),
    };
    const throwingCodes: Record<string, string> = {};
    for (const [name, fn, input] of [
      [
        'deterministicGetter', api.posDeterministicError,
        Object.defineProperty({}, 'code', {
          get() { throw new Error('deterministic code getter failed'); },
        }),
      ],
      [
        'errorGetter', api.posCheckoutErrorText,
        Object.defineProperty({}, 'code', {
          get() { throw new Error('checkout code getter failed'); },
        }),
      ],
      [
        'deterministicString', api.posDeterministicError,
        { code: { toString() { throw new Error('deterministic String failed'); } } },
      ],
      [
        'errorString', api.posCheckoutErrorText,
        { code: { toString() { throw new Error('checkout String failed'); } } },
      ],
    ] as const) {
      try { fn(input); }
      catch (error) { throwingCodes[name] = String(error); }
    }

    h.reset();
    const pendingPromise = Promise.resolve('pending-submit');
    app.posCheckout.pending = { id: 'pending' };
    app.posCheckout.submitting = true;
    app.submitPosSale = () => {
      h.trace.push(['submit']);
      return pendingPromise;
    };
    const pendingReturn = api.reviewPosSale();
    const pendingResult = {
      exactPromise: pendingReturn === pendingPromise,
      value: await pendingReturn,
      trace: h.trace.slice(),
    };

    h.reset();
    app.renderPos = () => h.trace.push(['render']);
    app.posCheckout.submitting = true;
    app.posCheckout.confirming = true;
    app.posCheckout.error = 'keep';
    const submitting = api.reviewPosSale();
    const submittingResult = {
      value: submitting, confirming: app.posCheckout.confirming,
      error: app.posCheckout.error, trace: h.trace.slice(),
    };

    h.reset();
    app.renderPos = () => h.trace.push([
      'render', app.posCheckout.confirming, app.posCheckout.error,
    ]);
    app.posCheckout.confirming = true;
    app.posCheckout.error = '';
    app.posCheckoutValidation = () => ({ valid: false, error: 'invalid checkout' });
    const invalid = api.reviewPosSale();
    const invalidResult = {
      value: invalid, confirming: app.posCheckout.confirming,
      error: app.posCheckout.error, trace: h.trace.slice(),
    };

    h.reset();
    app.renderPos = () => h.trace.push([
      'render', app.posCheckout.confirming, app.posCheckout.error,
    ]);
    app.posCheckout.confirming = false;
    app.posCheckout.error = 'old';
    app.posCheckoutValidation = () => ({ valid: true, error: '', cashCentavos: 17_000 });
    const valid = api.reviewPosSale();
    const validResult = {
      value: valid, confirming: app.posCheckout.confirming,
      error: app.posCheckout.error, trace: h.trace.slice(),
    };

    h.reset();
    app.renderPos = () => h.trace.push(['render']);
    app.posCheckout.confirming = true;
    app.posCheckoutValidation = () => { throw new Error('validation getter failed'); };
    let thrown = '';
    try { api.reviewPosSale(); } catch (error) { thrown = String(error); }
    const thrownResult = {
      thrown, confirming: app.posCheckout.confirming, trace: h.trace.slice(),
    };

    const cancelScenario = (kind: string) => {
      h.reset();
      app.renderPos = () => h.trace.push([
        'render', app.posCheckout.confirming,
      ]);
      app.posCheckout.confirming = kind !== 'already-clear';
      if (kind === 'submitting') app.posCheckout.submitting = true;
      if (kind === 'pending') app.posCheckout.pending = { id: 1 };
      const value = api.cancelPosConfirmation();
      return {
        value, confirming: app.posCheckout.confirming, trace: h.trace.slice(),
      };
    };
    return {
      codes, deterministic, errorText, coercion, throwingCodes,
      pendingResult, submittingResult,
      invalidResult, validResult, thrownResult,
      cancel: {
        normal: cancelScenario('normal'),
        alreadyClear: cancelScenario('already-clear'),
        submitting: cancelScenario('submitting'),
        pending: cancelScenario('pending'),
      },
    };
  });
}

test('error tables and review/cancel preserve exact messages, booleans, promise identity, blocked paths, and render order', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectReviewAndErrors(typedPage);
  const classic = await collectReviewAndErrors(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed.deterministic).toEqual([
    true, true, true, true, true, true, true, true, true,
    false, false, false, false,
  ]);
  expect(typed.errorText).toEqual([
    'The menu changed while this sale was open. Review the updated prices before trying again.',
    'Your account cannot complete sales in this workspace.',
    'The sale details were rejected or exceed the supported range. Review the cart and payment, then try again.',
    'The sale details were rejected or exceed the supported range. Review the cart and payment, then try again.',
    'The sale details were rejected or exceed the supported range. Review the cart and payment, then try again.',
    'This retry ID belongs to different sale details. Check Recent sales before starting a new checkout.',
    'The register is not ready to accept sales. Ask an owner to check the POS setup.',
    'The sale could not be completed. Nothing was cleared; review it and try again.',
    'The sale could not be completed. Nothing was cleared; review it and try again.',
    'The sale could not be completed. Nothing was cleared; review it and try again.',
    'The sale could not be completed. Nothing was cleared; review it and try again.',
    'The sale could not be completed. Nothing was cleared; review it and try again.',
    'The sale could not be completed. Nothing was cleared; review it and try again.',
  ]);
  expect(typed.coercion).toEqual({
    deterministicNumeric: true,
    errorNumeric: 'Your account cannot complete sales in this workspace.',
    deterministicObject: true,
    errorObject: 'Your account cannot complete sales in this workspace.',
  });
  expect(typed.throwingCodes).toEqual({
    deterministicGetter: 'Error: deterministic code getter failed',
    errorGetter: 'Error: checkout code getter failed',
    deterministicString: 'Error: deterministic String failed',
    errorString: 'Error: checkout String failed',
  });
  expect(typed.pendingResult).toEqual({
    exactPromise: true, value: 'pending-submit', trace: [['submit']],
  });
  expect(typed.submittingResult).toEqual({
    value: false, confirming: true, error: 'keep', trace: [],
  });
  expect(typed.invalidResult).toEqual({
    value: false, confirming: false, error: 'invalid checkout',
    trace: [['render', false, 'invalid checkout']],
  });
  expect(typed.validResult).toEqual({
    value: true, confirming: true, error: '',
    trace: [['render', true, '']],
  });
  expect(typed.thrownResult).toEqual({
    thrown: 'Error: validation getter failed', confirming: true, trace: [],
  });
  expect(typed.cancel).toEqual({
    normal: { value: true, confirming: false, trace: [['render', false]] },
    alreadyClear: { value: true, confirming: false, trace: [['render', false]] },
    submitting: { value: false, confirming: true, trace: [] },
    pending: { value: false, confirming: true, trace: [] },
  });
});

async function collectSubmission(page: Page) {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const api: any = app.MatchaLunaApp?.domains?.workspace || app;
    const h = app.__phase4iWorkspaceHarness;
    const originalCurrent = app.posSubmitRequestStillCurrent;
    const originalDeterministic = api.posDeterministicError;
    const originalErrorText = api.posCheckoutErrorText;
    const record = () => ({
      schemaVersion: 3,
      rpcName: 'pos_complete_shift_sale_v3',
      userId: 'workspace-user', businessId: 'business-1',
      createdAt: '2026-11-03T00:00:00.000Z',
      rpcArgs: { p_business_id: 'business-1', p_client_sale_id: 'client-1' },
      cartSnapshot: [{ key: 'line-1' }],
    });
    const install = (rpc: (name: string, args: unknown) => unknown) => {
      h.reset();
      app.posCheckout.shift = { shift_id: 'shift-1', is_training: false };
      app.posCheckout.shiftStatus = { shift_id: 'shift-1' };
      app.posCheckout.cart = { line: { key: 'line-1' } };
      app.posCheckout.paymentMethod = 'cash';
      app.posCheckout.cashReceived = '200';
      app.posCheckout.referenceNumber = 'REF';
      app.posCheckout.confirming = true;
      app.posCheckout.notice = 'old notice';
      app.posCheckoutValidation = () => ({
        valid: true, error: '', cashCentavos: 20_000,
      });
      app.buildPosPendingSale = () => {
        h.trace.push(['build']);
        return record();
      };
      app.posSavePending = (pending: unknown) => {
        h.trace.push(['save', app.posCheckout.submitting, app.posCheckoutSubmitGeneration]);
        app.posCheckout.pending = pending;
      };
      app.posClearPending = () => {
        h.trace.push(['clear']);
        app.posCheckout.pending = null;
      };
      app.renderPos = () => h.trace.push([
        'render', app.posCheckout.submitting, app.posCheckout.confirming,
        app.posCheckout.error, app.posCheckout.notice,
      ]);
      app.refreshPosAfterMutation = () => {
        h.trace.push(['refresh']);
        return Promise.resolve(true);
      };
      app.posSubmitRequestStillCurrent = originalCurrent;
      app.posDeterministicError = originalDeterministic;
      app.posCheckoutErrorText = originalErrorText;
      app.rpcRows = (result: any) => {
        h.trace.push(['rows']);
        if (result?.error) throw result.error;
        return result?.data || [];
      };
      app.cloud.client = {
        rpc: (name: string, args: unknown) => {
          h.trace.push(['rpc', name, args, app.posCheckout.submitting]);
          return rpc(name, args);
        },
      };
    };
    const state = () => ({
      submitting: app.posCheckout.submitting,
      confirming: app.posCheckout.confirming,
      pending: app.posCheckout.pending,
      cart: app.posCheckout.cart,
      catalogChanged: app.posCheckout.catalogChanged,
      paymentMethod: app.posCheckout.paymentMethod,
      cashReceived: app.posCheckout.cashReceived,
      referenceNumber: app.posCheckout.referenceNumber,
      error: app.posCheckout.error,
      notice: app.posCheckout.notice,
      lastReceipt: app.posCheckout.lastReceipt,
      generation: app.posCheckoutSubmitGeneration,
    });
    const capture = async () => {
      try { return { value: await api.submitPosSale(), rejected: '' }; }
      catch (error) { return { value: null, rejected: String(error) }; }
    };

    install(async () => {
      h.captureSuccessOrder = true;
      return { data: [{
        sale_id: 'sale-1', receipt_number: 'ML-1', shift_id: 'shift-1',
      }] };
    });
    h.captureSuccessOrder = false;
    h.successOrder = [];
    const successCheckout = app.posCheckout;
    app.posCheckout = new Proxy(successCheckout, {
      set(target, property, value) {
        if (h.captureSuccessOrder) h.successOrder.push(['set', String(property)]);
        return Reflect.set(target, property, value);
      },
    });
    app.posClearPending = () => {
      h.trace.push(['clear']);
      h.successOrder.push(['helper', 'clearPending']);
      app.posCheckout.pending = null;
    };
    app.renderPos = () => {
      h.trace.push([
        'render', app.posCheckout.submitting, app.posCheckout.confirming,
        app.posCheckout.error, app.posCheckout.notice,
      ]);
      if (h.captureSuccessOrder) h.successOrder.push(['render']);
    };
    app.refreshPosAfterMutation = () => {
      h.trace.push(['refresh']);
      h.successOrder.push(['refresh']);
      return Promise.resolve(true);
    };
    app.posCheckoutSubmitGeneration = '60';
    const successCall = await capture();
    await Promise.resolve();
    const success = {
      call: successCall, state: state(), trace: h.trace.slice(),
      successOrder: h.successOrder.slice(),
    };

    install(async () => ({ data: [{
      sale_id: 'sale-retry', receipt_number: 'ML-RETRY',
    }] }));
    const retryRecord = { ...record(), rpcName: '', rpcArgs: { retry: true } };
    app.posCheckout.pending = retryRecord;
    app.buildPosPendingSale = () => { throw new Error('must not build'); };
    app.posSavePending = () => { throw new Error('must not save'); };
    const retryCall = await capture();
    await Promise.resolve();
    const retry = { call: retryCall, state: state(), trace: h.trace.slice() };

    install(async () => ({ data: [] }));
    app.posCheckout.submitting = true;
    const duplicate = await api.submitPosSale();
    const duplicateTrace = h.trace.slice();

    const entryGuards: Record<string, unknown> = {};
    for (const kind of ['session', 'user', 'business']) {
      install(async () => { throw new Error('guarded submission RPC ran'); });
      if (kind === 'session') app.session = null;
      if (kind === 'user') app.session = {};
      if (kind === 'business') app.posContext.businessId = '';
      entryGuards[kind] = {
        value: await api.submitPosSale(), state: state(), trace: h.trace.slice(),
      };
    }

    install(async () => ({ data: [] }));
    app.posCheckoutValidation = () => ({ valid: false, error: 'validation failed' });
    const invalid = await api.submitPosSale();
    const invalidResult = { value: invalid, state: state(), trace: h.trace.slice() };

    install(async () => ({ data: [] }));
    app.buildPosPendingSale = () => { throw new Error('build failed'); };
    const buildFailure = await capture();
    const buildFailureResult = {
      call: buildFailure, state: state(), trace: h.trace.slice(),
    };

    install(async () => ({ data: [] }));
    app.posSavePending = () => { h.trace.push(['save-throw']); throw new Error('save failed'); };
    const saveFailure = await capture();
    const saveFailureResult = {
      call: saveFailure, state: state(), trace: h.trace.slice(),
    };

    install(async () => ({ data: [] }));
    app.renderPos = () => { h.trace.push(['render-throw']); throw new Error('pre-rpc render failed'); };
    const renderFailure = await capture();
    const renderFailureResult = {
      call: renderFailure, state: state(), trace: h.trace.slice(),
    };

    const uncertainScenarios: Record<string, any> = {};
    for (const [name, rpc] of [
      ['syncThrow', () => { throw new Error('sync transport'); }],
      ['rejection', () => Promise.reject(new Error('async transport'))],
      ['resolvedError', () => Promise.resolve({ error: { code: '57000' } })],
      ['missingReceipt', () => Promise.resolve({ data: [{}] })],
    ] as const) {
      install(rpc);
      const call = await capture();
      uncertainScenarios[name] = { call, state: state(), trace: h.trace.slice() };
    }
    install(async () => ({ data: [] }));
    app.cloud.client = null;
    const missingClientCall = await capture();
    uncertainScenarios.missingClient = {
      call: missingClientCall, state: state(), trace: h.trace.slice(),
    };

    const staleScenarios: Record<string, any> = {};
    for (const kind of ['generation', 'user', 'business']) {
      install(async () => {
        if (kind === 'generation') app.posCheckoutSubmitGeneration += 1;
        if (kind === 'user') app.session.user.id = 'other-user';
        if (kind === 'business') app.posContext.businessId = 'other-business';
        return { data: [{ sale_id: 'late', receipt_number: 'LATE' }] };
      });
      const call = await capture();
      staleScenarios[kind] = { call, state: state(), trace: h.trace.slice() };
    }

    const staleFailureScenarios: Record<string, any> = {};
    for (const kind of ['generation', 'user', 'business']) {
      install(async () => {
        if (kind === 'generation') app.posCheckoutSubmitGeneration += 1;
        if (kind === 'user') app.session.user.id = 'other-user';
        if (kind === 'business') app.posContext.businessId = 'other-business';
        throw new Error(`late ${kind} failure`);
      });
      const call = await capture();
      staleFailureScenarios[kind] = {
        call, state: state(), trace: h.trace.slice(),
      };
    }

    install(async () => { throw { code: '40001' }; });
    const changedCall = await capture();
    await Promise.resolve();
    const changed = { call: changedCall, state: state(), trace: h.trace.slice() };

    const deterministic: Record<string, any> = {};
    for (const code of ['42501', '22003', '22023', '23514', '23505', '55000', 'PGRST116']) {
      install(async () => { throw { code }; });
      const call = await capture();
      deterministic[code] = { call, state: state(), trace: h.trace.slice() };
    }

    install(async () => ({ data: [{ sale_id: 'sale-refresh', receipt_number: 'ML-R' }] }));
    app.refreshPosAfterMutation = () => {
      h.trace.push(['refresh-reject']);
      return Promise.reject(new Error('refresh failed'));
    };
    const refreshRejectedCall = await capture();
    await Promise.resolve();
    await Promise.resolve();
    const refreshRejected = {
      call: refreshRejectedCall, state: state(), trace: h.trace.slice(),
    };

    install(async () => ({ data: [{ sale_id: 'sale-partial', receipt_number: 'ML-P' }] }));
    app.posClearPending = () => { h.trace.push(['clear-throw']); throw new Error('clear failed'); };
    const successCleanupCall = await capture();
    const successCleanupFailure = {
      call: successCleanupCall, state: state(), trace: h.trace.slice(),
    };

    install(async () => { throw { code: '42501' }; });
    app.posClearPending = () => { h.trace.push(['clear-throw']); throw new Error('error clear failed'); };
    const errorCleanupCall = await capture();
    const errorCleanupFailure = {
      call: errorCleanupCall, state: state(), trace: h.trace.slice(),
    };

    return {
      success, retry, duplicate, duplicateTrace, entryGuards, invalidResult,
      buildFailureResult, saveFailureResult, renderFailureResult,
      uncertainScenarios, staleScenarios, staleFailureScenarios,
      changed, deterministic,
      refreshRejected, successCleanupFailure, errorCleanupFailure,
    };
  });
}

test('sale submission preserves persistence, locking, RPC selection, stale work, deterministic recovery, and partial failures', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectSubmission(typedPage);
  const classic = await collectSubmission(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed.success).toMatchObject({
    call: { value: true, rejected: '' },
    state: {
      submitting: false, confirming: false, pending: null, cart: {},
      catalogChanged: false, paymentMethod: 'cash', cashReceived: '',
      referenceNumber: '', error: '', notice: '',
      lastReceipt: { sale_id: 'sale-1', receipt_number: 'ML-1', shift_id: 'shift-1' },
      generation: 61,
    },
  });
  expect(typed.success.trace).toEqual([
    ['build'], ['save', false, '60'], ['render', true, false, '', 'old notice'],
    ['rpc', 'pos_complete_shift_sale_v3', {
      p_business_id: 'business-1', p_client_sale_id: 'client-1',
    }, true],
    ['rows'], ['clear'], ['render', false, false, '', ''], ['refresh'],
  ]);
  expect(typed.success.successOrder).toEqual([
    ['set', 'submitting'],
    ['helper', 'clearPending'], ['set', 'pending'],
    ['set', 'cart'], ['set', 'catalogChanged'],
    ['set', 'paymentMethod'], ['set', 'cashReceived'],
    ['set', 'referenceNumber'], ['set', 'confirming'],
    ['set', 'error'], ['set', 'notice'], ['set', 'lastReceipt'],
    ['render'], ['refresh'],
  ]);
  expect(typed.retry).toMatchObject({
    call: { value: true, rejected: '' },
    state: { pending: null, lastReceipt: { sale_id: 'sale-retry', receipt_number: 'ML-RETRY' } },
  });
  expect(typed.retry.trace[0]).toEqual(['render', true, false, '', 'old notice']);
  expect(typed.retry.trace[1]).toEqual(['rpc', 'pos_complete_sale', { retry: true }, true]);
  expect(typed.duplicate).toBe(false);
  expect(typed.duplicateTrace).toEqual([]);
  for (const kind of ['session', 'user', 'business']) {
    expect(typed.entryGuards[kind]).toMatchObject({
      value: false,
      state: {
        submitting: false, confirming: true, pending: null,
        generation: 60,
      },
      trace: [],
    });
  }
  expect(typed.invalidResult).toMatchObject({
    value: false,
    state: { confirming: false, error: 'validation failed', submitting: false },
    trace: [['render', false, false, 'validation failed', 'old notice']],
  });
  expect(typed.buildFailureResult).toMatchObject({
    call: { value: null, rejected: 'Error: build failed' },
    state: { submitting: false, confirming: true, pending: null, generation: 60 },
    trace: [],
  });
  expect(typed.saveFailureResult).toMatchObject({
    call: { value: null, rejected: 'Error: save failed' },
    state: { submitting: false, confirming: true, pending: null, generation: 60 },
    trace: [['build'], ['save-throw']],
  });
  expect(typed.renderFailureResult).toMatchObject({
    call: { value: null, rejected: 'Error: pre-rpc render failed' },
    state: { submitting: true, confirming: false, generation: 61 },
    trace: [['build'], ['save', false, 60], ['render-throw']],
  });
  for (const name of ['syncThrow', 'rejection', 'resolvedError', 'missingReceipt', 'missingClient']) {
    expect(typed.uncertainScenarios[name]).toMatchObject({
      call: { value: false, rejected: '' },
      state: {
        submitting: false,
        error: '',
      },
    });
    expect(typed.uncertainScenarios[name].state.pending).not.toBeNull();
    expect(typed.uncertainScenarios[name].state.notice).toBe(
      typed.uncertainScenarios.syncThrow.state.notice,
    );
  }
  expect(typed.uncertainScenarios.syncThrow.state.notice).toMatch(
    /^The connection stopped before a receipt came back\. Retry this exact sale safely.*do not create a new sale\.$/,
  );
  for (const kind of ['generation', 'user', 'business']) {
    expect(typed.staleScenarios[kind]).toMatchObject({
      call: { value: false, rejected: '' },
      state: { submitting: true },
    });
    expect(typed.staleScenarios[kind].trace).not.toContainEqual(['clear']);
    expect(typed.staleFailureScenarios[kind]).toMatchObject({
      call: { value: false, rejected: '' },
      state: { submitting: true },
    });
    expect(typed.staleFailureScenarios[kind].trace).not.toContainEqual(['clear']);
  }
  expect(typed.changed).toMatchObject({
    call: { value: false, rejected: '' },
    state: {
      submitting: false, pending: null, catalogChanged: true,
      error: 'The menu changed while this sale was open. Review the updated prices before trying again.',
    },
  });
  expect(typed.changed.trace).toContainEqual(['refresh']);
  for (const code of ['42501', '22003', '22023', '23514', '23505', '55000', 'PGRST116']) {
    expect(typed.deterministic[code]).toMatchObject({
      call: { value: false, rejected: '' },
      state: { submitting: false, pending: null, confirming: false, notice: 'old notice' },
    });
  }
  expect(typed.deterministic['42501'].state.error).toBe(
    'Your account cannot complete sales in this workspace.',
  );
  expect(typed.refreshRejected).toMatchObject({
    call: { value: true, rejected: '' },
    state: { pending: null, lastReceipt: { sale_id: 'sale-refresh', receipt_number: 'ML-R' } },
  });
  expect(typed.refreshRejected.trace).toContainEqual(['refresh-reject']);
  expect(typed.successCleanupFailure).toMatchObject({
    call: { value: false, rejected: '' },
    state: { submitting: false },
  });
  expect(typed.successCleanupFailure.state.notice).toBe(
    typed.uncertainScenarios.syncThrow.state.notice,
  );
  expect(typed.successCleanupFailure.trace).toContainEqual(['clear-throw']);
  expect(typed.errorCleanupFailure).toMatchObject({
    call: { value: null, rejected: 'Error: error clear failed' },
    state: { submitting: false },
  });
});
