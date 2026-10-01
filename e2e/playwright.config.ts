import { defineConfig, devices } from '@playwright/test';
import { AUTH_STATE_PATH, OUTBOX_DIR } from './tests/helpers.js';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // The dev server compiles each page on its first visit, so on a cold start the first look at
  // a heavy page (charts, tables) can take several seconds.
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    // Signs up one user and saves their session for the signed-in tests.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    // Then compiles the heavy pages once, before the tests start in parallel.
    { name: 'warm-up', testMatch: /warm-up\.setup\.ts/, dependencies: ['setup'] },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        storageState: AUTH_STATE_PATH,
      },
      dependencies: ['warm-up'],
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        hasTouch: true,
        storageState: AUTH_STATE_PATH,
      },
      dependencies: ['warm-up'],
    },
  ],
  webServer: [
    {
      // Without `watch`: tests need no reloads, and on Windows `tsx watch` stalls while loading
      // the Prisma client when stdin is a pipe, as Playwright makes it.
      command:
        'pnpm --filter @formyx/api exec tsx --conditions=@formyx/source --env-file-if-exists=.env src/index.ts',
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: !isCI,
      timeout: 60_000,
      env: {
        // Every run signs up new users and sends invites; keep the limits out of the way.
        AUTH_RATE_LIMIT_MAX: '1000',
        INVITE_RATE_LIMIT_MAX: '1000',
        // Emails land here, so tests can follow invite links.
        EMAIL_OUTBOX_DIR: OUTBOX_DIR,
        // Tests receive webhooks on 127.0.0.1.
        WEBHOOK_ALLOW_PRIVATE_URLS: 'true',
      },
    },
    {
      command: 'pnpm --filter @formyx/web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  ],
});
