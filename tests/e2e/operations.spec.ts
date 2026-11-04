import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  activeRuntimeFiles,
  posOperationsNames,
  protectedPosOperationsNames,
  transitionRuntimeFiles,
} from './operations-contract';

const posViewNames = [
  'posPaymentLabel', 'posSummaryHtml', 'posReceiptHtml',
  'posProductCardHtml', 'posCatalogHtml', 'posCashSuggestions',
  'updatePosPaymentPreview', 'posCartHtml', 'posSalesRowsHtml',
  'posRecentHtml', 'posShiftBarHtml', 'posNoShiftGateHtml',
  'managePosMenu', 'posWorkspaceHtml', 'posMobileOrderBarHtml',
  'focusPosCart', 'posSyncStatusHtml', 'posCriticalRefreshNoticeHtml',
  'renderPosPreservingInteraction',
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
    h.reset = () => {
      h.trace = [];
      h.rpc = [];
      app.session = { user: { id: 'ops-user', email: 'owner@example.test' } };
      app.cloud = {
        connected: true,
        client: {
          rpc: async (name: string, args: unknown) => {
            h.rpc.push([name, args]);
            throw new Error(`Unexpected RPC: ${name}`);
          },
        },
      };
      app.posContext = {
        loaded: true, loading: false, businessId: 'business-1',
        businessName: 'Matcha Luna', role: 'owner', publications: {}, error: '',
      };
      app.posCheckout = app.freshPosCheckout();
      app.posCheckout.loaded = true;
      app.posCheckout.reportMode = 'live';
      app.posCheckout.shiftStatus = {
        register_name: 'Main register', business_timezone: 'Asia/Manila',
        can_view_costs: true, can_open_live: true, can_open_training: true,
        can_close_shift: true, can_void_sales: true,
      };
      app.posOpsModal = app.freshPosOpsModal();
      app.posSalesHistory = app.freshPosSalesHistory();
      app.posOpsGeneration = 10;
      app.posHistoryGeneration = 20;
      app.posMediaGeneration = 30;
      app.posOpsModalReturnFocus = null;
      app.POS_HISTORY_PAGE_SIZE = 20;
      app.POS_SHIFT_HISTORY_PAGE_SIZE = 20;
      app.APP_BRAND_NAME = 'Matcha Luna';
      app.APP_BRAND_SLUG = 'matcha-luna';
      document.body.classList.remove('pos-training', 'modal-open');
      const modal = document.getElementById('posOpsModal');
      const content = document.getElementById('posOpsModalContent');
      if (modal) modal.hidden = true;
      if (content) content.innerHTML = '';
    };
    app.__phase4jOperationsHarness = h;
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
  await page.route('**/index.html?test=1&operations-transition=1', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.goto('index.html?test=1&operations-transition=1', { waitUntil: 'load' });
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
  await installHarness(page);
  return page;
}

async function openPair(
  page: Page,
  context: BrowserContext,
): Promise<[Page, Page]> {
  await openPrimary(page);
  return [page, await openClassic(context)];
}

test('typed Operations preserves API, POS composition, registration, descriptors, runtime paths, and fallback', async ({ page, context }) => {
  await openPrimary(page);
  const contract = await page.evaluate(({ operations, views }) => {
    const root = window as typeof window & Record<string, any>;
    const facade = root.MatchaLunaApp;
    const pos = facade.domains.pos as Record<string, any>;
    const descriptor = (target: object, name: string) => {
      const value = Object.getOwnPropertyDescriptor(target, name)!;
      return {
        configurable: value.configurable, enumerable: value.enumerable,
        writable: value.writable, get: typeof value.get, set: typeof value.set,
      };
    };
    const originals = Object.fromEntries(operations.map((name) => [name, pos[name]]));
    const roundTrips = operations.map((name, index) => {
      const viaDomain = () => index;
      pos[name] = viaDomain;
      const domainRoot = root[name] === viaDomain;
      const domainLegacy = facade.domains.legacy[name] === viaDomain;
      const viaRoot = () => index + 100;
      root[name] = viaRoot;
      const rootDomain = pos[name] === viaRoot;
      const rootLegacy = facade.domains.legacy[name] === viaRoot;
      pos[name] = originals[name];
      return { domainRoot, domainLegacy, rootDomain, rootLegacy };
    });
    return {
      version: facade.contractVersion,
      contractLength: facade.contractNames.length,
      domainOrder: Object.keys(facade.domains),
      domainSizes: Object.fromEntries(Object.entries(facade.domains)
        .map(([name, value]) => [name, Object.keys(value as object).length])),
      posOrder: Object.keys(pos),
      protected: operations.filter((name) => facade.contractNames.includes(name)),
      rootMatches: operations.map((name) => root[name] === pos[name]),
      namespaceDescriptors: operations.map((name) => descriptor(pos, name)),
      rootDescriptors: operations.map((name) => descriptor(root, name)),
      roundTrips,
      activeRuntime: Array.from(
        document.querySelectorAll<HTMLScriptElement>('script[data-matcha-luna-runtime]'),
        (script) => script.dataset.matchaLunaRuntime,
      ),
      viewTail: Object.keys(pos).slice(-views.length),
    };
  }, { operations: [...posOperationsNames], views: [...posViewNames] });

  const classic = await openClassic(context);
  const classicRuntime = await classic.evaluate(() => ({
    modules: document.querySelectorAll('script[type="module"]').length,
    scripts: Array.from(
      document.querySelectorAll<HTMLScriptElement>('script[src*="/assets/js/"]'),
      (script) => new URL(script.src).pathname.split('/').pop(),
    ),
    hasPosDomain: Boolean(
      (window as typeof window & Record<string, any>).MatchaLunaApp?.domains?.pos,
    ),
  }));
  await classic.close();

  const response = await page.request.get(
    'http://127.0.0.1:4173/Scoopies/assets/js/pos-operations.js',
  );
  const served = (await response.text()).replace(/\r\n?/g, '\n');
  const source = readFileSync(resolve(process.cwd(), 'assets/js/pos-operations.js'), 'utf8')
    .replace(/\r\n?/g, '\n');
  const bytes = Buffer.from(served, 'utf8');
  const sha256 = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  const gitBlob = createHash('sha1')
    .update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');
  const main = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8');
  const workspaceSlot = main.indexOf('registerWorkspaceModule(facade, window)');
  const operationsSlot = main.indexOf('registerPosOperationsModule(facade, window)');
  const publicationSlot = main.indexOf('registerPublicationModule(facade, window)');

  expect(contract).toMatchObject({
    version: 1,
    contractLength: 175,
    domainOrder: [
      'core', 'runtime', 'state', 'costing', 'catalog', 'stocks', 'workspace', 'pos',
      'publication', 'modals', 'support', 'events', 'bootstrap', 'legacy',
    ],
    domainSizes: {
      core: 15, runtime: 4, state: 141, costing: 37, catalog: 81, stocks: 63,
      workspace: 18, pos: 79, publication: 10, modals: 46,
      support: 3, events: 1, bootstrap: 1,
    },
    posOrder: [...posOperationsNames, ...posViewNames],
    protected: protectedPosOperationsNames,
    activeRuntime: activeRuntimeFiles,
    viewTail: posViewNames,
  });
  expect(contract.rootMatches).toEqual(posOperationsNames.map(() => true));
  expect(contract.namespaceDescriptors).toEqual(posOperationsNames.map(() => ({
    configurable: true, enumerable: true, writable: true,
    get: 'undefined', set: 'undefined',
  })));
  expect(contract.rootDescriptors).toEqual(posOperationsNames.map(() => ({
    configurable: true, enumerable: true, writable: undefined,
    get: 'function', set: 'function',
  })));
  expect(contract.roundTrips).toEqual(posOperationsNames.map((name) => ({
    domainRoot: true,
    domainLegacy: (protectedPosOperationsNames as readonly string[]).includes(name),
    rootDomain: true,
    rootLegacy: (protectedPosOperationsNames as readonly string[]).includes(name),
  })));
  expect(classicRuntime).toEqual({
    modules: 0, scripts: transitionRuntimeFiles, hasPosDomain: false,
  });
  expect(response.status()).toBe(200);
  expect(served).toBe(source);
  expect(gitBlob).toBe('137e50dded3843060c10c9484dcef05da9bcd596');
  expect(sha256).toBe('E173658E29CCA6E127BA703D4A274BD2C91E464E6A9D8482567D922F01FCD088');
  expect(operationsSlot).toBeGreaterThan(workspaceSlot);
  expect(publicationSlot).toBeGreaterThan(operationsSlot);
});

async function collectAuthority(page: Page) {
  return page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const api: any = app.MatchaLunaApp?.domains?.pos || app;
    const h = app.__phase4jOperationsHarness;
    h.reset();
    const statusCases = [
      api.posStatusCanManage(null),
      api.posStatusCanManage({}),
      api.posStatusCanManage({ can_view_costs: true }),
      api.posStatusCanManage({ can_open_training: 1 }),
      api.posStatusCanManage({ can_void_sales: 'yes' }),
      api.posStatusCanManage({ can_view_costs: 0, can_open_training: '', can_void_sales: null }),
    ];
    app.posCheckout.loaded = false;
    const ownerFallback = api.posCanManageOperations();
    app.posContext.role = 'member';
    const memberFallback = api.posCanManageOperations();
    app.posCheckout.loaded = true;
    app.posCheckout.shiftStatus = { can_void_sales: true };
    const statusManage = api.posCanManageOperations();
    const roleOwner = api.posRoleLabel();
    app.posContext.role = 'cashier';
    const rolePromoted = api.posRoleLabel();
    app.posCheckout.shiftStatus = {};
    const roleCashier = api.posRoleLabel();
    app.posCheckout.loaded = false;
    app.posContext.role = '';
    const roleDefault = api.posRoleLabel();
    const modes = [
      api.posModeName(false), api.posModeName(true), api.posModeName(0),
      api.posModeName('training'),
    ];
    app.posCheckout.pending = null;
    const pendingNone = api.posModeFromPending();
    app.posCheckout.pending = { rpcArgs: { p_is_training: true } };
    const pendingTraining = api.posModeFromPending();
    app.posCheckout.pending = { rpcArgs: { p_is_training: 1 } };
    const pendingLive = api.posModeFromPending();

    app.posContext.businessId = 9;
    app.session = { user: { id: 7 } };
    app.posOpsGeneration = 4;
    const current = [
      api.posOpsRequestStillCurrent(4, '7', '9'),
      api.posOpsRequestStillCurrent(3, '7', '9'),
      api.posOpsRequestStillCurrent(4, '8', '9'),
      api.posOpsRequestStillCurrent(4, '7', '8'),
    ];
    app.session = null;
    current.push(api.posOpsRequestStillCurrent(4, '7', '9'));
    app.session = { user: { id: 7 } };
    const codes = [
      'P0002', '42501', '55000', '23505', '22003', '22023', '23514',
      'PGRST116', 'PGRST999', 'pgrst116', '',
    ];
    const deterministic = codes.map((code) => api.posOperationDeterministic({ code }));
    const errors = ['void', 'shift opening', 'shift close'].map((action) =>
      codes.map((code) => api.posOperationErrorText({ code }, action)));
    const repeats = {
      deterministic: codes.map((code) => api.posOperationDeterministic({ code })),
      errors: ['void', 'shift opening', 'shift close'].map((action) =>
        codes.map((code) => api.posOperationErrorText({ code }, action))),
    };
    const blocked = [];
    for (const key of ['refreshing', 'shiftLoading', 'catalogLoading', 'checkoutRefreshRequired']) {
      app.posCheckout = app.freshPosCheckout();
      app.posOpsModal = app.freshPosOpsModal();
      app.posCheckout[key] = true;
      blocked.push([key, api.posOpsActionBlocked()]);
      app.posOpsModal.uncertain = true;
      blocked.push([`${key}:uncertain`, api.posOpsActionBlocked()]);
    }
    return {
      statusCases, ownerFallback, memberFallback, statusManage,
      roleOwner, rolePromoted, roleCashier, roleDefault, modes, pendingNone,
      pendingTraining, pendingLive, current, deterministic, errors, repeats, blocked,
    };
  });
}

