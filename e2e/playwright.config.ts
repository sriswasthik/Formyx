import { defineConfig, devices } from '@playwright/test';
import razorpay from './scripts/razorpay-e2e.json' with { type: 'json' };
import { AUTH_STATE_PATH, OUTBOX_DIR } from './tests/helpers.js';

const isCI = Boolean(process.env.CI);
// Visual regression (tests/visual.spec.ts) runs on its own: E2E_VISUAL=1, Linux only.
const visual = Boolean(process.env.E2E_VISUAL);
// Ports can move, to run the tests beside a dev server that already uses the usual ones.
const webPort = process.env.E2E_WEB_PORT ?? '5173';
const apiPort = process.env.E2E_API_PORT ?? '4000';
const FAKE_SERVICES_PORT = process.env.E2E_FAKE_PORT ?? '4590';
const fakeServices = `http://localhost:${FAKE_SERVICES_PORT}`;
// Billing: a fake Razorpay (scripts/fake-razorpay.mjs) unless RAZORPAY_E2E=live, which keeps
// apps/api/.env's real test-mode keys and Razorpay's own Checkout (see tests/billing.spec.ts).
const liveRazorpay = process.env.RAZORPAY_E2E === 'live';
const fakeRazorpay: Record<string, string> = liveRazorpay
  ? {}
  : {
      RAZORPAY_KEY_ID: razorpay.keyId,
      RAZORPAY_KEY_SECRET: razorpay.keySecret,
      RAZORPAY_WEBHOOK_SECRET: razorpay.webhookSecret,
      RAZORPAY_API_URL: `${fakeServices}/razorpay`,
      ...Object.fromEntries(Object.entries(razorpay.plans).map(([name, plan]) => [name, plan.id])),
    };

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
    baseURL: `http://localhost:${webPort}`,
    trace: 'retain-on-failure',
  },
  projects: [
    // Signs up one user and saves their session for the signed-in tests.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    // Then compiles the heavy pages once, before the tests start in parallel.
    { name: 'warm-up', testMatch: /warm-up\.setup\.ts/, dependencies: ['setup'] },
    {
      name: 'desktop',
      testIgnore: [/visual\.spec\.ts/, /safari-inputs\.spec\.ts/],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        storageState: AUTH_STATE_PATH,
      },
      dependencies: ['warm-up'],
    },
    {
      name: 'mobile',
      testIgnore: [/visual\.spec\.ts/, /safari-inputs\.spec\.ts/],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        hasTouch: true,
        storageState: AUTH_STATE_PATH,
      },
      dependencies: ['warm-up'],
    },
    // Safari's engine, for the inputs that differ most between browsers.
    {
      name: 'webkit',
      testMatch: /safari-inputs\.spec\.ts/,
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1280, height: 800 },
        storageState: AUTH_STATE_PATH,
      },
      dependencies: ['warm-up'],
    },
    // Screenshots of every preset, compared with the baselines in tests/__screenshots__.
    ...(visual
      ? (['desktop', 'mobile'] as const).map((size) => ({
          name: `visual-${size}`,
          testMatch: /visual\.spec\.ts/,
          snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
          use: {
            ...devices['Desktop Chrome'],
            viewport:
              size === 'desktop' ? { width: 1280, height: 800 } : { width: 375, height: 812 },
            hasTouch: size === 'mobile',
            storageState: AUTH_STATE_PATH,
          },
          dependencies: ['warm-up'],
        }))
      : []),
  ],
  webServer: [
    {
      // Cloudinary and India Post, faked: uploads and PIN codes without outside calls.
      command: `node scripts/fake-cloudinary.mjs ${FAKE_SERVICES_PORT}`,
      url: `${fakeServices}/health`,
      reuseExistingServer: !isCI,
      timeout: 30_000,
    },
    {
      // Without `watch`: tests need no reloads, and on Windows `tsx watch` stalls while loading
      // the Prisma client when stdin is a pipe, as Playwright makes it.
      command:
        'pnpm --filter @formyx/api exec tsx --conditions=@formyx/source --env-file-if-exists=.env src/index.ts',
      url: `http://localhost:${apiPort}/api/health`,
      reuseExistingServer: !isCI,
      timeout: 60_000,
      env: {
        // Every run's accounts are minutes old: new accounts' limits are tested in the API.
        NEW_ACCOUNT_LIMITS: 'off',
        // Every run signs up new users and sends invites; keep the limits out of the way.
        AUTH_RATE_LIMIT_MAX: '1000',
        INVITE_RATE_LIMIT_MAX: '1000',
        API_RATE_LIMIT_MAX: '100000',
        // Emails land here, so tests can follow invite links.
        EMAIL_OUTBOX_DIR: OUTBOX_DIR,
        // Tests receive webhooks on 127.0.0.1.
        WEBHOOK_ALLOW_PRIVATE_URLS: 'true',
        PORT: apiPort,
        // Uploads go to the fake Cloudinary, signed with a made-up account.
        CLOUDINARY_CLOUD_NAME: 'formyx-e2e',
        CLOUDINARY_API_KEY: 'e2e-key',
        CLOUDINARY_API_SECRET: 'e2e-secret',
        CLOUDINARY_API_URL: fakeServices,
        PINCODE_API_URL: `${fakeServices}/pincode`,
        // Google Sheets and "Continue with Google" use a fake Google that agrees at once.
        // Zoho stays off, whatever a local .env says, so no test reaches the real one.
        ZOHO_CLIENT_ID: '',
        ZOHO_CLIENT_SECRET: '',
        GOOGLE_CLIENT_ID: 'e2e-google-client',
        GOOGLE_CLIENT_SECRET: 'e2e-google-secret',
        GOOGLE_OAUTH_URL: `${fakeServices}/google`,
        GOOGLE_TOKEN_URL: `${fakeServices}/google`,
        GOOGLE_SHEETS_URL: `${fakeServices}/google`,
        ...fakeRazorpay,
      },
    },
    {
      command: `pnpm --filter @formyx/web dev --port ${webPort}`,
      url: `http://localhost:${webPort}`,
      reuseExistingServer: !isCI,
      timeout: 60_000,
      env: {
        API_PROXY_TARGET: `http://localhost:${apiPort}`,
        ...(!liveRazorpay && {
          VITE_RAZORPAY_CHECKOUT_URL: `${fakeServices}/razorpay/checkout.js`,
        }),
      },
    },
  ],
});
