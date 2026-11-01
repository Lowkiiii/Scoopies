import { expect, test, type Page } from '@playwright/test';

async function openTestApp(page: Page) {
  await page.route(
    /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/,
    async (route) => {
      await route.fulfill({
        contentType: 'application/javascript',
        body: 'window.supabase={createClient:function(){throw new Error("Supabase is disabled in browser tests");}};',
      });
    },
  );
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

test.beforeEach(async ({ page }) => {
  await openTestApp(page);
});

test('delegated costing and POS controls remain reachable on mobile', async ({
  page,
}) => {
  await page.locator('nav button[data-tab="ingredients"]').click();
  await expect(page.locator('section#ingredients')).toHaveClass(/active/);

  const openCategory = page.locator('[data-act="openCategoryModal"]').first();
  await openCategory.click();
  await expect(page.locator('#categoryModal')).toBeVisible();
  await page.locator('#categoryName').fill('Tea Powders');
  await page.locator('#categoryName').press('Enter');
  await expect(page.locator('#categoryModal')).toBeHidden();
  await expect(
    page.locator('[data-act="setIngredientCategory"]', {
      hasText: 'Tea Powders',
    }),
  ).toBeVisible();

  await openCategory.click();
  await page.locator('#categoryName').fill('Discard with Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('#categoryModal')).toBeHidden();

  await openCategory.click();
  await expect(page.locator('#categoryModal')).toBeVisible();
  await page.locator('#categoryModal').click({ position: { x: 2, y: 2 } });
  await expect(page.locator('#categoryModal')).toBeHidden();

  await page.evaluate(() => {
    const app = window as typeof window & Record<string, any>;
    app.session = {
      user: { id: 'mobile-cashier', email: 'cashier@example.test' },
    };
    app.posContext = {
      loaded: true,
      loading: false,
      businessId: 'mobile-business',
      businessName: 'Matcha Luna',
      role: 'owner',
      publications: {},
      error: '',
    };
    app.posCheckout = app.freshPosCheckout();
    app.posCheckout.loaded = true;
    app.posCheckout.catalog = [
      {
        product_id: 'mobile-matcha',
        active_version_id: 'mobile-matcha-v1',
        product_name: 'Matcha Latte',
        size_snapshot: '12oz',
        selling_price_centavos: 17_000,
        matcha_options: [],
      },
    ];
    app.posCheckout.shift = {
      shift_id: 'mobile-shift',
      is_training: false,
      opened_at: '2026-11-02T08:00:00.000Z',
      opened_by_display_name: 'Mobile Cashier',
    };
    app.posCheckout.shiftStatus = {
      shift_id: 'mobile-shift',
      can_close_shift: true,
    };
    app.activateAppTab('pos', false);
    app.renderPos();
  });

  const product = page.locator(
    '[data-act="addPosProduct"][data-id="mobile-matcha"]',
  );
  await expect(product).toBeVisible();
  await product.click();
  await expect(page.locator('#posCartPanel')).toContainText('Matcha Latte');
  await expect(page.locator('#posCartPanel')).toContainText('₱170.00');

  await page
    .locator('[data-act="setPosPayment"][data-method="gcash"]')
    .click();
  await expect(page.locator('#posReference')).toBeVisible();
  await page.locator('#posReference').fill('GCASH-MOBILE-TEST');

  await page
    .locator('[data-act="setPosPayment"][data-method="cash"]')
    .click();
  await expect(page.locator('#posCashReceived')).toBeVisible();
  await page.locator('#posCashReceived').fill('200');
  await expect(page.locator('[data-act="reviewPosSale"]')).toBeEnabled();

  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const cart = document.getElementById('posCartPanel')!;
    const controls = Array.from(
      cart.querySelectorAll(
        '[data-act="setPosPayment"], #posCashReceived, [data-act="reviewPosSale"]',
      ),
    ) as HTMLElement[];
    return {
      viewportWidth: root.clientWidth,
      pageWidth: root.scrollWidth,
      cartClientWidth: cart.clientWidth,
      cartScrollWidth: cart.scrollWidth,
      controlsReachable: controls.every((control) => {
        const rect = control.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }),
    };
  });
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.cartScrollWidth).toBeLessThanOrEqual(
    layout.cartClientWidth + 1,
  );
  expect(layout.controlsReachable).toBe(true);
});