test('authority, role, mode, request currency, and operation errors match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectAuthority(typedPage);
  const classic = await collectAuthority(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed.current).toEqual([true, false, false, false, false]);
  expect(typed.deterministic).toEqual([
    true, true, true, true, true, true, true, true, true, false, false,
  ]);
  expect(typed.repeats).toEqual({ deterministic: typed.deterministic, errors: typed.errors });
  expect(typed.blocked).toEqual([
    ['refreshing', true], ['refreshing:uncertain', true],
    ['shiftLoading', true], ['shiftLoading:uncertain', true],
    ['catalogLoading', true], ['catalogLoading:uncertain', true],
    ['checkoutRefreshRequired', true], ['checkoutRefreshRequired:uncertain', false],
  ]);
});

async function collectModalLifecycle(page: Page) {
  return page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const api: any = app.MatchaLunaApp?.domains?.pos || app;
    const h = app.__phase4jOperationsHarness;
    h.reset();
    const focusButton = document.createElement('button');
    focusButton.id = 'phase4jFocus';
    document.body.appendChild(focusButton);
    focusButton.focus();
    app.refreshModalBodyClass = () => h.trace.push(['body']);
    const originalRender = app.renderPosOpsModal;
    app.renderPosOpsModal = () => h.trace.push(['render']);
    app.disposePosDrinkImageEditor = () => h.trace.push(['dispose']);
    app.focusSoon = (selector: string) => h.trace.push(['focusSoon', selector]);
    const opened = api.posOpenOpsModal('report', { notice: 'hello' });
    const openState = {
      opened, type: app.posOpsModal.type, notice: app.posOpsModal.notice,
      returnFocus: app.posOpsModalReturnFocus?.id || '', trace: h.trace.slice(),
    };
    h.trace = [];
    app.posOpsModal.submitting = true;
    const blockedClose = api.posCloseOpsModal(false);
    app.posOpsModal.submitting = false;
    app.posOpsModal.uncertain = true;
    const uncertainClose = api.posCloseOpsModal(false);
    const forceClose = api.posCloseOpsModal(true);
    api.posOpenOpsModal('salesHistory');
    app.posOpsModal.submitting = false;
    app.posSalesHistory.rows = [{ sale_id: 'old' }];
    const generation = app.posHistoryGeneration;
    const closed = api.posCloseOpsModal(false);
    const closeState = {
      blockedClose, uncertainClose, forceClose, closed,
      generation: app.posHistoryGeneration - generation,
      rows: app.posSalesHistory.rows.length,
      modalHidden: document.getElementById('posOpsModal')?.hidden,
      active: (document.activeElement as HTMLElement | null)?.id || '',
      trace: h.trace.slice(),
    };

    h.reset();
    app.renderPosOpsModal = () => h.trace.push(['render']);
    app.disposePosDrinkImageEditor = () => h.trace.push(['dispose']);
    app.focusSoon = (selector: string) => h.trace.push(['focusSoon', selector]);
    app.posOpsModal.mediaEditor = { active: true };
    const replacesEditor = api.posOpenOpsModal('report');
    h.trace.push(['replacement', replacesEditor]);
    api.posCloseOpsModal(true);
    app.posOpsModal = app.freshPosOpsModal();
    app.posOpsModal.open = true;
    app.posOpsModal.type = 'manageDrinks';
    const mediaGeneration = app.posMediaGeneration;
    const mediaClose = api.posCloseOpsModal(false);
    const mediaState = {
      mediaClose,
      generation: app.posMediaGeneration - mediaGeneration,
      disposed: h.trace.filter((entry: any[]) => entry[0] === 'dispose').length,
    };

    h.reset();
    app.renderPosOpsModal = () => h.trace.push(['render']);
    app.focusSoon = (selector: string) => h.trace.push(['focusSoon', selector]);
    app.posCheckout.shiftStatus.can_open_live = true;
    const shiftOpen = api.openPosShiftModal();
    const shiftState = { shiftOpen, mode: app.posOpsModal.mode, cash: app.posOpsModal.openingCash, trace: h.trace.slice() };
    h.trace = [];
    const setTraining = api.setPosOpenMode('training');
    app.posCheckout.shiftStatus.can_open_live = false;
    const deniedLive = api.setPosOpenMode('live');
    app.posCheckout.shiftStatus.can_open_live = true;
    app.posOpsModal.submitting = true;
    const busyMode = api.setPosOpenMode('live');
    app.posOpsModal.submitting = false;

    const shiftGuards: Array<[string, boolean]> = [];
    for (const key of [
      'shift', 'shiftLoading', 'shiftError', 'pending', 'refreshing',
      'checkoutRefreshRequired',
    ]) {
      h.reset();
      app.renderPosOpsModal = () => h.trace.push(['render']);
      app.focusSoon = (selector: string) => h.trace.push(['focusSoon', selector]);
      app.posCheckout[key] = key === 'shiftError' ? 'error' : (key === 'shift' || key === 'pending' ? {} : true);
      shiftGuards.push([key, api.openPosShiftModal()]);
    }
    h.reset();
    app.renderPosOpsModal = () => h.trace.push(['render']);
    app.focusSoon = (selector: string) => h.trace.push(['focusSoon', selector]);
    app.posCheckout.shiftStatus.can_open_live = false;
    app.posCheckout.shiftStatus.can_open_training = false;
    shiftGuards.push(['permission', api.openPosShiftModal()]);

    h.reset();
    app.renderPosOpsModal = () => h.trace.push(['render']);
    app.focusSoon = (selector: string) => h.trace.push(['focusSoon', selector]);
    app.posCheckout.shift = { shift_id: 'shift-1', is_training: false };
    app.posCheckout.cart = {};
    app.posOpsModal = app.freshPosOpsModal();
    const closeOpen = api.openPosCloseModal();
    const closeGuards: Array<[string, boolean]> = [];
    for (const key of ['submitting', 'pending', 'confirming', 'refreshing', 'checkoutRefreshRequired']) {
      h.reset();
      app.posCheckout.shift = { shift_id: 'shift-1', is_training: false };
      app.posCheckout[key] = key === 'pending' ? {} : true;
      app.posCartLines = () => [];
      closeGuards.push([key, api.openPosCloseModal()]);
    }
    h.reset();
    app.posCheckout.shift = { shift_id: 'shift-1', is_training: false };
    app.posCartLines = () => [{ product_id: 'p1' }];
    closeGuards.push(['cart', api.openPosCloseModal()]);
    app.posCartLines = () => [];
    app.posCheckout.shiftStatus.can_close_shift = false;
    closeGuards.push(['permission', api.openPosCloseModal()]);

    h.reset();
    app.renderPosOpsModal = () => h.trace.push(['render']);
    app.focusSoon = (selector: string) => h.trace.push(['focusSoon', selector]);
    app.posCheckout.recent = [{ sale_id: 'sale-1', can_void: true, sale_state: 'completed' }];
    app.posOpsModal = app.freshPosOpsModal();
    const voidOpen = api.openPosVoidModal('sale-1');
    const originalManage = app.posCanManageOperations;
    const voidGuards: Array<[string, boolean]> = [];
    app.posCanManageOperations = () => false;
    voidGuards.push(['permission', api.openPosVoidModal('sale-1')]);
    app.posCanManageOperations = () => true;
    for (const key of ['submitting', 'pending', 'refreshing', 'checkoutRefreshRequired']) {
      h.reset();
      app.posCanManageOperations = () => true;
      app.posCheckout.recent = [{ sale_id: 'sale-1', can_void: true, sale_state: 'completed' }];
      app.posCheckout[key] = key === 'pending' ? {} : true;
      voidGuards.push([key, api.openPosVoidModal('sale-1')]);
    }
    h.reset();
    app.posCanManageOperations = () => true;
    app.posCheckout.recent = [
      { sale_id: 'not-voidable', can_void: false, sale_state: 'completed' },
      { sale_id: 'already-voided', can_void: true, sale_state: 'voided' },
    ];
    voidGuards.push(['missing', api.openPosVoidModal('missing')]);
    voidGuards.push(['not-voidable', api.openPosVoidModal('not-voidable')]);
    voidGuards.push(['already-voided', api.openPosVoidModal('already-voided')]);
    app.posCanManageOperations = originalManage;

    h.reset();
    app.renderPosOpsModal = () => h.trace.push(['render']);
    app.posCheckout.refreshing = true;
    const blocked = api.requirePosOpsVerification();
    const blockedError = app.posOpsModal.error;
    app.posCheckout.refreshing = false;
    const verified = api.requirePosOpsVerification();
    app.posCheckout.reportsLoading = true;
    const reportBusy = api.openPosReportModal();
    app.posCheckout.reportsLoading = false;
    const reportOpen = api.openPosReportModal();
    app.renderPosOpsModal = originalRender;
    focusButton.remove();
    return {
      openState, closeState, mediaState, shiftState, setTraining, deniedLive,
      busyMode, shiftGuards, closeOpen, closeGuards, voidOpen, voidGuards,
      blocked, blockedError, verified, reportBusy, reportOpen,
    };
  });
}

test('operations modal lifecycle, entry guards, verification, focus, and disposal match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectModalLifecycle(typedPage);
  const classic = await collectModalLifecycle(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed.openState).toMatchObject({ opened: true, type: 'report', notice: 'hello', returnFocus: 'phase4jFocus' });
  expect(typed.closeState).toMatchObject({
    blockedClose: false, uncertainClose: false, forceClose: true, closed: true,
    generation: 1, rows: 0, modalHidden: true, active: 'phase4jFocus',
  });
  expect(typed.mediaState).toMatchObject({ mediaClose: true, generation: 1, disposed: 2 });
  expect(typed.shiftGuards.every((entry: [string, boolean]) => entry[1] === false)).toBe(true);
  expect(typed.closeGuards.every((entry: [string, boolean]) => entry[1] === false)).toBe(true);
  expect(typed.voidGuards.every((entry: [string, boolean]) => entry[1] === false)).toBe(true);
  expect(typed).toMatchObject({
    setTraining: true, deniedLive: false, busyMode: false, closeOpen: true,
    voidOpen: true, blocked: false, verified: true, reportBusy: false, reportOpen: true,
  });
});

