import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const transitionRuntimeFiles = [
  'core.js',
  'runtime-factories.js',
  'state.js',
  'costing.js',
  'pos-catalog.js',
  'stocks.js',
  'workspace-sync.js',
  'pos-operations.js',
  'publication.js',
  'render-costing.js',
  'render-modals.js',
  'render-pos.js',
  'render-stocks.js',
  'support.js',
  'events.js',
  'boot.js',
  'compatibility.js',
  'start.js',
] as const;

const expectedListenerManifest = [
  { target: 'NAV', type: 'click', capture: false },
  { target: 'BODY', type: 'error', capture: true },
  { target: 'BODY', type: 'input', capture: false },
  { target: 'BODY', type: 'change', capture: false },
  { target: 'BODY', type: 'click', capture: false },
  { target: 'BODY', type: 'click', capture: false },
  { target: 'WINDOW', type: 'focus', capture: false },
  { target: 'WINDOW', type: 'online', capture: false },
  { target: 'BODY', type: 'focusout', capture: false },
  { target: 'BODY', type: 'pointerdown', capture: false },
  { target: 'BODY', type: 'pointermove', capture: false },
  { target: 'BODY', type: 'pointerup', capture: false },
  { target: 'BODY', type: 'pointercancel', capture: false },
  { target: 'BODY', type: 'lostpointercapture', capture: false },
  { target: 'BODY', type: 'keydown', capture: false },
] as const;

async function stubSupabase(page: Page) {
  await page.route(
    /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/,
    async (route) => {
      await route.fulfill({
        contentType: 'application/javascript',
        body: 'window.supabase={createClient:function(){throw new Error("Supabase is disabled in browser tests");}};',
      });
    },
  );
}

async function installListenerRecorder(page: Page) {
  await page.addInitScript(() => {
    const root = window as typeof window & {
      __matchaEventRegistrations?: Array<{
        target: string;
        type: string;
        capture: boolean;
      }>;
    };
    const registrations: Array<{
      target: string;
      type: string;
      capture: boolean;
    }> = [];
    root.__matchaEventRegistrations = registrations;
    const original = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) {
      let target = '';
      if (this === window) target = 'WINDOW';
      else if (this instanceof Element && this.tagName === 'BODY') target = 'BODY';
      else if (this instanceof Element && this.tagName === 'NAV') target = 'NAV';
      if (target) {
        registrations.push({
          target,
          type,
          capture:
            typeof options === 'boolean'
              ? options
              : Boolean(options && options.capture),
        });
      }
      return original.call(this, type, listener, options);
    };
  });
}

async function openPrimary(page: Page) {
  await stubSupabase(page);
  await page.goto('index.html?test=1', { waitUntil: 'load' });
  await page.evaluate(() =>
    (
      window as typeof window & {
        MatchaLunaApp: { ready: Promise<void> };
      }
    ).MatchaLunaApp.ready,
  );
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
}

async function openClassic(page: Page) {
  const builtHtml = readFileSync(
    resolve(process.cwd(), 'dist/index.html'),
    'utf8',
  );
  const classicScripts = transitionRuntimeFiles
    .map(
      (fileName) =>
        `<script src="/Scoopies/assets/js/${fileName}"></script>`,
    )
    .join('\n');
  const transitionHtml = builtHtml
    .replace(/\s*<script type="module"[^>]*><\/script>/, '')
    .replace('</body>', `${classicScripts}\n</body>`);

  await stubSupabase(page);
  await page.route(
    '**/index.html?test=1&events-transition=1',
    async (route) => {
      await route.fulfill({ contentType: 'text/html', body: transitionHtml });
    },
  );
  await page.goto('index.html?test=1&events-transition=1', {
    waitUntil: 'load',
  });
  await expect(page.locator('#syncStatus')).toHaveText('Test mode');
}

async function listenerManifest(page: Page) {
  return page.evaluate(() =>
    (
      window as typeof window & {
        __matchaEventRegistrations?: Array<{
          target: string;
          type: string;
          capture: boolean;
        }>;
      }
    ).__matchaEventRegistrations || [],
  );
}

