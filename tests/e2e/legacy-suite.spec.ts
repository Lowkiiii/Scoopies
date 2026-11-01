import { expect, test } from '@playwright/test';

const LEGACY_TEST_BASELINE = 182;

test('the existing browser regression suite remains green', async ({ page }, testInfo) => {
  test.setTimeout(210_000);
  await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/, async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: 'window.supabase={createClient:function(){throw new Error("Supabase is disabled in browser tests");}};',
    });
  });
  await page.goto('/tests/costing.test.html', { waitUntil: 'domcontentloaded' });

  const result = page.locator('#result');
  await expect(result).toHaveText(/^(?:PASS|FAIL)/, { timeout: 180_000 });

  const output = (await result.innerText()).trim();
  await testInfo.attach('legacy-suite-result', {
    body: output,
    contentType: 'text/plain',
  });

  expect(
    output,
    `The protected browser baseline must remain exactly ${LEGACY_TEST_BASELINE} passing tests. ` +
      'When tests are intentionally added or removed, review the result and update this baseline in the same change.',
  ).toBe(`PASS ${LEGACY_TEST_BASELINE} tests`);
});