async function collectHistoryControls(page: Page) {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const api: any = app.MatchaLunaApp?.domains?.pos || app;
    const h = app.__phase4jOperationsHarness;
    const openGuards: Array<[string, boolean]> = [];
    for (const key of ['client', 'session', 'user', 'business', 'submitting']) {
      h.reset();
      app.posOpenOpsModal = () => true;
      app.focusSoon = () => undefined;
      app.loadPosSalesHistoryPage = async () => true;
      if (key === 'client') app.cloud.client = null;
      if (key === 'session') app.session = null;
      if (key === 'user') app.session = { user: null };
      if (key === 'business') app.posContext.businessId = '';
      if (key === 'submitting') app.posOpsModal.submitting = true;
      openGuards.push([key, await api.openPosSalesHistory()]);
    }
    h.reset();
    app.posOpenOpsModal = (type: string) => { h.trace.push(['open', type]); app.posOpsModal.open = true; app.posOpsModal.type = type; return true; };
    app.focusSoon = (selector: string) => h.trace.push(['focus', selector]);
    app.loadPosSalesHistoryPage = async (older: boolean) => { h.trace.push(['receipts', older]); return true; };
    app.posCheckout.reportMode = 'training';
    const historyGeneration = app.posHistoryGeneration;
    const opened = await api.openPosSalesHistory();
    const openState = {
      opened, generation: app.posHistoryGeneration - historyGeneration,
      mode: app.posSalesHistory.mode, trace: h.trace.slice(),
    };

    h.reset();
    app.posOpsModal.open = true;
    app.posOpsModal.type = 'salesHistory';
    app.posSalesHistory.mode = 'live';
    app.posSalesHistory.view = 'tally';
    const originalRender = app.renderPosOpsModal;
    app.renderPosOpsModal = () => h.trace.push(['render']);
    app.loadPosSalesProductTally = async () => { h.trace.push(['tally']); return true; };
    app.loadPosClosedShiftsPage = async (older: boolean) => { h.trace.push(['shifts', older]); return true; };
    app.loadPosSalesHistoryPage = async (older: boolean) => { h.trace.push(['receipts', older]); return true; };
    app.posCanManageOperations = () => true;
    const dates = ['2026-02-28', '2024-02-29', '2025-02-29', '2026-13-01', ' 2026-10-03 ']
      .map((value) => api.validPosBusinessDate(value));
    app.posSalesHistory.filterDateInput = 'bad-date';
    const badDate = await api.applyPosHistoryDateFilter();
    const badError = app.posSalesHistory.tallyError;
    app.posSalesHistory.filterDateInput = '2026-10-03';
    const goodDate = await api.applyPosHistoryDateFilter();
    const dateState = { filterDate: app.posSalesHistory.filterDate, trace: h.trace.slice() };
    app.posSalesHistory.filterDateInput = '2026-10-03';
    app.posSalesHistory.tallyLoaded = true;
    const sameMode = await api.setPosSalesHistoryMode('live');
    const invalidMode = await api.setPosSalesHistoryMode('invalid');
    app.posSalesHistory.tallyLoaded = false;
    const trainingMode = await api.setPosSalesHistoryMode('training');
    const modeState = {
      sameMode, invalidMode, trainingMode, mode: app.posSalesHistory.mode,
      view: app.posSalesHistory.view, filterDate: app.posSalesHistory.filterDate,
      filterDateInput: app.posSalesHistory.filterDateInput,
    };
    h.trace = [];
    app.posSalesHistory.shiftRows = [{ shift_id: 'shift-1', closed_at: '2026-10-03T01:00:00Z' }];
    app.posSalesHistory.shiftLoaded = true;
    app.posSalesHistory.tallyLoaded = true;
    const shiftFilter = await api.setPosHistoryShiftFilter('shift-1');
    const selected = app.posSalesHistory.selectedShiftRow?.shift_id || '';
    app.posSalesHistory.view = 'shifts';
    app.posSalesHistory.shiftRows = [{ shift_id: 'shift-2' }];
    const viewTally = await api.viewPosShiftTally('shift-2');
    app.posSalesHistory.tallyLoaded = true;
    const sameView = await api.setPosSalesHistoryView('tally');
    app.posCanManageOperations = () => false;
    const deniedShifts = await api.setPosSalesHistoryView('shifts');
    app.posCanManageOperations = () => true;
    app.posSalesHistory.loading = true;
    const busyReload = await api.reloadPosSalesHistory();
    app.posSalesHistory.loading = false;
    const invalidView = await api.setPosSalesHistoryView('other');
    app.posSalesHistory.view = 'tally';
    app.posSalesHistory.filterDate = '2026-10-03';
    app.posSalesHistory.filterDateInput = '2026-10-03';
    app.posSalesHistory.tallyLoaded = true;
    const clearedDate = await api.clearPosHistoryDateFilter();

    const current = [];
    app.posHistoryGeneration = 41;
    app.posOpsModal.open = true;
    app.posOpsModal.type = 'salesHistory';
    app.posSalesHistory.mode = 'live';
    app.posSalesHistory.view = 'receipts';
    app.session = { user: { id: 7 } };
    app.posContext.businessId = 9;
    current.push(api.posHistoryRequestStillCurrent(41, '7', '9', 'live', 'receipts'));
    current.push(api.posHistoryRequestStillCurrent(40, '7', '9', 'live', 'receipts'));
    current.push(api.posHistoryRequestStillCurrent(41, '8', '9', 'live', 'receipts'));
    current.push(api.posHistoryRequestStillCurrent(41, '7', '8', 'live', 'receipts'));
    current.push(api.posHistoryRequestStillCurrent(41, '7', '9', 'training', 'receipts'));
    current.push(api.posHistoryRequestStillCurrent(41, '7', '9', 'live', 'tally'));
    app.posOpsModal.open = false;
    current.push(api.posHistoryRequestStillCurrent(41, '7', '9', 'live', 'receipts'));

    const panel = document.querySelector<HTMLElement>('#posOpsModal .modal')!;
    document.getElementById('posOpsModal')!.hidden = false;
    Object.defineProperty(panel, 'scrollTop', {
      configurable: true, writable: true, value: 0,
    });
    app.posOpsModal.open = true;
    app.posOpsModal.type = 'salesHistory';
    app.posSalesHistory.view = 'tally';
    app.renderPosOpsModal = () => {
      document.getElementById('posOpsModalContent')!.innerHTML =
        '<div class="pos-history-view-tabs"><button role="tab" data-view="tally" aria-selected="true">Tally</button></div>';
    };
    app.renderPosOpsModal();
    const tab = document.querySelector<HTMLElement>('[data-view="tally"]')!;
    tab.focus();
    panel.scrollTop = 123;
    api.renderPosHistoryPreservingScroll('tally');
    const scrollState = {
      top: panel.scrollTop,
      focus: (document.activeElement as HTMLElement | null)?.dataset.view || '',
    };
    const historyErrors = ['42501', '22023', 'other'].map((code) =>
      api.posHistoryErrorText({ code }));
    app.renderPosOpsModal = originalRender;
    return {
      openGuards, openState, dates, badDate, badError, goodDate, dateState,
      modeState, shiftFilter, selected, viewTally, sameView, deniedShifts,
      busyReload, invalidView, clearedDate, current, scrollState, historyErrors,
      trace: h.trace,
    };
  });
}

test('history mode, view, date, shift filters, generations, and dispatch match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectHistoryControls(typedPage);
  const classic = await collectHistoryControls(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed.dates).toEqual([true, true, false, false, true]);
  expect(typed.badError).toBe('Choose a valid business date.');
  expect(typed.openGuards.every((entry: [string, boolean]) => entry[1] === false)).toBe(true);
  expect(typed.openState).toMatchObject({ opened: true, generation: 1, mode: 'training' });
  expect(typed.current).toEqual([true, false, false, false, false, false, false]);
  expect(typed.scrollState).toEqual({ top: 123, focus: 'tally' });
  expect(typed.historyErrors).toEqual([
    'Your account no longer has access to this sales history.',
    'The history request was rejected. Close this window and try again.',
    'Could not load older sales. Your already loaded receipts are still shown.',
  ]);
});

async function collectTallyAndShifts(page: Page) {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const api: any = app.MatchaLunaApp?.domains?.pos || app;
    const h = app.__phase4jOperationsHarness;
    h.reset();
    app.posOpsModal.open = true;
    app.posOpsModal.type = 'salesHistory';
    app.posSalesHistory.mode = 'live';
    app.posSalesHistory.view = 'tally';
    app.renderPosOpsModal = () => h.trace.push(['render']);
    app.posHandleAccessDenied = (error: any) => { h.trace.push(['access', error?.code || '']); return false; };
    app.rpcRows = (result: any) => { if (result.error) throw result.error; return result.data || []; };
    const tallyRows = [{ product_id: 'p1', item_name: 'Matcha', units_sold: 2 }];
    const shiftRows = [{ shift_id: 's1', closed_at: '2026-10-03T01:00:00Z', has_more: false }];
    app.cloud.client.rpc = async (name: string, args: any) => {
      h.rpc.push([name, args]);
      return { data: name === 'pos_get_sales_product_tally_v2' ? tallyRows : shiftRows };
    };
    const tallyResult = await api.loadPosSalesProductTally();
    const tallyState = {
      result: tallyResult, rows: app.posSalesHistory.tallyRows,
      shifts: app.posSalesHistory.shiftRows, hasMore: app.posSalesHistory.shiftHasMore,
      rpc: h.rpc.slice(), trace: h.trace.slice(),
    };
    h.rpc = []; h.trace = [];
    app.posSalesHistory.view = 'shifts';
    app.posSalesHistory.shiftRows = [];
    app.posSalesHistory.shiftLoaded = false;
    app.posSalesHistory.shiftHasMore = true;
    app.cloud.client.rpc = async (name: string, args: any) => {
      h.rpc.push([name, args]);
      return { data: [
        { shift_id: 's2', closed_at: '2026-10-02T01:00:00Z', has_more: true },
        { shift_id: 's2', closed_at: '2026-10-02T01:00:00Z', has_more: true },
      ] };
    };
    const shiftsResult = await api.loadPosClosedShiftsPage(false);
    const shiftState = {
      result: shiftsResult, rows: app.posSalesHistory.shiftRows.map((row: any) => row.shift_id),
      cursor: [app.posSalesHistory.shiftCursorClosedAt, app.posSalesHistory.shiftCursorShiftId],
      hasMore: app.posSalesHistory.shiftHasMore, rpc: h.rpc.slice(), trace: h.trace.slice(),
    };

    const setupTally = () => {
      h.reset();
      app.posOpsModal.open = true;
      app.posOpsModal.type = 'salesHistory';
      app.posSalesHistory.mode = 'live';
      app.posSalesHistory.view = 'tally';
      app.renderPosHistoryPreservingScroll = () => h.trace.push(['render']);
      app.posCanManageOperations = () => true;
      app.posHandleAccessDenied = (error: any) => {
        h.trace.push(['access', error?.code || '']);
        return error?.code === '42501';
      };
    };
    const tallyScenario = async (kind: string) => {
      setupTally();
      if (kind === 'busy') {
        app.posSalesHistory.tallyLoading = true;
        return { result: await api.loadPosSalesProductTally(), rpc: 0 };
      }
      let release: (() => void) | null = null;
      const gate = kind === 'stale'
        ? new Promise<void>((resolve) => { release = resolve; })
        : Promise.resolve();
      app.requestPosHistoryRpc = async (name: string, args: any) => {
        h.rpc.push([name, args]);
        await gate;
        if (kind === 'access') return { rows: [], error: { code: '42501' } };
        if (kind === 'tally-error' && name === 'pos_get_sales_product_tally_v2') {
          return { rows: [], error: { code: 'offline' } };
        }
        if (kind === 'shift-error' && name === 'pos_get_closed_shifts_page') {
          return { rows: [], error: { code: 'offline' } };
        }
        if (kind === 'shift-cursor' && name === 'pos_get_closed_shifts_page') {
          return { rows: [{ shift_id: 'missing-time' }], error: null };
        }
        return {
          rows: name === 'pos_get_sales_product_tally_v2'
            ? [{ product_id: 'p1', units_sold: 1 }]
            : [{ shift_id: 's1', closed_at: '2026-10-03T01:00:00Z', has_more: false }],
          error: null,
        };
      };
      const pending = api.loadPosSalesProductTally();
      let concurrent: boolean | null = null;
      if (kind === 'stale') {
        concurrent = await api.loadPosSalesProductTally();
        app.posHistoryGeneration += 1;
        release!();
      }
      const result = await pending;
      return {
        result,
        tallyLoaded: app.posSalesHistory.tallyLoaded,
        tallyLoading: app.posSalesHistory.tallyLoading,
        tallyError: app.posSalesHistory.tallyError,
        shiftLoaded: app.posSalesHistory.shiftLoaded,
        shiftLoading: app.posSalesHistory.shiftLoading,
        shiftError: app.posSalesHistory.shiftError,
        concurrent,
        rpc: h.rpc.map((entry: any[]) => entry[0]),
        trace: h.trace.slice(),
      };
    };

    const setupShifts = () => {
      h.reset();
      app.posOpsModal.open = true;
      app.posOpsModal.type = 'salesHistory';
      app.posSalesHistory.mode = 'training';
      app.posSalesHistory.view = 'shifts';
      app.renderPosHistoryPreservingScroll = () => h.trace.push(['render']);
      app.posCanManageOperations = () => true;
      app.posHandleAccessDenied = (error: any) => {
        h.trace.push(['access', error?.code || '']);
        return error?.code === '42501';
      };
    };
    const shiftScenario = async (kind: string) => {
      setupShifts();
      if (kind === 'no-more') {
        app.posSalesHistory.shiftHasMore = false;
        return { result: await api.loadPosClosedShiftsPage(true), rpc: 0 };
      }
      if (kind === 'older') {
        app.posSalesHistory.shiftRows = [
          { shift_id: 's2', closed_at: '2026-10-02T01:00:00Z' },
        ];
        app.posSalesHistory.shiftCursorClosedAt = '2026-10-02T01:00:00Z';
        app.posSalesHistory.shiftCursorShiftId = 's2';
      }
      let release: (() => void) | null = null;
      const gate = kind === 'stale'
        ? new Promise<void>((resolve) => { release = resolve; })
        : Promise.resolve();
      app.requestPosHistoryRpc = async (name: string, args: any) => {
        h.rpc.push([name, args]);
        await gate;
        if (kind === 'access') return { rows: [], error: { code: '42501' } };
        if (kind === 'error') return { rows: [], error: { code: 'offline' } };
        if (kind === 'cursor') return { rows: [{ shift_id: 'missing-time' }], error: null };
        return {
          rows: kind === 'older'
            ? [
              { shift_id: 's2', closed_at: '2026-10-02T01:00:00Z', has_more: false },
              { shift_id: 's1', closed_at: '2026-10-01T01:00:00Z', has_more: false },
            ]
            : [{ shift_id: 's3', closed_at: '2026-10-03T01:00:00Z', has_more: false }],
          error: null,
        };
      };
      const pending = api.loadPosClosedShiftsPage(kind === 'older');
      let concurrent: boolean | null = null;
      if (kind === 'stale') {
        concurrent = await api.loadPosClosedShiftsPage(false);
        app.posHistoryGeneration += 1;
        release!();
      }
      const result = await pending;
      return {
        result,
        ids: app.posSalesHistory.shiftRows.map((row: any) => row.shift_id),
        loading: app.posSalesHistory.shiftLoading,
        loaded: app.posSalesHistory.shiftLoaded,
        error: app.posSalesHistory.shiftError,
        concurrent,
        cursor: [
          app.posSalesHistory.shiftCursorClosedAt,
          app.posSalesHistory.shiftCursorShiftId,
        ],
        args: h.rpc[0]?.[1] || null,
        trace: h.trace.slice(),
      };
    };

    setupTally();
    app.posSalesHistory.filterShiftId = 'selected-shift';
    app.posSalesHistory.shiftLoaded = true;
    app.requestPosHistoryRpc = async (name: string, args: any) => {
      h.rpc.push([name, args]);
      return { rows: [], error: null };
    };
    const selectedShiftResult = await api.loadPosSalesProductTally();
    const selectedShiftState = {
      result: selectedShiftResult,
      rpc: h.rpc.slice(),
    };

    const matrices = {
      tally: {
        busy: await tallyScenario('busy'),
        stale: await tallyScenario('stale'),
        access: await tallyScenario('access'),
        tallyError: await tallyScenario('tally-error'),
        shiftError: await tallyScenario('shift-error'),
        shiftCursor: await tallyScenario('shift-cursor'),
      },
      shifts: {
        noMore: await shiftScenario('no-more'),
        older: await shiftScenario('older'),
        stale: await shiftScenario('stale'),
        access: await shiftScenario('access'),
        error: await shiftScenario('error'),
        cursor: await shiftScenario('cursor'),
      },
    };
    return { tallyState, shiftState, selectedShiftState, matrices };
  });
}