async function collectEventFingerprint(page: Page) {
  return page.evaluate(async () => {
    const app = window as typeof window & Record<string, any>;
    const click = (element: Element) =>
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const field = (
      tagName: 'input' | 'select',
      id: string,
      value: string,
    ) => {
      let element = document.getElementById(id) as
        | HTMLInputElement
        | HTMLSelectElement
        | null;
      if (!element) {
        element = document.createElement(tagName);
        element.id = id;
        document.body.appendChild(element);
      }
      element.value = value;
      return element;
    };
    const action = (name: string) => {
      const button = document.createElement('button');
      button.dataset.act = name;
      document.body.appendChild(button);
      return button;
    };

    app.costingSourceCommitInFlight = false;
    app.session = null;
    app.publishModalOpen = false;
    let historyLoads = 0;
    app.loadHistory = () => {
      historyLoads += 1;
    };
    const missingTab = app.activateAppTab('missing-event-test-tab', true);
    const historyTab = app.activateAppTab('history', true);
    const activeAfterHistory =
      document.querySelector('nav button.active')?.getAttribute('data-tab') ||
      '';

    app.costingSourceCommitInFlight = true;
    click(document.querySelector('nav button[data-tab="ingredients"]')!);
    const activeWhileLocked =
      document.querySelector('nav button.active')?.getAttribute('data-tab') ||
      '';
    app.costingSourceCommitInFlight = false;

    const originalActivate = app.activateAppTab;
    const navCalls: unknown[][] = [];
    app.activateAppTab = (...args: unknown[]) => {
      navCalls.push(args);
      return true;
    };
    click(document.querySelector('nav button[data-tab="ingredients"]')!);
    app.activateAppTab = originalActivate;

    let stockResultRenders = 0;
    app.stockState = app.stockState || {};
    app.renderStockResults = () => {
      stockResultRenders += 1;
    };
    const stockSearch = field('input', 'stockSearch', 'oat milk');
    stockSearch.dispatchEvent(new Event('input', { bubbles: true }));
    const stockKind = field(
      'select',
      'stockKindFilter',
      'mixture',
    ) as HTMLSelectElement;
    if (!Array.from(stockKind.options).some((option) => option.value === 'mixture')) {
      stockKind.appendChild(new Option('Mixture', 'mixture'));
      stockKind.value = 'mixture';
    }
    stockKind.dispatchEvent(new Event('change', { bubbles: true }));

    let ingredientRenders = 0;
    app.ingredientUi = app.ingredientUi || {};
    app.renderIngredients = () => {
      ingredientRenders += 1;
    };
    const ingredientSearch = field('input', 'ingredientSearch', 'matcha');
    ingredientSearch.dispatchEvent(new Event('input', { bubbles: true }));

    let stockRefreshes = 0;
    app.openStocks = () => {
      stockRefreshes += 1;
      return Promise.resolve();
    };
    click(action('refreshStocks'));

    let stockRenders = 0;
    app.renderStocks = () => {
      stockRenders += 1;
    };
    const lowStatus = action('setStockStatus');
    lowStatus.dataset.status = 'low';
    click(lowStatus);

    const imageShell = document.createElement('div');
    const image = document.createElement('img');
    image.className = 'pos-drink-image';
    const fallback = document.createElement('span');
    fallback.className = 'pos-drink-image-fallback';
    fallback.hidden = true;
    imageShell.append(image, fallback);
    document.body.appendChild(imageShell);
    image.dispatchEvent(new Event('error'));

    let stockCloses = 0;
    app.closeStockModal = () => {
      stockCloses += 1;
      if (app.stockModal) app.stockModal.open = false;
    };
    const stockBackdrop = document.getElementById('stockModal')!;
    click(stockBackdrop);
    app.stockModal = app.stockModal || {};
    app.stockModal.open = true;
    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(escapeEvent);

    const pointerCalls: string[] = [];
    app.beginPosDrinkImageDrag = (event: Event) =>
      pointerCalls.push(`begin:${event.type}`);
    app.movePosDrinkImageDrag = (event: Event) =>
      pointerCalls.push(`move:${event.type}`);
    app.endPosDrinkImageDrag = (event: Event) =>
      pointerCalls.push(`end:${event.type}`);
    for (const type of [
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointercancel',
      'lostpointercapture',
    ]) {
      document.body.dispatchEvent(new Event(type, { bubbles: true }));
    }

    let remoteApplications = 0;
    app.pendingRemote = { revision: 'event-test' };
    app.appIsEditing = () => false;
    app.maybeApplyRemote = (remote: unknown) => {
      if (remote === app.pendingRemote) remoteApplications += 1;
    };
    document.body.dispatchEvent(new Event('focusout', { bubbles: true }));
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 90));

    let focusRemoteApplications = 0;
    let focusSubscriptions = 0;
    let focusProductRenders = 0;
    app.cloud.connected = true;
    app.pendingSave = false;
    app.costingCloudLoading = false;
    app.publishSubmitting = false;
    app.posCheckout = app.posCheckout || {};
    app.posCheckout.submitting = false;
    app.localDirty = false;
    app.session = { user: { id: 'events-focus-user' } };
    app.costingLoadGeneration = 40;
    app.cloudLoad = () => Promise.resolve({ source: 'focus-event' });
    app.costingRequestIsCurrent = (generation: number, userId: string) =>
      generation === 41 && userId === 'events-focus-user';
    app.maybeApplyRemote = () => {
      focusRemoteApplications += 1;
    };
    app.subscribeRealtime = () => {
      focusSubscriptions += 1;
    };
    app.renderProducts = () => {
      focusProductRenders += 1;
    };
    window.dispatchEvent(new Event('focus'));
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 0));

    let capturedOnlineSaves = 0;
    let replacementOnlineCalls = 0;
    app.localDirty = true;
    app.pendingSave = false;
    app.stockScopedSourceDeletes = () => [];
    app.cloudLoad = () => Promise.resolve(null);
    app.save = () => {
      capturedOnlineSaves += 1;
    };
    app.retryDirtySave = () => {
      replacementOnlineCalls += 1;
    };
    window.dispatchEvent(new Event('online'));
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 0));

    let loginCalls = 0;
    app.doLogin = () => {
      loginCalls += 1;
    };
    const email = document.getElementById('authEmail') as HTMLInputElement;
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    email.dispatchEvent(enterEvent);

    await Promise.resolve();
    return {
      missingTab,
      historyTab,
      historyLoads,
      activeAfterHistory,
      activeWhileLocked,
      navCalls,
      stockSearch: app.stockState.search,
      stockKind: app.stockState.kind,
      stockResultRenders,
      ingredientSearch: app.ingredientUi.search,
      ingredientRenders,
      stockRefreshes,
      stockStatus: app.stockState.status,
      stockRenders,
      imageHidden: image.hidden,
      fallbackHidden: fallback.hidden,
      stockCloses,
      escapePrevented: escapeEvent.defaultPrevented,
      pointerCalls,
      remoteApplications,
      focusRemoteApplications,
      focusSubscriptions,
      focusProductRenders,
      focusGeneration: app.costingLoadGeneration,
      focusCloudReady: app.costingCloudReady,
      focusCloudLoading: app.costingCloudLoading,
      capturedOnlineSaves,
      replacementOnlineCalls,
      loginCalls,
      enterPrevented: enterEvent.defaultPrevented,
    };
  });
}

