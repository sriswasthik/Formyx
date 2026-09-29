import { defineConfig, devices } from '@playwright/test';

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
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, hasTouch: true },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @formyx/api dev',
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @formyx/web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  ],
});
