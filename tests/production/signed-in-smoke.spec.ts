import { expect, test, type Request } from '@playwright/test';
import { posOperationsNames } from '../e2e/operations-contract';
import { stateBindingNames } from '../e2e/state-contract';

const READ_ONLY_RPC_NAMES = new Set([
  'pos_get_catalog_v2',
  'pos_get_end_of_day_summary',
  'pos_get_my_businesses',
  'pos_get_publication_status',
  'pos_get_recent_sales_v2',
  'pos_get_shift_status',
  'pos_inventory_get_items',
  'pos_inventory_get_transactions',
]);

function requestAudit(request: Request): {
  businessWrite: boolean;
  label: string;
} {
  const method = request.method().toUpperCase();
  const url = new URL(request.url());
  const path = url.pathname;
  const restMarker = '/rest/v1/';
  const rpcMarker = '/rest/v1/rpc/';
  const storageMarker = '/storage/v1/object';
  const restIndex = path.indexOf(restMarker);
  const rpcIndex = path.indexOf(rpcMarker);
  const storageIndex = path.indexOf(storageMarker);
  const isBusinessSurface = restIndex >= 0 || storageIndex >= 0;
  const safeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(method);
  const rpcName =
    rpcIndex >= 0
      ? decodeURIComponent(
          path.slice(rpcIndex + rpcMarker.length).split('/')[0] || '',
        )
      : '';
  const readOnlyRpc =
    method === 'POST' && rpcName !== '' && READ_ONLY_RPC_NAMES.has(rpcName);
  let label = method + ' ';
  if (rpcName) label += '/rest/v1/rpc/' + rpcName;
  else if (restIndex >= 0) {
    const resource = decodeURIComponent(
      path.slice(restIndex + restMarker.length).split('/')[0] || '',
    );
    label += '/rest/v1/' + resource;
  } else if (storageIndex >= 0) label += storageMarker;
  else label += 'non-business';
  return {
    businessWrite: isBusinessSurface && !safeMethod && !readOnlyRpc,
    label,
  };
}