test('typed Events installs the exact classic listener manifest once', async ({
  page,
}) => {
  await installListenerRecorder(page);
  await openPrimary(page);
  expect(await listenerManifest(page)).toEqual(expectedListenerManifest);

  await openClassic(page);
  expect(await listenerManifest(page)).toEqual(expectedListenerManifest);
});

test('typed Events preserves delegated behavior and live browser bindings', async ({
  page,
}) => {
  await openPrimary(page);
  const typed = await collectEventFingerprint(page);

  await openClassic(page);
  const classic = await collectEventFingerprint(page);

  expect(typed).toEqual(classic);
  expect(typed).toEqual({
    missingTab: false,
    historyTab: true,
    historyLoads: 1,
    activeAfterHistory: 'history',
    activeWhileLocked: 'history',
    navCalls: [['ingredients', true]],
    stockSearch: 'oat milk',
    stockKind: 'mixture',
    stockResultRenders: 2,
    ingredientSearch: 'matcha',
    ingredientRenders: 1,
    stockRefreshes: 1,
    stockStatus: 'low',
    stockRenders: 1,
    imageHidden: true,
    fallbackHidden: false,
    stockCloses: 2,
    escapePrevented: true,
    pointerCalls: [
      'begin:pointerdown',
      'move:pointermove',
      'end:pointerup',
      'end:pointercancel',
      'end:lostpointercapture',
    ],
    remoteApplications: 1,
    focusRemoteApplications: 1,
    focusSubscriptions: 1,
    focusProductRenders: 2,
    focusGeneration: 41,
    focusCloudReady: true,
    focusCloudLoading: false,
    capturedOnlineSaves: 1,
    replacementOnlineCalls: 0,
    loginCalls: 1,
    enterPrevented: true,
  });
});

test('typed Events retains the exact ordered 112-action dispatcher surface', () => {
  const classicSource = readFileSync(
    resolve(process.cwd(), 'assets/js/events.js'),
    'utf8',
  );
  const typedSource = readFileSync(
    resolve(process.cwd(), 'src/events/action-handler.ts'),
    'utf8',
  );
  const actionNames = (source: string) =>
    Array.from(source.matchAll(/case '([^']+)'/g), (match) => match[1]);
  const classicActions = actionNames(classicSource);
  const typedActions = actionNames(typedSource);

  expect(classicActions).toHaveLength(112);
  expect(typedActions).toEqual(classicActions);
});
