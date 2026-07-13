import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT) || 5199;

/**
 * E2E config: loads the built extension (`.output/chrome-mv3`) into a persistent
 * Chromium and drives the real on-page bubble against a local fixture page.
 * Run with `yarn test:e2e` (builds first). Extensions need a persistent context,
 * so a single worker keeps the runs isolated and deterministic.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tests/e2e/server/serve.mjs',
    port: PORT,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