test('drink tally and closed-shift reads preserve RPC order, pagination, dedupe, cursors, and partial state', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectTallyAndShifts(typedPage);
  const classic = await collectTallyAndShifts(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed.tallyState.rpc.map((entry: any[]) => entry[0])).toEqual([
    'pos_get_sales_product_tally_v2', 'pos_get_closed_shifts_page',
  ]);
  expect(typed.shiftState.rows).toEqual(['s2']);
  expect(typed.selectedShiftState.rpc).toEqual([[
    'pos_get_sales_product_tally_v2', {
      p_business_id: 'business-1', p_is_training: false,
      p_date_from: null, p_date_to: null, p_shift_id: 'selected-shift',
    },
  ]]);
  expect(typed.matrices.tally).toMatchObject({
    busy: { result: false, rpc: 0 },
    stale: { result: false, concurrent: false, tallyLoading: true },
    access: { result: false, tallyLoading: true },
    tallyError: { result: false, tallyLoaded: false },
    shiftError: { result: true, tallyLoaded: true, shiftLoaded: false },
    shiftCursor: { result: true, tallyLoaded: true, shiftLoaded: false },
  });
  expect(typed.matrices.shifts).toMatchObject({
    noMore: { result: false, rpc: 0 },
    older: { result: true, ids: ['s2', 's1'] },
    stale: { result: false, concurrent: false, loading: true },
    access: { result: false, loading: true },
    error: { result: false, loaded: true },
    cursor: { result: false, loaded: true },
  });
});

async function collectReceipts(page: Page) {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const api: any = app.MatchaLunaApp?.domains?.pos || app;
    const h = app.__phase4jOperationsHarness;
    h.reset();
    app.posOpsModal.open = true;
    app.posOpsModal.type = 'salesHistory';
    app.posSalesHistory.mode = 'live';
    app.posSalesHistory.view = 'receipts';
    app.renderPosOpsModal = () => h.trace.push(['render']);
    app.posHandleAccessDenied = () => false;
    app.rpcRows = (result: any) => { if (result.error) throw result.error; return result.data || []; };
    app.cloud.client.rpc = async (name: string, args: any) => {
      h.rpc.push([name, args]);
      if (name === 'pos_get_sales_history_summary') return { data: [{ net_sale_count: 2 }] };
      return { data: [
        { sale_id: 'sale-2', completed_at: '2026-10-03T02:00:00Z', has_more: true },
        { sale_id: 'sale-2', completed_at: '2026-10-03T02:00:00Z', has_more: true },
      ] };
    };
    const first = await api.loadPosSalesHistoryPage(false);
    const firstState = {
      first, ids: app.posSalesHistory.rows.map((row: any) => row.sale_id),
      summary: app.posSalesHistory.summary,
      cursor: [app.posSalesHistory.cursorCompletedAt, app.posSalesHistory.cursorSaleId],
      hasMore: app.posSalesHistory.hasMore, rpc: h.rpc.slice(),
    };
    h.rpc = [];
    app.cloud.client.rpc = async (name: string, args: any) => {
      h.rpc.push([name, args]);
      return { data: [{ sale_id: 'sale-1', completed_at: '2026-10-03T01:00:00Z', has_more: false }] };
    };
    const older = await api.loadPosSalesHistoryPage(true);
    const olderState = {
      older, ids: app.posSalesHistory.rows.map((row: any) => row.sale_id),
      hasMore: app.posSalesHistory.hasMore, rpc: h.rpc.slice(),
    };

    const setup = () => {
      h.reset();
      app.posOpsModal.open = true;
      app.posOpsModal.type = 'salesHistory';
      app.posSalesHistory.mode = 'live';
      app.posSalesHistory.view = 'receipts';
      app.renderPosHistoryPreservingScroll = () => h.trace.push(['render']);
      app.rpcRows = (result: any) => {
        if (result.error) throw result.error;
        return result.data || [];
      };
      app.posHandleAccessDenied = (error: any) => {
        h.trace.push(['access', error?.code || '']);
        return error?.code === '42501';
      };
    };
    const scenario = async (kind: string) => {
      setup();
      if (kind === 'busy') {
        app.posSalesHistory.loading = true;
        return { result: await api.loadPosSalesHistoryPage(false), rpc: 0 };
      }
      let release: (() => void) | null = null;
      const gate = kind === 'stale'
        ? new Promise<void>((resolve) => { release = resolve; })
        : Promise.resolve();
      let attempt = 0;
      app.cloud.client.rpc = async (name: string, args: any) => {
        h.rpc.push([name, args]);
        await gate;
        if (kind === 'access') throw { code: '42501' };
        if (kind === 'page-error' && name === 'pos_get_sales_history_page') {
          throw { code: 'offline' };
        }
        if (kind === 'retry' && name === 'pos_get_sales_history_page' && attempt === 0) {
          throw { code: 'offline' };
        }
        if (kind === 'summary-error' && name === 'pos_get_sales_history_summary') {
          throw { code: 'offline' };
        }
        if (name === 'pos_get_sales_history_summary') {
          return { data: [{ net_sale_count: 1 }] };
        }
        if (kind === 'cursor') return { data: [{ sale_id: 'missing-time' }] };
        return { data: [{
          sale_id: `sale-${attempt + 1}`,
          completed_at: `2026-10-0${attempt + 1}T01:00:00Z`,
          has_more: false,
        }] };
      };
      const pending = api.loadPosSalesHistoryPage(false);
      let concurrent: boolean | null = null;
      if (kind === 'stale') {
        concurrent = await api.loadPosSalesHistoryPage(false);
        app.posHistoryGeneration += 1;
        release!();
      }
      const result = await pending;
      let retry: boolean | null = null;
      if (kind === 'retry') {
        attempt = 1;
        retry = await api.loadPosSalesHistoryPage(false);
      }
      return {
        result, retry, concurrent,
        ids: app.posSalesHistory.rows.map((row: any) => row.sale_id),
        loading: app.posSalesHistory.loading,
        loaded: app.posSalesHistory.loaded,
        error: app.posSalesHistory.error,
        summary: app.posSalesHistory.summary,
        summaryError: app.posSalesHistory.summaryError,
        rpc: h.rpc.map((entry: any[]) => entry[0]),
        trace: h.trace.slice(),
      };
    };
    const matrices = {
      busy: await scenario('busy'),
      stale: await scenario('stale'),
      access: await scenario('access'),
      pageError: await scenario('page-error'),
      cursor: await scenario('cursor'),
      summaryError: await scenario('summary-error'),
      retry: await scenario('retry'),
    };
    return { firstState, olderState, matrices };
  });
}

test('receipt history and summary preserve concurrency, pagination, dedupe, cursors, and loaded state', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectReceipts(typedPage);
  const classic = await collectReceipts(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed.firstState.rpc.map((entry: any[]) => entry[0])).toEqual([
    'pos_get_sales_history_page', 'pos_get_sales_history_summary',
  ]);
  expect(typed.olderState.ids).toEqual(['sale-2', 'sale-1']);
  expect(typed.matrices).toMatchObject({
    busy: { result: false, rpc: 0 },
    stale: { result: false, concurrent: false, loading: true, loaded: false },
    access: { result: false, loading: true, loaded: false },
    pageError: { result: false, loading: false, loaded: true },
    cursor: { result: false, loading: false, loaded: true },
    summaryError: { result: true, loaded: true },
    retry: { result: false, retry: true, loaded: true, ids: ['sale-2'] },
  });
  expect(typed.matrices.summaryError.summaryError).toBe(
    'All-time totals could not load. Receipt history is still available.',
  );
});

