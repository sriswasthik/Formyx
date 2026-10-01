import { defineConfig, devices } from '@playwright/test';
import { AUTH_STATE_PATH } from './tests/helpers.js';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    // Signs up one user and saves their session for the signed-in tests.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        storageState: AUTH_STATE_PATH,
      },
      dependencies: ['setup'],
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        hasTouch: true,
        storageState: AUTH_STATE_PATH,
      },
      dependencies: ['setup'],
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
      // Every run signs up new users; keep the per-IP sign-up limit out of the way.
      env: { AUTH_RATE_LIMIT_MAX: '1000' },
    },
    {
      command: 'pnpm --filter @formyx/web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  ],
});