test('signed-in production reads the POS Stocks and Costing workspaces without mutations', async ({
  page,
}) => {
  const email = process.env.MATCHA_LUNA_SMOKE_EMAIL;
  const password = process.env.MATCHA_LUNA_SMOKE_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Configure MATCHA_LUNA_SMOKE_EMAIL and MATCHA_LUNA_SMOKE_PASSWORD as protected production-smoke environment secrets.',
    );
  }

  const blockedNetworkBusinessWrites: string[] = [];
  const escapedNetworkBusinessWrites: string[] = [];
  await page.route('**/*', async (route) => {
    const audit = requestAudit(route.request());
    if (audit.businessWrite) {
      blockedNetworkBusinessWrites.push(audit.label);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  page.on('requestfinished', (request) => {
    const audit = requestAudit(request);
    if (audit.businessWrite) escapedNetworkBusinessWrites.push(audit.label);
  });

  const observedErrors = {
    page: 0,
    console: 0,
    request: 0,
    server: 0,
  };
  page.on('pageerror', () => observedErrors.page++);
  page.on('console', (message) => {
    if (message.type() === 'error') observedErrors.console++;
  });
  page.on('requestfailed', () => observedErrors.request++);
  page.on('response', (response) => {
    if (response.status() >= 500) observedErrors.server++;
  });

  const response = await page.goto('./', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  await expect(page.locator('#authGate')).toBeVisible();

  await page.evaluate(async (readOnlyRpcNames) => {
    const root = window as typeof window & Record<string, any>;
    await root.MatchaLunaApp.ready;
    const client = root.cloud.client;
    const originalRpc = client.rpc;
    const allowed = new Set(readOnlyRpcNames);
    const blockedRpcNames: string[] = [];
    client.rpc = function (name: string, ...args: unknown[]) {
      if (!allowed.has(String(name))) {
        blockedRpcNames.push(String(name));
        return Promise.reject({
          code: 'SMOKE_READ_ONLY',
          message: 'Production smoke blocked a write-capable RPC.',
        });
      }
      return originalRpc.call(this, name, ...args);
    };
    root.__productionSmokeBlockedRpcNames = blockedRpcNames;
    root.__restoreProductionSmokeRpc = () => {
      client.rpc = originalRpc;
      delete root.__productionSmokeBlockedRpcNames;
      delete root.__restoreProductionSmokeRpc;
    };
  }, Array.from(READ_ONLY_RPC_NAMES));

  const workspaceBoundary = await page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    return {
      names: Object.keys(root.MatchaLunaApp.domains.workspace || {}),
      posNames: Object.keys(root.MatchaLunaApp.domains.pos || {}),
      stateNames: Object.keys(root.MatchaLunaApp.domains.state || {}),
      runtime: Array.from(
        document.querySelectorAll<HTMLScriptElement>(
          'script[data-matcha-luna-runtime]',
        ),
        (script) => script.dataset.matchaLunaRuntime,
      ),
      stateRequests: performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => /\/assets\/js\/state\.js(?:[?#]|$)/.test(name)),
    };
  });
  expect(workspaceBoundary.names).toHaveLength(18);
  expect(workspaceBoundary.posNames).toHaveLength(79);
  expect(workspaceBoundary.posNames.slice(0, posOperationsNames.length)).toEqual(
    posOperationsNames,
  );
  expect(workspaceBoundary.stateNames).toEqual(stateBindingNames);
  expect(workspaceBoundary.runtime).toEqual(['boot.js', 'start.js']);
  expect(workspaceBoundary.stateRequests).toEqual([]);

  await page.locator('#authEmail').fill(email);
  await page.locator('#authPass').fill(password);
  await page.locator('[data-act="doLogin"]').click();
  await page.evaluate(() => {
    const emailInput = document.getElementById('authEmail') as HTMLInputElement;
    const passwordInput = document.getElementById('authPass') as HTMLInputElement;
    if (emailInput) emailInput.value = '';
    if (passwordInput) passwordInput.value = '';
  });
  await expect(page.locator('#authGate')).toBeHidden();
  await expect(page.locator('#syncStatus')).toContainText('Saved to cloud');

  await page.waitForFunction(() => {
    const root = window as typeof window & Record<string, any>;
    return Boolean(
      root.session?.user &&
        root.cloud?.connected &&
        root.costingCloudReady &&
        !root.costingCloudLoading &&
        root.posContext?.businessId &&
        root.posContext?.loaded &&
        !root.posContext?.loading &&
        !root.posCheckout?.catalogLoading &&
        root.posCheckout?.catalog?.length,
    );
  });

  await page.locator('nav button[data-tab="pos"]').click();
  await expect(page.locator('section#pos')).toHaveClass(/active/);
  await expect(
    page.locator('#posRoot [data-act="addPosProduct"]').first(),
  ).toBeVisible();
  await expect(page.locator('#posRoot [data-act="setPosPayment"]')).toHaveCount(
    3,
  );
  await expect(page.locator('#posRoot')).not.toContainText('Menu unavailable');
  await expect(page.locator('#posRoot')).not.toContainText(
    'Shift status unavailable',
  );

  const stockCanManage = await page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    return ['owner', 'manager'].includes(String(root.posContext.role));
  });
  await page.locator('nav button[data-tab="stocks"]').click();
  await expect(page.locator('section#stocks')).toHaveClass(/active/);
  await page.waitForFunction(() => {
    const root = window as typeof window & Record<string, any>;
    return Boolean(
      root.stockState?.loaded &&
        !root.stockState?.loading &&
        !root.stockState?.refreshing,
    );
  });
  await expect(page.locator('#stockRoot .stock-head h2')).toHaveText('Stocks');
  await expect(
    page.locator('#stockResults [data-stock-item]').first(),
  ).toBeVisible();
  await expect(page.locator('#stockRoot')).not.toContainText('Retry Stocks');
  const stockResult = await page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    return {
      error: String(root.stockState?.error || ''),
      itemCount: Number(root.stockState?.items?.length || 0),
    };
  });
  expect(stockResult.error).toBe('');
  expect(stockResult.itemCount).toBeGreaterThan(0);

  const costingTabs = [
    {
      tab: 'ingredients',
      row: '#ingTable tr[data-entity="ingredient"]',
    },
    { tab: 'recipes', row: '#recipeList [data-entity="recipe"]' },
    { tab: 'products', row: '#productList [data-entity="product"]' },
  ];
  for (const { tab, row } of costingTabs) {
    await page.locator(`nav button[data-tab="${tab}"]`).click();
    await expect(page.locator(`section#${tab}`)).toHaveClass(/active/);
    await expect(page.locator(row).first()).toBeVisible();
  }
  await page.waitForFunction(() => {
    const root = window as typeof window & Record<string, any>;
    return !root.posContext?.loading;
  });
  const costingResult = await page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    return {
      ingredients: Number(root.state?.ingredients?.length || 0),
      recipes: Number(root.state?.recipes?.length || 0),
      products: Number(root.state?.products?.length || 0),
      cloudReady: Boolean(root.costingCloudReady),
      localDirty: Boolean(root.localDirty),
      pendingSave: Boolean(root.pendingSave),
    };
  });
  expect(costingResult.ingredients).toBeGreaterThan(0);
  expect(costingResult.recipes).toBeGreaterThan(0);
  expect(costingResult.products).toBeGreaterThan(0);
  expect(costingResult.cloudReady).toBe(true);
  expect(costingResult.localDirty).toBe(false);
  expect(costingResult.pendingSave).toBe(false);

  const blockedRpcNames = await page.evaluate(() => {
    const root = window as typeof window & Record<string, any>;
    const blocked = Array.from(root.__productionSmokeBlockedRpcNames || []).map(
      String,
    );
    root.__restoreProductionSmokeRpc?.();
    return blocked;
  });
  expect(blockedRpcNames).toEqual(
    stockCanManage ? ['pos_inventory_sync_items'] : [],
  );
  expect(blockedNetworkBusinessWrites).toEqual([]);
  expect(escapedNetworkBusinessWrites).toEqual([]);

  expect(observedErrors).toEqual({
    page: 0,
    console: 0,
    request: 0,
    server: 0,
  });
});