async function collectHtml(page: Page) {
  return page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const api: any = app.MatchaLunaApp?.domains?.pos || app;
    const h = app.__phase4jOperationsHarness;
    h.reset();
    app.posCheckout.reportMode = 'live';
    app.posCheckout.shiftStatus.business_timezone = 'Asia/Manila';
    app.posSalesHistory.mode = 'live';
    app.posSalesHistory.view = 'tally';
    app.posSalesHistory.filterDate = '2026-10-03';
    app.posSalesHistory.filterDateInput = '2026-10-03';
    app.posSalesHistory.shiftLoaded = true;
    app.posSalesHistory.shiftHasMore = false;
    app.posSalesHistory.shiftRows = [{
      shift_id: 's<1', register_name: 'Register <A>',
      closed_at: '2026-10-03T01:30:00Z', closed_business_date: '2026-10-03',
      closed_by_display_name: 'Owner & Staff', event_name: 'Pop-up',
      gross_sales_centavos: 20000, voided_sales_centavos: 0,
      net_sales_centavos: 20000, net_sale_count: 1,
      expected_cash_centavos: 20000, counted_cash_centavos: 20000,
      cash_variance_centavos: 0, expected_gcash_centavos: 0,
      verified_gcash_centavos: 0, gcash_variance_centavos: 0,
      expected_gotyme_centavos: 0, verified_gotyme_centavos: 0,
      gotyme_variance_centavos: 0, close_notes: '<safe>',
    }];
    const report = {
      business_date: '2026-10-03', business_timezone: 'Asia/Manila',
      is_training: false, can_view_costs: true, gross_sales_centavos: 20000,
      voided_sales_centavos: 0, net_sales_centavos: 20000,
      net_sale_count: 1, net_items_sold: 2, estimated_gross_profit_centavos: 10000,
      cash_net_centavos: 20000, gcash_net_centavos: 0, gotyme_net_centavos: 0,
    };
    const summary = Object.assign({}, report, {
      first_business_date: '2026-10-01', last_business_date: '2026-10-03',
    });
    const primary = {
      variance: api.posVarianceHtml('<Cash>', 100, 200, 100),
      close: api.posCloseResultHtml({
        is_training: false, is_retry: true, register_name: '<Register>',
        closed_at: '2026-10-03T01:30:00Z', expected_cash_centavos: 100,
        counted_cash_centavos: 100, cash_variance_centavos: 0,
        expected_gcash_centavos: 0, verified_gcash_centavos: 0,
        gcash_variance_centavos: 0, expected_gotyme_centavos: 0,
        verified_gotyme_centavos: 0, gotyme_variance_centavos: 0,
      }),
      report: api.posReportHtml(report),
      date: [api.posHistoryDateLabel('2026-10-03'), api.posHistoryDateLabel('bad')],
      summary: api.posSalesHistorySummaryHtml(summary),
      tally: api.posSalesProductTallyHtml([{ item_name: '<Matcha>', size_label: '12oz', units_sold: 2, order_count: 1, net_sales_centavos: 20000 }]),
      filterLabel: api.posHistoryFilterLabel(),
      shiftLabel: api.posHistoryShiftOptionLabel(app.posSalesHistory.shiftRows[0]),
      filter: api.posHistoryFilterHtml(true),
      reconcile: api.posShiftReconcileHtml('<Cash>', 100, 200, 100),
      shifts: api.posClosedShiftHistoryHtml(app.posSalesHistory.shiftRows),
    };
    const branches: Record<string, any> = {};
    branches.variance = [
      api.posVarianceHtml('Zero', 0, 0, 0),
      api.posVarianceHtml('Positive', '100', '250', '150'),
      api.posVarianceHtml('Negative', 250, 100, -150),
    ];
    branches.close = [
      api.posCloseResultHtml({
        is_training: true, register_name: '<Training>',
        closed_at: 'invalid', cash_variance_centavos: -100,
        gcash_variance_centavos: 200, gotyme_variance_centavos: 0,
      }),
      api.posCloseResultHtml(null),
    ];
    app.posCheckout.reportsLoading = true;
    branches.reportLoading = api.posReportHtml(null);
    app.posCheckout.reportsLoading = false;
    app.posCheckout.reportsError = '<offline>';
    branches.reportError = api.posReportHtml(null);
    app.posCheckout.reportsError = '';
    branches.reportEmpty = api.posReportHtml(null);
    branches.reportRestricted = api.posReportHtml(Object.assign({}, report, {
      is_training: true, can_view_costs: false,
      estimated_gross_profit_centavos: '999999',
    }));
    branches.date = [
      api.posHistoryDateLabel(''), api.posHistoryDateLabel('not-a-date'),
      api.posHistoryDateLabel('2026-10-03'),
    ];
    app.posSalesHistory.loading = true;
    branches.summaryLoading = api.posSalesHistorySummaryHtml(null);
    app.posSalesHistory.loading = false;
    branches.summaryMissing = api.posSalesHistorySummaryHtml(null);
    branches.summaryRestricted = api.posSalesHistorySummaryHtml(Object.assign({}, summary, {
      first_business_date: '', last_business_date: '', can_view_costs: false,
      is_training: true,
    }));
    branches.summarySingleDate = api.posSalesHistorySummaryHtml(Object.assign({}, summary, {
      first_business_date: '2026-10-03', last_business_date: '2026-10-03',
    }));
    branches.tally = [
      api.posSalesProductTallyHtml([]),
      api.posSalesProductTallyHtml([
        { item_name: '', size_label: ' ', units_sold: -1, order_count: -2, net_sales_centavos: -3 },
        { item_name: '<One>', size_label: '<12oz>', units_sold: '1', order_count: '1', net_sales_centavos: '100' },
      ]),
    ];
    app.posSalesHistory.filterDate = '';
    app.posSalesHistory.filterShiftId = '';
    app.posSalesHistory.selectedShiftRow = null;
    branches.filterLabels = [api.posHistoryFilterLabel()];
    app.posSalesHistory.filterDate = '2026-10-03';
    app.posSalesHistory.filterShiftId = 'missing';
    branches.filterLabels.push(api.posHistoryFilterLabel());
    app.posSalesHistory.selectedShiftRow = {
      shift_id: 'missing', register_name: '<Selected>', closed_business_date: '2026-10-02',
    };
    branches.filterLabels.push(api.posHistoryFilterLabel());
    branches.shiftLabels = [
      api.posHistoryShiftOptionLabel({ register_name: '<Register>' }),
      api.posHistoryShiftOptionLabel({
        register_name: '<Register>', closed_business_date: 'bad', closed_at: 'bad',
      }),
    ];
    app.posSalesHistory = app.freshPosSalesHistory();
    app.posSalesHistory.view = 'tally';
    branches.filters = [api.posHistoryFilterHtml(false), api.posHistoryFilterHtml(true)];
    app.posSalesHistory.shiftLoading = true;
    branches.filters.push(api.posHistoryFilterHtml(true));
    app.posSalesHistory.shiftLoading = false;
    app.posSalesHistory.shiftError = '<shift error>';
    branches.filters.push(api.posHistoryFilterHtml(true));
    app.posSalesHistory.shiftError = '';
    app.posSalesHistory.filterDate = '2026-10-03';
    app.posSalesHistory.filterDateInput = '2026-10-03';
    app.posSalesHistory.shiftLoaded = true;
    app.posSalesHistory.shiftHasMore = false;
    app.posSalesHistory.shiftRows = [{
      shift_id: 's&1', register_name: '<R>', closed_business_date: '2026-10-03',
    }];
    app.posSalesHistory.filterShiftId = 's&1';
    branches.filters.push(api.posHistoryFilterHtml(true));
    app.posSalesHistory.tallyLoading = true;
    branches.filters.push(api.posHistoryFilterHtml(true));
    app.posSalesHistory.tallyLoading = false;
    branches.reconcile = [
      api.posShiftReconcileHtml('Balanced', 0, 0, 0),
      api.posShiftReconcileHtml('Over', '0', '100', '100'),
      api.posShiftReconcileHtml('Under', 100, 0, -100),
    ];
    branches.closedShifts = [
      api.posClosedShiftHistoryHtml([]),
      api.posClosedShiftHistoryHtml([{
        shift_id: 's&2', register_name: '<Register>', event_name: '& Event',
        closed_business_date: 'bad', closed_at: 'bad',
        closed_by_display_name: '<User>', cash_variance_centavos: -100,
        gcash_variance_centavos: 0, gotyme_variance_centavos: 0,
        gross_sales_centavos: '100', voided_sales_centavos: '200',
        net_sales_centavos: '-100', net_sale_count: '-1', close_notes: '',
      }]),
    ];
    return { ...primary, branches };
  });
}

test('report, tally, filter, and shift HTML preserves escaping, money, locale, timezone, and classes', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectHtml(typedPage);
  const classic = await collectHtml(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed.variance).toContain('&lt;Cash&gt;');
  expect(typed.shifts).toContain('&lt;safe&gt;');
  expect(typed.tally).toContain('&lt;Matcha&gt;');
  expect(typed.branches.reportLoading).toContain('No Live report is available');
  expect(typed.branches.reportError).toContain('No Live report is available');
  expect(typed.branches.reportEmpty).toContain('No Live report is available');
  expect(typed.branches.reportRestricted).toContain('Owner only');
  expect(typed.branches.summaryLoading).toContain('Loading all-time totals');
  expect(typed.branches.summaryMissing).toContain('All-time totals are unavailable');
  expect(typed.branches.filters.some((html: string) => html.includes('disabled'))).toBe(true);
  expect(typed.branches.closedShifts[1]).toContain('Has variance');
});

async function collectCsvAndActions(page: Page) {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const api: any = app.MatchaLunaApp?.domains?.pos || app;
    const h = app.__phase4jOperationsHarness;
    h.reset();
    app.posCheckout.dailyReport = {
      business_date: '2026-10-03', business_timezone: 'Asia/Manila',
      is_training: false, can_view_costs: true, gross_sale_count: 2,
      voided_sale_count: 1, net_sale_count: 1, gross_items_sold: 3,
      voided_items_sold: 1, net_items_sold: 2, gross_sales_centavos: 30000,
      voided_sales_centavos: 10000, net_sales_centavos: 20000,
      cash_net_centavos: 10000, gcash_net_centavos: 10000,
      gotyme_net_centavos: 0, estimated_cost_centavos: 5000,
      estimated_gross_profit_centavos: 15000,
    };
    const cells = ['=SUM(A1)', ' +cmd', '-1', '@x', 'plain', 'a"b', null]
      .map((value) => api.posCsvCell(value));
    const csv = api.posBuildReportCsv();
    const restrictedCsv = (() => {
      const original = app.posCheckout.dailyReport.can_view_costs;
      app.posCheckout.dailyReport.can_view_costs = false;
      const value = api.posBuildReportCsv();
      app.posCheckout.dailyReport.can_view_costs = original;
      return value;
    })();
    const clicked: string[] = [];
    const created: string[] = [];
    const revoked: string[] = [];
    const downloadedBlobs: Blob[] = [];
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = (blob: Blob) => {
      downloadedBlobs.push(blob);
      created.push('created');
      return 'blob:test';
    };
    URL.revokeObjectURL = (value: string) => { revoked.push(value); };
    HTMLAnchorElement.prototype.click = function () { clicked.push(this.download); };
    const downloaded = api.downloadPosReport();
    const blobBytes = downloadedBlobs.length
      ? Array.from(new Uint8Array(await downloadedBlobs[0].arrayBuffer())).slice(0, 3)
      : [];
    const blobText = downloadedBlobs.length ? await downloadedBlobs[0].text() : '';
    const linkRemaining = document.querySelectorAll('a[download]').length;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    HTMLAnchorElement.prototype.click = originalClick;
    app.print = () => h.trace.push(['print']);
    const printed = api.printPosReport();
    const savedReport = app.posCheckout.dailyReport;
    app.posCheckout.dailyReport = null;
    const emptyCsv = api.posBuildReportCsv();
    const emptyDownload = api.downloadPosReport();
    const emptyPrint = api.printPosReport();
    app.posCheckout.dailyReport = savedReport;
    app.posOpsModal.open = true;
    app.posOpsModal.type = 'report';
    app.posCheckout.shift = null;
    app.clearPosReportData = () => h.trace.push(['clear']);
    app.renderPosOpsModal = () => h.trace.push(['render']);
    app.loadPosCheckoutData = async () => { h.trace.push(['load']); app.posCheckout.dailyReport = { business_date: '2026-10-03' }; app.posCheckout.reportLoadedMode = 'training'; return true; };
    const mode = await api.setPosReportMode('training');
    const modeTrace = h.trace.slice();

    const modeGuard = async (kind: string) => {
      h.reset();
      app.posOpsModal.open = true;
      app.posOpsModal.type = 'report';
      app.posCanManageOperations = () => kind !== 'denied';
      app.clearPosReportData = () => h.trace.push(['clear']);
      app.renderPosOpsModal = () => h.trace.push(['render']);
      app.loadPosCheckoutData = async () => {
        h.trace.push(['load']);
        if (kind === 'closed') app.posOpsModal.open = false;
        app.posCheckout.dailyReport = { business_date: '2026-10-03' };
        app.posCheckout.reportLoadedMode = kind === 'wrong-mode' ? 'live' : 'training';
        return kind !== 'load-failed';
      };
      if (kind === 'shift') app.posCheckout.shift = { shift_id: 's1' };
      if (kind === 'loading') app.posCheckout.reportsLoading = true;
      if (kind === 'same') app.posCheckout.reportMode = 'training';
      const result = await api.setPosReportMode(
        kind === 'invalid' ? 'other' : 'training',
      );
      return {
        result,
        mode: app.posCheckout.reportMode,
        date: app.posCheckout.reportDate,
        notice: app.posOpsModal.notice,
        trace: h.trace.slice(),
      };
    };
    const modes = {
      invalid: await modeGuard('invalid'),
      shift: await modeGuard('shift'),
      loading: await modeGuard('loading'),
      denied: await modeGuard('denied'),
      same: await modeGuard('same'),
      closed: await modeGuard('closed'),
      loadFailed: await modeGuard('load-failed'),
      wrongMode: await modeGuard('wrong-mode'),
    };
    return {
      cells, csv, restrictedCsv, downloaded, clicked, created, revoked,
      blobBytes, blobText, linkRemaining, printed, emptyCsv, emptyDownload, emptyPrint,
      mode, modeTrace, modes,
    };
  });
}

