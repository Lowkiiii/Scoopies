import { defineConfig, devices } from '@playwright/test';

const baseURL =
  process.env.MATCHA_LUNA_PRODUCTION_URL ||
  'https://lowkiiii.github.io/Scoopies/';

export default defineConfig({
  testDir: './tests/production',
  outputDir: './test-results/production-smoke',
  preserveOutput: 'never',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 180_000,
  expect: {
    timeout: 60_000,
  },
  reporter: [['line']],
  use: {
    baseURL,
    serviceWorkers: 'block',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'production-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
});
