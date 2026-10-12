import { defineConfig, devices } from '@playwright/test';

// Performance of the public form on a slow phone, against the production build served as
// Vercel serves it (HTTP/2, Brotli; see perf/serve-h2.mjs): see perf/public-form.perf.ts. Run
// with `pnpm --filter @formyx/e2e perf`; PERF_HTTP1=1 serves it with `vite preview` instead.
// Ports differ from the end-to-end tests', so both can run beside a dev server.

const isCI = Boolean(process.env.CI);
const webPort = process.env.PERF_WEB_PORT ?? '4174';
const apiPort = process.env.PERF_API_PORT ?? '4104';
const http1 = Boolean(process.env.PERF_HTTP1);
const webUrl = `${http1 ? 'http' : 'https'}://localhost:${webPort}`;

export default defineConfig({
  testDir: './perf',
  testMatch: /\.perf\.ts$/,
  // One page at a time: measurements made side by side would slow each other down.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 300_000,
  reporter: isCI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: webUrl,
    // perf/serve-h2.mjs makes its own certificate.
    ignoreHTTPSErrors: true,
    // A mid-range Android phone, as Lighthouse's mobile runs assume.
    ...devices['Moto G4'],
    browserName: 'chromium',
  },
  webServer: [
    {
      command:
        'pnpm --filter @formyx/api exec tsx --conditions=@formyx/source --env-file-if-exists=.env src/index.ts',
      url: `http://localhost:${apiPort}/api/health`,
      reuseExistingServer: !isCI,
      // Starts beside the production build, which slows it down.
      timeout: 180_000,
      env: {
        PORT: apiPort,
        AUTH_RATE_LIMIT_MAX: '1000',
        API_RATE_LIMIT_MAX: '100000',
        APP_URL: webUrl,
        CORS_ORIGIN: webUrl,
      },
    },
    {
      // The build respondents get: minified, split, with the preloads index.html adds.
      command: `pnpm --filter @formyx/web build && ${
        http1
          ? `pnpm --filter @formyx/web preview --port ${webPort}`
          : `node perf/serve-h2.mjs ${webPort} ../apps/web/dist http://localhost:${apiPort}`
      }`,
      url: webUrl,
      ignoreHTTPSErrors: true,
      reuseExistingServer: !isCI,
      timeout: 240_000,
      env: {
        API_PROXY_TARGET: `http://localhost:${apiPort}`,
        // Public forms don't use live updates, but the build must not point at production's.
        VITE_REALTIME_URL: `http://localhost:${apiPort}`,
      },
    },
  ],
});