test('CSV hardening, report export, print, and report-mode sequencing match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectCsvAndActions(typedPage);
  const classic = await collectCsvAndActions(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed.cells.slice(0, 4).every((cell: string) => cell.startsWith('"\''))).toBe(true);
  expect(typed.csv).toContain('\r\n');
  expect(typed.clicked).toEqual(['matcha-luna-2026-10-03-live.csv']);
  expect(typed.restrictedCsv).not.toContain('Estimated product cost');
  expect(typed.blobBytes).toEqual([0xEF, 0xBB, 0xBF]);
  expect(typed).toMatchObject({
    created: ['created'], revoked: ['blob:test'], linkRemaining: 0,
    emptyCsv: '', emptyDownload: false, emptyPrint: false,
  });
  expect(typed.modeTrace).toEqual([
    ['print'], ['clear'], ['render'], ['load'], ['render'],
  ]);
  expect(typed.modes).toMatchObject({
    invalid: { result: false, trace: [] },
    shift: { result: false, trace: [] },
    loading: { result: false, trace: [] },
    denied: { result: false, trace: [] },
    same: { result: true },
    closed: { result: false },
    loadFailed: { result: false },
    wrongMode: { result: false },
  });
});

async function collectModalRendering(page: Page) {
  return page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    const api: any = app.MatchaLunaApp?.domains?.pos || app;
    const h = app.__phase4jOperationsHarness;
    h.reset();
    app.escapeHtml = (value: any) => String(value ?? '').replace(/[&<>"']/g, (char: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[char]);
    let product: any = { product_id: 'p1', product_name: 'Matcha <Latte>', selling_price_centavos: 17000 };
    let matchaOptions: any[] = [{ id: 'm1', display_name: 'Premium & Green', surcharge_centavos: 7000 }];
    let selectedOption: any = null;
    let editor: any = null;
    let mediaRow: any = null;
    let blocked = false;
    let canManage = true;
    app.posLatestCatalogProduct = (id: string) => { h.trace.push(['catalog-product', id]); return product; };
    app.posCatalogMatchaOptions = () => { h.trace.push(['catalog-options']); return matchaOptions; };
    app.posLatestMatchaOption = (_product: any, id: string) => { h.trace.push(['catalog-selected', id]); return selectedOption; };
    app.posDrinkImageHtml = (_row: any, size: string) => { h.trace.push(['image', size]); return `<div class="image ${size}"></div>`; };
    app.posCurrentDrinkImageEditor = () => { h.trace.push(['current-editor']); return editor; };
    app.posMediaRow = (id: string) => { h.trace.push(['media-row', id]); return mediaRow; };
    app.posSalesRowsHtml = () => { h.trace.push(['sales-rows']); return '<div class="sales"></div>'; };
    app.posPaymentLabel = (method: string) => { h.trace.push(['payment', method]); return 'GCash'; };
    app.drawPosDrinkImageEditor = () => h.trace.push(['draw']);
    app.posOpsActionBlocked = () => blocked;
    app.posCanManageOperations = () => canManage;
    const content = document.getElementById('posOpsModalContent')!;
    const modalElement = document.getElementById('posOpsModal')!;
    const panel = modalElement.querySelector('.modal')!;
    const snapshots: Record<string, any> = {};
    const render = (label: string, type: string, extra: Record<string, any> = {}) => {
      content.innerHTML = '';
      app.posOpsModal = Object.assign(app.freshPosOpsModal(), { open: true, type }, extra);
      api.renderPosOpsModal();
      snapshots[label] = {
        html: content.innerHTML,
        small: panel.classList.contains('small'),
        describedBy: panel.getAttribute('aria-describedby'),
        hidden: modalElement.hidden,
      };
    };

    app.posOpsModal = app.freshPosOpsModal();
    content.innerHTML = 'unchanged';
    api.renderPosOpsModal();
    snapshots.closed = { html: content.innerHTML, hidden: modalElement.hidden };

    product = null;
    render('productUnavailable', 'productOptions', { productId: 'missing' });
    product = { product_id: 'p1', product_name: 'Matcha <Latte>', selling_price_centavos: 17000 };
    matchaOptions = [];
    render('productNoOptions', 'productOptions', { productId: 'p1' });
    matchaOptions = [{ id: 'm1', display_name: 'Premium & Green', surcharge_centavos: 7000 }];
    selectedOption = { id: 'm1', display_name: 'Premium & Green', surcharge_centavos: 7000 };
    render('productSelected', 'productOptions', { productId: 'p1', selectedMatchaOptionId: 'm1' });
    selectedOption = null;
    render('productInvalidSelection', 'productOptions', { productId: 'p1', selectedMatchaOptionId: 'gone' });

    editor = { productName: '<Drink>', loading: true, zoom: 1 };
    render('mediaEditorLoading', 'manageDrinks');
    editor = { productName: '<Drink>', loading: false, zoom: 1.25 };
    render('mediaEditorReady', 'manageDrinks', { notice: '<ready>', error: '<error>' });
    render('mediaEditorSaving', 'manageDrinks', { submitting: true });
    editor = null;
    mediaRow = { product_name: '<Drink>', product_id: 'p1', image_object_path: 'photo.jpg' };
    render('mediaRemove', 'manageDrinks', { mediaRemoveProductId: 'p1' });
    render('mediaRemoveFrozen', 'manageDrinks', { mediaRemoveProductId: 'p1', uncertain: true });
    mediaRow = null;
    render('mediaLoading', 'manageDrinks', { mediaLoading: true });
    render('mediaEmpty', 'manageDrinks', { mediaRows: [] });
    render('mediaRows', 'manageDrinks', { mediaRows: [
      { product_id: 'p1', product_name: '<Matcha>', size_snapshot: '12oz', image_object_path: 'photo.jpg', available: false },
      { product_id: 'p2', product_name: 'Hojicha', size_snapshot: '', image_object_path: '' },
    ] });
    render('mediaRowsBusy', 'manageDrinks', {
      submitting: true, mediaProductId: 'p1',
      mediaRows: [{ product_id: 'p1', product_name: 'Matcha', image_object_path: 'photo.jpg' }],
    });

    render('cartClear', 'cartConfirm', { cartAction: 'clear', cartQuantity: 2 });
    render('cartRemove', 'cartConfirm', { cartAction: 'remove', cartQuantity: 1, cartProductName: '<Matcha>' });

    render('openLive', 'openShift', { mode: 'live', openingCash: '100.00' });
    render('openTraining', 'openShift', { mode: 'training', openingCash: '999' });
    render('openSubmitting', 'openShift', { mode: 'live', submitting: true });
    render('openUncertain', 'openShift', { mode: 'live', uncertain: true, error: '<uncertain>' });
    blocked = true;
    render('openBlocked', 'openShift', { mode: 'live' });
    blocked = false;

    app.posCheckout.shift = { shift_id: 's1', register_name: 'Main register', is_training: false };
    render('closeEdit', 'closeShift', { mode: 'live', step: 'edit', countedCash: '<1>', error: '<error>' });
    render('closeConfirm', 'closeShift', { mode: 'live', step: 'confirm', countedCash: '100', verifiedGcash: '20', verifiedGotyme: '30' });
    render('closeUncertain', 'closeShift', { mode: 'live', step: 'confirm', uncertain: true, rpcArgs: { p_shift_id: 's1' } });
    app.posCheckout.shift.is_training = true;
    render('closeTraining', 'closeShift', { mode: 'training', step: 'confirm' });
    render('closeResult', 'closeShift', { mode: 'training', step: 'result', result: { is_training: true, shift_id: 's1' } });

    const sale = { sale_id: 'sale-1', receipt_number: 'R<1>', item_summary: '1 x <Matcha>', gross_total_centavos: 17000, payment_method: 'gcash' };
    render('voidEdit', 'voidSale', { sale, step: 'edit', reason: '<reason>' });
    render('voidConfirm', 'voidSale', { sale, step: 'confirm', reason: '<reason>' });
    render('voidUncertain', 'voidSale', { sale, step: 'confirm', reason: '<reason>', uncertain: true });
    render('voidSubmitting', 'voidSale', { sale, step: 'confirm', reason: '<reason>', submitting: true });
    render('voidResult', 'voidSale', { sale, step: 'result', result: { receipt_number: '<R1>' } });

    const resetHistory = (view: string) => {
      app.posSalesHistory = app.freshPosSalesHistory();
      app.posSalesHistory.mode = 'live';
      app.posSalesHistory.view = view;
    };
    resetHistory('receipts');
    app.posSalesHistory.loading = true;
    render('historyReceiptsLoading', 'salesHistory');
    resetHistory('receipts');
    app.posSalesHistory.loaded = true;
    render('historyReceiptsEmpty', 'salesHistory');
    resetHistory('receipts');
    app.posSalesHistory.loaded = true;
    app.posSalesHistory.rows = [{ sale_id: 's1' }];
    app.posSalesHistory.error = '<page error>';
    app.posSalesHistory.summaryError = '<summary error>';
    render('historyReceiptsErrors', 'salesHistory');
    resetHistory('tally');
    app.posSalesHistory.tallyLoading = true;
    render('historyTallyLoading', 'salesHistory');
    resetHistory('tally');
    app.posSalesHistory.tallyLoaded = true;
    render('historyTallyEmpty', 'salesHistory');
    resetHistory('tally');
    app.posSalesHistory.tallyError = '<tally error>';
    app.posSalesHistory.shiftError = '<shift error>';
    render('historyTallyErrors', 'salesHistory');
    resetHistory('shifts');
    app.posSalesHistory.shiftLoading = true;
    render('historyShiftsLoading', 'salesHistory');
    resetHistory('shifts');
    app.posSalesHistory.shiftLoaded = true;
    app.posSalesHistory.shiftHasMore = false;
    render('historyShiftsEmpty', 'salesHistory');
    resetHistory('shifts');
    app.posSalesHistory.shiftLoaded = true;
    app.posSalesHistory.shiftError = '<shift error>';
    render('historyShiftsError', 'salesHistory');
    resetHistory('receipts');
    app.posSalesHistory.mode = 'training';
    app.posSalesHistory.loading = true;
    render('historyTrainingBusy', 'salesHistory');
    canManage = false;
    resetHistory('receipts');
    app.posSalesHistory.loaded = true;
    render('historyCashier', 'salesHistory');
    canManage = true;

    app.posCheckout.shift = null;
    app.posCheckout.dailyReport = null;
    app.posCheckout.reportsLoading = true;
    render('reportLoading', 'report');
    app.posCheckout.reportsLoading = false;
    app.posCheckout.reportsError = '<report error>';
    render('reportError', 'report');
    app.posCheckout.reportsError = '';
    render('reportEmpty', 'report', { notice: '<notice>' });
    app.posCheckout.dailyReport = { business_date: '2026-10-03', business_timezone: 'Asia/Manila', is_training: false };
    render('reportReady', 'report');
    app.posCheckout.shift = { shift_id: 's1' };
    render('reportDuringShift', 'report');
    return { snapshots, trace: h.trace };
  });
}

