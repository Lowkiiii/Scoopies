import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173/Scoopies/';
const chromiumChannel = process.env.PLAYWRIGHT_CHANNEL || undefined;

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/playwright-artifacts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview:test',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium-desktop',
      testMatch: /.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
        channel: chromiumChannel,
      },
    },
    {
      name: 'mobile-chrome',
      testMatch: /smoke\.spec\.ts/,
      use: {
        ...devices['Pixel 5'],
        channel: chromiumChannel,
      },
    },
    {
      name: 'mobile-safari',
      testMatch: /smoke\.spec\.ts/,
      use: {
        ...devices['iPhone 13'],
        browserName: 'webkit',
      },
    },
  ],
});