test('the operations modal renderer preserves all branch markup and late-bound dependencies', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectModalRendering(typedPage);
  const classic = await collectModalRendering(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(Object.keys(typed.snapshots)).toEqual([
    'closed', 'productUnavailable', 'productNoOptions', 'productSelected',
    'productInvalidSelection', 'mediaEditorLoading', 'mediaEditorReady',
    'mediaEditorSaving', 'mediaRemove', 'mediaRemoveFrozen', 'mediaLoading',
    'mediaEmpty', 'mediaRows', 'mediaRowsBusy', 'cartClear', 'cartRemove',
    'openLive', 'openTraining', 'openSubmitting', 'openUncertain', 'openBlocked',
    'closeEdit', 'closeConfirm', 'closeUncertain', 'closeTraining', 'closeResult',
    'voidEdit', 'voidConfirm', 'voidUncertain', 'voidSubmitting', 'voidResult',
    'historyReceiptsLoading', 'historyReceiptsEmpty', 'historyReceiptsErrors',
    'historyTallyLoading', 'historyTallyEmpty', 'historyTallyErrors',
    'historyShiftsLoading', 'historyShiftsEmpty', 'historyShiftsError',
    'historyTrainingBusy', 'historyCashier', 'reportLoading', 'reportError',
    'reportEmpty', 'reportReady', 'reportDuringShift',
  ]);
  expect(typed.snapshots.productSelected.html).toContain('Customize Matcha &lt;Latte&gt;');
  expect(typed.snapshots.cartClear).toMatchObject({
    small: true, describedBy: 'posCartConfirmDescription',
  });
  expect(typed.snapshots.openSubmitting.html).toContain('disabled');
  expect(typed.snapshots.openUncertain.html).toContain('Retry same opening');
  expect(typed.snapshots.closeUncertain.html).toContain('Retry exact close');
  expect(typed.snapshots.voidUncertain.html).toContain('Retry exact void');
  expect(typed.snapshots.historyTrainingBusy.html).toContain('aria-busy="true"');
  expect(typed.snapshots.historyCashier.html).toContain('pos-history-view-tabs two');
  expect(typed.snapshots.reportDuringShift.html).not.toContain('Training report');
  expect(typed.trace.some((entry: any[]) => entry[0] === 'catalog-product')).toBe(true);
  expect(typed.trace.some((entry: any[]) => entry[0] === 'draw')).toBe(true);
  expect(typed.trace.some((entry: any[]) => entry[0] === 'sales-rows')).toBe(true);
  expect(typed.trace.some((entry: any[]) => entry[0] === 'payment')).toBe(true);
});

async function collectOpenShift(page: Page) {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const api: any = app.MatchaLunaApp?.domains?.pos || app;
    const h = app.__phase4jOperationsHarness;
    const scenario = async (kind: string) => {
      h.reset();
      app.posOpsModal.open = true; app.posOpsModal.type = 'openShift';
      app.posOpsModal.mode = 'live'; app.posOpsModal.openingCash = '100.00';
      app.renderPosOpsModal = () => h.trace.push(['render']);
      app.posCloseOpsModal = (force: boolean) => { h.trace.push(['close', force]); app.posOpsModal.open = false; return true; };
      app.refreshPosAfterMutation = async () => { h.trace.push(['refresh']); return true; };
      app.renderPos = () => h.trace.push(['renderPos']);
      app.requirePosOpsVerification = () => kind !== 'verification-blocked';
      app.loadPosCheckoutData = async () => {
        h.trace.push(['verify']);
        if (kind === 'verify-failed' || kind === 'retry') return false;
        if (kind === 'recovered') {
          app.posCheckout.shift = {
            shift_id: 'shift-recovered', is_training: false,
            opening_cash_centavos: 10000,
          };
        }
        if (kind === 'conflict') {
          app.posCheckout.shift = {
            shift_id: 'shift-conflict', is_training: true,
            opening_cash_centavos: 0,
          };
        }
        return true;
      };
      if (kind === 'invalid-cash') app.posOpsModal.openingCash = '1.234';
      if (kind === 'training') {
        app.posOpsModal.mode = 'training';
        app.posOpsModal.openingCash = '999';
      }
      if (kind === 'no-session') app.session = null;
      if (kind === 'existing-shift') app.posCheckout.shift = { shift_id: 'existing' };
      if (kind === 'pending') app.posCheckout.pending = {};
      if (kind === 'denied') app.posCheckout.shiftStatus.can_open_live = false;
      let attempt = 0;
      let firstArgs: any = null;
      let sameArgsOnRetry: boolean | null = null;
      app.cloud.client.rpc = async (name: string, args: any) => {
        h.rpc.push([name, JSON.parse(JSON.stringify(args))]);
        if (!firstArgs) firstArgs = args;
        else sameArgsOnRetry = firstArgs === args;
        attempt += 1;
        if (kind === 'stale-generation') app.posOpsGeneration += 1;
        if (kind === 'stale-user') app.session.user.id = 'other-user';
        if (kind === 'stale-business') app.posContext.businessId = 'other-business';
        if (kind === 'deterministic-reset') throw { code: '22023' };
        if (kind === 'deterministic-keep') throw { code: '42501' };
        if (['verify-failed', 'recovered', 'conflict', 'no-shift', 'missing'].includes(kind)) {
          if (kind === 'missing') return { data: [{}] };
          throw { code: 'offline' };
        }
        if (kind === 'retry' && attempt === 1) throw { code: 'offline' };
        return { data: [{ shift_id: 'shift-1', is_training: false, opening_cash_centavos: 10000 }] };
      };
      app.rpcRows = (result: any) => {
        if (result.error) throw result.error;
        return result.data || [];
      };
      const result = await api.submitPosOpenShift();
      let retry: boolean | null = null;
      if (kind === 'retry') {
        app.posOpsModal.openingCash = '999.00';
        app.posOpsModal.mode = 'training';
        retry = await api.submitPosOpenShift();
      }
      return {
        result, retry, rpc: h.rpc.slice(), trace: h.trace.slice(), generation: app.posOpsGeneration,
        shift: app.posCheckout.shift, args: app.posOpsModal.rpcArgs,
        submitting: app.posOpsModal.submitting, uncertain: app.posOpsModal.uncertain,
        error: app.posOpsModal.error, notice: app.posCheckout.notice,
        sameArgsOnRetry,
      };
    };
    return {
      guards: {
        invalidCash: await scenario('invalid-cash'),
        noSession: await scenario('no-session'),
        existingShift: await scenario('existing-shift'),
        pending: await scenario('pending'),
        denied: await scenario('denied'),
        verificationBlocked: await scenario('verification-blocked'),
      },
      success: await scenario('success'),
      training: await scenario('training'),
      deterministicReset: await scenario('deterministic-reset'),
      deterministicKeep: await scenario('deterministic-keep'),
      staleGeneration: await scenario('stale-generation'),
      staleUser: await scenario('stale-user'),
      staleBusiness: await scenario('stale-business'),
      verifyFailed: await scenario('verify-failed'),
      recovered: await scenario('recovered'),
      conflict: await scenario('conflict'),
      noShift: await scenario('no-shift'),
      missing: await scenario('missing'),
      retry: await scenario('retry'),
    };
  });
}

test('open-shift submission preserves validation, frozen payload, success order, and deterministic recovery', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectOpenShift(typedPage);
  const classic = await collectOpenShift(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed.success.result).toBe(true);
  expect(typed.success.rpc[0]).toEqual(['pos_open_shift', {
    p_business_id: 'business-1', p_is_training: false,
    p_opening_cash_centavos: 10000,
  }]);
  expect(Object.values(typed.guards).every((value: any) => value.result === false)).toBe(true);
  expect(typed.training.rpc[0][1]).toMatchObject({
    p_is_training: true, p_opening_cash_centavos: 0,
  });
  expect(typed.deterministicReset).toMatchObject({ result: false, args: null, uncertain: false });
  expect(typed.deterministicKeep).toMatchObject({ result: false, uncertain: false });
  expect(typed.staleGeneration).toMatchObject({ result: false, submitting: true });
  expect(typed.staleUser).toMatchObject({ result: false, submitting: true });
  expect(typed.staleBusiness).toMatchObject({ result: false, submitting: true });
  expect(typed.verifyFailed).toMatchObject({ result: false, uncertain: true });
  expect(typed.recovered).toMatchObject({ result: true, uncertain: true });
  expect(typed.recovered.notice).toContain('was found open');
  expect(typed.conflict).toMatchObject({ result: false, uncertain: true });
  expect(typed.conflict.notice).toContain('different opening details');
  expect(typed.noShift).toMatchObject({ result: false, args: null, uncertain: false });
  expect(typed.missing).toMatchObject({ result: false, args: null, uncertain: false });
  expect(typed.retry).toMatchObject({
    result: false, retry: true, sameArgsOnRetry: true,
  });
  expect(typed.retry.rpc[0][1]).toEqual(typed.retry.rpc[1][1]);
});

async function collectCloseShift(page: Page) {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const api: any = app.MatchaLunaApp?.domains?.pos || app;
    const h = app.__phase4jOperationsHarness;
    const setup = () => {
      h.reset();
      app.posCheckout.shift = { shift_id: 'shift-1', is_training: false };
      app.posOpsModal.open = true;
      app.posOpsModal.type = 'closeShift';
      app.posOpsModal.mode = 'live';
      app.posOpsModal.step = 'confirm';
      app.posOpsModal.countedCash = '100';
      app.posOpsModal.verifiedGcash = '20';
      app.posOpsModal.verifiedGotyme = '30';
      app.posOpsModal.notes = ' counted ';
      app.posCartLines = () => [];
      app.renderPosOpsModal = () => h.trace.push(['render']);
      app.requirePosOpsVerification = () => true;
      app.rpcRows = (result: any) => {
        if (result.error) throw result.error;
        return result.data || [];
      };
    };

    setup();
    const validation = api.posCloseValidation();
    const reviewed = api.reviewPosCloseShift();
    const backed = api.backPosCloseShift();
    app.posOpsModal.mode = 'training';
    const trainingValidation = api.posCloseValidation();
    app.posOpsModal.mode = 'live';
    app.posOpsModal.countedCash = '1.234';
    const invalidMoney = api.posCloseValidation();
    app.posOpsModal.countedCash = '1';
    app.posOpsModal.notes = 'x'.repeat(501);
    const longNote = api.posCloseValidation();
    app.posOpsModal.notes = '';
    app.posCartLines = () => [{}];
    const cartValidation = api.posCloseValidation();
    app.posCartLines = () => [];
    app.posOpsModal.type = 'other';
    const wrongReview = api.reviewPosCloseShift();
    app.posOpsModal.type = 'closeShift';
    app.posOpsModal.submitting = true;
    const busyReview = api.reviewPosCloseShift();
    const busyBack = api.backPosCloseShift();
    app.posOpsModal.submitting = false;
    app.posOpsModal.uncertain = true;
    const uncertainBack = api.backPosCloseShift();

    const scenario = async (kind: string) => {
      setup();
      let attempt = 0;
      let firstArgs: any = null;
      let sameArgsOnRetry: boolean | null = null;
      app.refreshPosAfterMutation = async () => {
        h.trace.push(['refresh']);
        if (kind === 'partial-refresh') throw new Error('refresh failed');
        return true;
      };
      app.loadPosCheckoutData = async () => {
        h.trace.push(['verify']);
        if (kind === 'verify-failed' || kind === 'retry') return false;
        if (kind === 'closed-recovery') app.posCheckout.shift = null;
        return true;
      };
      app.cloud.client.rpc = async (name: string, args: any) => {
        h.rpc.push([name, JSON.parse(JSON.stringify(args))]);
        if (!firstArgs) firstArgs = args;
        else sameArgsOnRetry = firstArgs === args;
        attempt += 1;
        if (kind === 'stale-generation') app.posOpsGeneration += 1;
        if (kind === 'stale-user') app.session.user.id = 'other-user';
        if (kind === 'deterministic-reset') throw { code: '22003' };
        if (kind === 'deterministic-keep') throw { code: '42501' };
        if (['verify-failed', 'still-open', 'missing'].includes(kind) ||
            (kind === 'closed-recovery' && attempt === 1)) {
          if (kind === 'missing') return { data: [{}] };
          throw { code: 'offline' };
        }
        if (kind === 'retry' && attempt === 1) throw { code: 'offline' };
        return { data: [{
          shift_id: 'shift-1', is_training: false, cash_variance_centavos: 0,
        }] };
      };
      const result = await api.submitPosCloseShift();
      let retry: boolean | null = null;
      if (kind === 'retry' || kind === 'closed-recovery') {
        app.posOpsModal.countedCash = '999';
        app.posOpsModal.verifiedGcash = '999';
        app.posOpsModal.verifiedGotyme = '999';
        app.posOpsModal.notes = 'changed';
        retry = await api.submitPosCloseShift();
      }
      await Promise.resolve();
      return {
        result, retry, rpc: h.rpc.slice(), trace: h.trace.slice(),
        step: app.posOpsModal.step, shift: app.posCheckout.shift,
        mode: app.posCheckout.reportMode, args: app.posOpsModal.rpcArgs,
        submitting: app.posOpsModal.submitting,
        uncertain: app.posOpsModal.uncertain,
        error: app.posOpsModal.error,
        sameArgsOnRetry,
      };
    };
    return {
      validation, reviewed, backed, trainingValidation, invalidMoney, longNote,
      cartValidation, wrongReview, busyReview, busyBack, uncertainBack,
      success: await scenario('success'),
      partialRefresh: await scenario('partial-refresh'),
      deterministicReset: await scenario('deterministic-reset'),
      deterministicKeep: await scenario('deterministic-keep'),
      staleGeneration: await scenario('stale-generation'),
      staleUser: await scenario('stale-user'),
      verifyFailed: await scenario('verify-failed'),
      stillOpen: await scenario('still-open'),
      closedRecovery: await scenario('closed-recovery'),
      missing: await scenario('missing'),
      retry: await scenario('retry'),
    };
  });
}

test('close-shift validation, review, back, payload, result state, and refresh match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectCloseShift(typedPage);
  const classic = await collectCloseShift(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed.validation).toEqual({ valid: true, cash: 10000, gcash: 2000, gotyme: 3000, error: '' });
  expect(typed.trainingValidation).toEqual({
    valid: true, cash: null, gcash: null, gotyme: null, error: '',
  });
  expect(typed.invalidMoney.valid).toBe(false);
  expect(typed.longNote.valid).toBe(false);
  expect(typed.cartValidation.valid).toBe(false);
  expect(typed).toMatchObject({
    reviewed: true, backed: true, wrongReview: false,
    busyReview: false, busyBack: false, uncertainBack: false,
  });
  expect(typed.success).toMatchObject({ result: true, step: 'result', shift: null });
  expect(typed.success.rpc[0][0]).toBe('pos_close_shift');
  expect(typed.partialRefresh.result).toBe(true);
  expect(typed.deterministicReset).toMatchObject({
    result: false, step: 'edit', args: null, uncertain: false,
  });
  expect(typed.deterministicKeep).toMatchObject({
    result: false, step: 'confirm', uncertain: false,
  });
  expect(typed.staleGeneration).toMatchObject({ result: false, submitting: true });
  expect(typed.staleUser).toMatchObject({ result: false, submitting: true });
  expect(typed.verifyFailed).toMatchObject({ result: false, uncertain: true });
  expect(typed.stillOpen.error).toContain('retry the exact same close details');
  expect(typed.closedRecovery).toMatchObject({
    result: false, retry: true, sameArgsOnRetry: true, step: 'result',
  });
  expect(typed.missing.error).toContain('still shows this shift open');
  expect(typed.retry).toMatchObject({
    result: false, retry: true, sameArgsOnRetry: true, step: 'result',
  });
  expect(typed.retry.rpc[0][1]).toEqual(typed.retry.rpc[1][1]);
});

async function collectVoidSale(page: Page) {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const api: any = app.MatchaLunaApp?.domains?.pos || app;
    const h = app.__phase4jOperationsHarness;
    const setup = () => {
      h.reset();
      app.posOpsModal.open = true;
      app.posOpsModal.type = 'voidSale';
      app.posOpsModal.step = 'edit';
      app.posOpsModal.sale = {
        sale_id: 'sale-1', receipt_number: 'R-1', sale_state: 'completed',
      };
      app.posOpsModal.reason = '  Customer cancelled  ';
      app.posCheckout.recent = [{
        sale_id: 'sale-1', receipt_number: 'R-1', sale_state: 'completed',
      }];
      app.posCanManageOperations = () => true;
      app.requirePosOpsVerification = () => true;
      app.renderPosOpsModal = () => h.trace.push(['render']);
      app.rpcRows = (result: any) => {
        if (result.error) throw result.error;
        return result.data || [];
      };
    };

    setup();
    const reviewed = api.reviewPosVoidSale();
    const reviewedReason = app.posOpsModal.reason;
    const backed = api.backPosVoidSale();
    app.posOpsModal.reason = 'x';
    const tooShort = api.reviewPosVoidSale();
    app.posOpsModal.reason = 'x'.repeat(501);
    const tooLong = api.reviewPosVoidSale();
    app.posOpsModal.type = 'other';
    const wrongType = api.reviewPosVoidSale();
    app.posOpsModal.type = 'voidSale';
    app.posOpsModal.submitting = true;
    const busyReview = api.reviewPosVoidSale();
    const busyBack = api.backPosVoidSale();
    app.posOpsModal.submitting = false;
    app.posOpsModal.uncertain = true;
    const uncertainBack = api.backPosVoidSale();

    const scenario = async (kind: string) => {
      setup();
      app.posOpsModal.step = 'confirm';
      if (kind === 'denied') app.posCanManageOperations = () => false;
      if (kind === 'no-session') app.session = null;
      if (kind === 'no-sale') app.posOpsModal.sale = null;
      if (kind === 'bad-reason') app.posOpsModal.reason = 'x';
      if (kind === 'verification-blocked') app.requirePosOpsVerification = () => false;
      let attempt = 0;
      let firstArgs: any = null;
      let sameArgsOnRetry: boolean | null = null;
      app.refreshPosAfterMutation = async () => {
        h.trace.push(['refresh']);
        if (kind === 'partial-refresh') throw new Error('refresh failed');
        return true;
      };
      app.loadPosCheckoutData = async () => {
        h.trace.push(['verify']);
        if (kind === 'verify-failed' || kind === 'retry') return false;
        if (kind === 'verify-errors') {
          app.posCheckout.reportsError = 'offline';
          return true;
        }
        if (kind === 'recovered') {
          app.posCheckout.recent = [{
            sale_id: 'sale-1', receipt_number: 'R-1', sale_state: 'voided',
          }];
        }
        return true;
      };
      app.cloud.client.rpc = async (name: string, args: any) => {
        h.rpc.push([name, JSON.parse(JSON.stringify(args))]);
        if (!firstArgs) firstArgs = args;
        else sameArgsOnRetry = firstArgs === args;
        attempt += 1;
        if (kind === 'stale-generation') app.posOpsGeneration += 1;
        if (kind === 'stale-user') app.session.user.id = 'other-user';
        if (kind === 'deterministic-reset') throw { code: '22023' };
        if (kind === 'deterministic-keep') throw { code: '42501' };
        if (['verify-failed', 'verify-errors', 'recovered', 'completed', 'missing'].includes(kind)) {
          if (kind === 'missing') return { data: [{}] };
          throw { code: 'offline' };
        }
        if (kind === 'retry' && attempt === 1) throw { code: 'offline' };
        return { data: [{
          sale_id: 'sale-1', receipt_number: 'R-1', sale_state: 'voided',
        }] };
      };
      const result = await api.submitPosVoidSale();
      let retry: boolean | null = null;
      if (kind === 'retry') {
        app.posOpsModal.reason = 'Changed reason';
        retry = await api.submitPosVoidSale();
      }
      await Promise.resolve();
      return {
        result, retry, reason: app.posOpsModal.reason,
        rpc: h.rpc.slice(), step: app.posOpsModal.step,
        resultRow: app.posOpsModal.result, trace: h.trace.slice(),
        args: app.posOpsModal.rpcArgs,
        submitting: app.posOpsModal.submitting,
        uncertain: app.posOpsModal.uncertain,
        error: app.posOpsModal.error,
        sameArgsOnRetry,
      };
    };
    return {
      reviewed, reviewedReason, backed, tooShort, tooLong, wrongType,
      busyReview, busyBack, uncertainBack,
      guards: {
        denied: await scenario('denied'),
        noSession: await scenario('no-session'),
        noSale: await scenario('no-sale'),
        badReason: await scenario('bad-reason'),
        verificationBlocked: await scenario('verification-blocked'),
      },
      success: await scenario('success'),
      partialRefresh: await scenario('partial-refresh'),
      deterministicReset: await scenario('deterministic-reset'),
      deterministicKeep: await scenario('deterministic-keep'),
      staleGeneration: await scenario('stale-generation'),
      staleUser: await scenario('stale-user'),
      verifyFailed: await scenario('verify-failed'),
      verifyErrors: await scenario('verify-errors'),
      recovered: await scenario('recovered'),
      completed: await scenario('completed'),
      missing: await scenario('missing'),
      retry: await scenario('retry'),
    };
  });
}

test('void review, back, payload, result state, and refresh match classic', async ({ page, context }) => {
  const [typedPage, classicPage] = await openPair(page, context);
  const typed = await collectVoidSale(typedPage);
  const classic = await collectVoidSale(classicPage);
  await classicPage.close();
  expect(typed).toEqual(classic);
  expect(typed.reviewedReason).toBe('Customer cancelled');
  expect(typed).toMatchObject({
    reviewed: true, backed: true, tooShort: false, tooLong: false,
    wrongType: false, busyReview: false, busyBack: false, uncertainBack: false,
  });
  expect(Object.values(typed.guards).every((value: any) => value.result === false)).toBe(true);
  expect(typed.success.rpc[0]).toEqual(['pos_void_sale', {
    p_business_id: 'business-1', p_sale_id: 'sale-1',
    p_reason: 'Customer cancelled',
  }]);
  expect(typed.success).toMatchObject({ result: true, step: 'result' });
  expect(typed.partialRefresh.result).toBe(true);
  expect(typed.deterministicReset).toMatchObject({
    result: false, step: 'edit', args: null, uncertain: false,
  });
  expect(typed.deterministicKeep).toMatchObject({
    result: false, step: 'confirm', uncertain: false,
  });
  expect(typed.staleGeneration).toMatchObject({ result: false, submitting: true });
  expect(typed.staleUser).toMatchObject({ result: false, submitting: true });
  expect(typed.verifyFailed).toMatchObject({ result: false, uncertain: true });
  expect(typed.verifyErrors.error).toContain('receipt check also failed');
  expect(typed.recovered).toMatchObject({
    result: true, step: 'result', uncertain: false,
  });
  expect(typed.completed.error).toContain('retry the exact same void reason');
  expect(typed.missing.error).toContain('still shows this receipt completed');
  expect(typed.retry).toMatchObject({
    result: false, retry: true, sameArgsOnRetry: true, step: 'result',
  });
  expect(typed.retry.rpc[0][1]).toEqual(typed.retry.rpc[1][1]);
});
