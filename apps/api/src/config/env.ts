import { enforcementModeSchema, entitlementsModeSchema } from '@formyx/shared';
import { z } from 'zod';
import { KeyRingError, parseKeyRing } from '../lib/encryption.js';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

/** Comma-separated origins, normalised (`http://localhost:5173/` -> `http://localhost:5173`). */
const originList = z
  .string()
  .default('http://localhost:5173')
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .pipe(
    z
      .array(z.url({ protocol: /^https?$/, error: 'Must be an http(s) URL' }))
      .min(1, 'At least one origin is required'),
  )
  .transform((origins) => origins.map((origin) => new URL(origin).origin));

/**
 * Express `trust proxy`: "false" (default), a hop count such as "1" (recommended behind one
 * load balancer), "true", or a list of trusted addresses such as "loopback, 10.0.0.0/8".
 * Rate limiting keys on the client IP, so this must match the hosting setup.
 */
const trustProxy = z
  .string()
  .default('false')
  .transform((value): boolean | number | string => {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === 'false') return false;
    if (trimmed === 'true') return true;
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    return trimmed;
  });

/** An optional setting where an empty value means "not set". */
const optionalSecret = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

/** An http(s) base URL without a trailing slash, for services tests replace with fakes. */
const serviceUrl = (fallback: string) =>
  z
    .url({ protocol: /^https?$/, error: 'Must be an http(s) URL' })
    .default(fallback)
    .transform((url) => url.replace(/\/+$/, ''));

/** A Razorpay plan id, `plan_...`; not set means that plan can't be bought. */
const razorpayPlanId = optionalSecret.pipe(
  z
    .string()
    .regex(/^plan_\w+$/, 'Must be a Razorpay plan id (plan_...)')
    .optional(),
);

/** `ENCRYPTION_KEYS`: `<id>:<base64 32-byte key>`, comma-separated, newest first. */
const keyRing = z
  .string()
  .trim()
  .optional()
  .transform((value, context) => {
    if (!value) return undefined;
    try {
      return parseKeyRing(value);
    } catch (error) {
      context.addIssue({
        code: 'custom',
        message: error instanceof KeyRingError ? error.message : 'Could not read the keys',
      });
      return z.NEVER;
    }
  });

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  CORS_ORIGIN: originList,
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  TRUST_PROXY: trustProxy,
  DATABASE_URL: z
    .string({ error: 'Required' })
    .pipe(z.url({ protocol: /^postgres(ql)?$/, error: 'Must be a postgres:// connection string' })),
  JWT_SECRET: z.string({ error: 'Required' }).min(32, 'Must be at least 32 characters'),
  /** bcrypt work factor. Each step doubles hashing time; 12 is about 250ms on a modern CPU. */
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  /** Allowed sign-up requests and failed log-in attempts per IP per 15 minutes. */
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  /** Allowed submissions per IP per form per 15 minutes. */
  SUBMISSION_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  /** Allowed invite emails (new or sent again) per user per 15 minutes. */
  INVITE_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  /**
   * Allowed API requests per signed-in user (or per IP when signed out) per 15 minutes, for
   * everything outside the public form endpoints. A ceiling for floods, far above normal use.
   */
  API_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(3000),
  /**
   * Lets webhooks use plain http and reach localhost and private networks. For development
   * only: on a server it would let anyone with a form send requests inside your network.
   */
  WEBHOOK_ALLOW_PRIVATE_URLS: z
    .enum(['true', 'false'], { error: 'Use true or false' })
    .default('false')
    .transform((value) => value === 'true'),
  /**
   * Turns on the shared demo account ("Try the demo" on the landing page). It is set up on the
   * first visit; reset it nightly with `pnpm demo:reset`.
   */
  DEMO_ENABLED: z
    .enum(['true', 'false'], { error: 'Use true or false' })
    .default('false')
    .transform((value) => value === 'true'),
  /**
   * `all_unlocked` (default in development/test): every workspace gets every feature.
   * `enforced` (default in production): each workspace gets what its plan includes.
   */
  ENTITLEMENTS_MODE: entitlementsModeSchema.default(
    process.env.NODE_ENV === 'production' ? 'enforced' : 'all_unlocked',
  ),
  /** Where the web app lives, for links in emails. */
  APP_URL: z
    .url({ protocol: /^https?$/, error: 'Must be an http(s) URL' })
    .default('http://localhost:5173')
    .transform((url) => new URL(url).origin),
  /** Sends notification emails through Resend. Without it, emails are logged instead of sent. */
  RESEND_API_KEY: optionalSecret,
  /** Sender of notification emails; its domain must be verified in Resend. */
  EMAIL_FROM: z.string().trim().min(3).default('Formyx <notifications@formyx.app>'),
  /**
   * Development and tests without Resend: also writes each email to this folder as JSON, so
   * links in them (invites) can be followed. Ignored in production.
   */
  EMAIL_OUTBOX_DIR: optionalSecret,
  /** Cloudinary account for file uploads. Without all three, uploads are switched off. */
  CLOUDINARY_CLOUD_NAME: optionalSecret,
  CLOUDINARY_API_KEY: optionalSecret,
  CLOUDINARY_API_SECRET: optionalSecret,
  /** Top-level Cloudinary folder for everything this app uploads. */
  CLOUDINARY_FOLDER: z
    .string()
    .trim()
    .regex(/^[a-z0-9_-]+$/i, 'Use letters, digits, - and _')
    .default('formyx'),
  /**
   * Cloudinary's API. Only changed to point at a stand-in (e2e/scripts/fake-cloudinary.mjs)
   * for end-to-end tests and development without an account.
   */
  CLOUDINARY_API_URL: z
    .url({ protocol: /^https?$/, error: 'Must be an http(s) URL' })
    .default('https://api.cloudinary.com')
    .transform((url) => url.replace(/\/+$/, '')),
  /**
   * Keys that seal secrets at rest: integration tokens, webhook secrets, chat webhook URLs.
   * `<id>:<base64 32-byte key>`, comma-separated, newest first; make one with
   * `pnpm --filter @formyx/api keys:new`. Without it, a key is derived from JWT_SECRET, which
   * is fine for development but ties every stored secret to the session secret.
   */
  ENCRYPTION_KEYS: keyRing,
  /**
   * Runs background jobs (webhooks, emails, integrations, hourly upkeep) in this process.
   * `off` for an API that only queues them, when a separate `pnpm jobs:worker` runs them.
   */
  WORKERS: z
    .enum(['on', 'off'], { error: 'Use on or off' })
    .default('on')
    .transform((value) => value === 'on'),
  /**
   * Where the job queue connects. Defaults to DIRECT_URL, then DATABASE_URL: a direct
   * connection, since connection poolers in transaction mode can't hold its locks.
   */
  DIRECT_URL: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)
    .pipe(
      z
        .url({ protocol: /^postgres(ql)?$/, error: 'Must be a postgres:// connection string' })
        .optional(),
    ),
  /**
   * Google OAuth client, for signing in with Google and for Google Sheets. Without both,
   * neither is available.
   */
  GOOGLE_CLIENT_ID: optionalSecret,
  GOOGLE_CLIENT_SECRET: optionalSecret,
  /** Google's sign-in and APIs. Only changed for end-to-end tests (a fake Google). */
  GOOGLE_OAUTH_URL: serviceUrl('https://accounts.google.com'),
  GOOGLE_TOKEN_URL: serviceUrl('https://oauth2.googleapis.com'),
  GOOGLE_SHEETS_URL: serviceUrl('https://sheets.googleapis.com'),
  /** Zoho OAuth client, for signing in with Zoho. Without both, the Zoho button is hidden. */
  ZOHO_CLIENT_ID: optionalSecret,
  ZOHO_CLIENT_SECRET: optionalSecret,
  /**
   * The Zoho data centre the client was made in (https://accounts.zoho.in for India). People
   * from other data centres come back with their own, which must be one of Zoho's.
   */
  ZOHO_ACCOUNTS_URL: serviceUrl('https://accounts.zoho.com'),
  /** Notion public integration, for Notion. Without both, Notion can't be connected. */
  NOTION_CLIENT_ID: optionalSecret,
  NOTION_CLIENT_SECRET: optionalSecret,
  NOTION_API_URL: serviceUrl('https://api.notion.com'),
  /** Sentry project DSN for the API. Empty: errors are only logged. */
  SENTRY_DSN: optionalSecret.pipe(z.url({ error: 'Must be a Sentry DSN URL' }).optional()),
  /** The release errors are filed under; Render sets RENDER_GIT_COMMIT for every deploy. */
  RENDER_GIT_COMMIT: optionalSecret,
  /**
   * PostHog project API key for product analytics (a few server-side events, see
   * lib/product-analytics.ts). Empty: nothing is sent.
   */
  POSTHOG_KEY: optionalSecret,
  /** PostHog's ingestion host: https://eu.i.posthog.com (EU) or https://us.i.posthog.com. */
  POSTHOG_HOST: serviceUrl('https://eu.i.posthog.com'),
  /** Where feedback from the app is emailed. Empty: it is only stored. */
  FEEDBACK_EMAIL: optionalSecret.pipe(z.email({ error: 'Must be an email address' }).optional()),
  /**
   * Razorpay API keys, for subscriptions. Without the keys, the webhook secret and all four
   * plan ids, checkout is off. Test keys (`rzp_test_`) unless RAZORPAY_LIVE is on.
   */
  RAZORPAY_KEY_ID: optionalSecret.pipe(
    z
      .string()
      .regex(/^rzp_(test|live)_\w+$/, 'Must be a Razorpay key id (rzp_test_... or rzp_live_...)')
      .optional(),
  ),
  /**
   * Takes real payments: live keys (`rzp_live_`) are refused without it, and test keys with it.
   * Turned on by hand, only after a final run through checkout in test mode
   * (docs/launch-checklist.md).
   */
  RAZORPAY_LIVE: z
    .enum(['true', 'false'], { error: 'Use true or false' })
    .default('false')
    .transform((value) => value === 'true'),
  RAZORPAY_KEY_SECRET: optionalSecret,
  /** Signs Razorpay's webhooks; set in the Razorpay dashboard with the webhook's URL. */
  RAZORPAY_WEBHOOK_SECRET: optionalSecret,
  /** Razorpay's API. Only changed for tests (a fake Razorpay). */
  RAZORPAY_API_URL: serviceUrl('https://api.razorpay.com'),
  /** Razorpay plan ids (`plan_...`) for each paid plan and interval; `billing:sync-plans` checks them. */
  RAZORPAY_PLAN_PRO_MONTHLY: razorpayPlanId,
  RAZORPAY_PLAN_PRO_YEARLY: razorpayPlanId,
  RAZORPAY_PLAN_BUSINESS_MONTHLY: razorpayPlanId,
  RAZORPAY_PLAN_BUSINESS_YEARLY: razorpayPlanId,
  /**
   * What happens once a workspace has had its plan's responses for the month: `soft` (the
   * default) keeps accepting them and warns the owner; `hard` shows new visitors that the form
   * is not taking responses. Responses already being filled in are always saved.
   */
  ENFORCEMENT_MODE: enforcementModeSchema.default('soft'),
  /** Looks up Indian PIN codes for address questions (India Post's public API). */
  PINCODE_API_URL: z
    .url({ protocol: /^https?$/, error: 'Must be an http(s) URL' })
    .default('https://api.postalpincode.in/pincode'),
  /**
   * Publishing needs a confirmed email address. Off by default: switch it on once emails reach
   * everyone (a domain verified in Resend). Google and Zoho accounts are confirmed already.
   */
  REQUIRE_EMAIL_VERIFICATION: z
    .enum(['on', 'off'], { error: 'Use on or off' })
    .default('off')
    .transform((value) => value === 'on'),
  /**
   * New accounts' limits for their first days (NEW_ACCOUNT_LIMITS in packages/shared). Only
   * switched off for end-to-end tests, whose accounts are always minutes old.
   */
  NEW_ACCOUNT_LIMITS: z
    .enum(['on', 'off'], { error: 'Use on or off' })
    .default('on')
    .transform((value) => value === 'on'),
  /**
   * Google Safe Browsing API key: links in forms and webhook addresses are also looked up there.
   * Empty: only the built-in blocklist (and BLOCKED_LINK_DOMAINS) is used.
   */
  GOOGLE_SAFE_BROWSING_KEY: optionalSecret,
  /** Safe Browsing's API. Only changed for tests. */
  SAFE_BROWSING_URL: serviceUrl('https://safebrowsing.googleapis.com'),
  /** More domains to refuse in links and webhooks, comma-separated: `bad.example, worse.example`. */
  BLOCKED_LINK_DOMAINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((domain) =>
          domain
            .trim()
            .toLowerCase()
            .replace(/^\.+|\.+$/g, ''),
        )
        .filter(Boolean),
    ),
  /**
   * Cloudflare Turnstile, the spam check forms may switch on. Empty outside production:
   * Cloudflare's test keys, which always pass. Empty in production: the option is hidden.
   */
  TURNSTILE_SITE_KEY: optionalSecret,
  TURNSTILE_SECRET_KEY: optionalSecret,
  /** Turnstile's API. Only changed for tests. */
  TURNSTILE_URL: serviceUrl('https://challenges.cloudflare.com'),
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvError';
  }
}

/**
 * Live payments only on purpose: a live key without RAZORPAY_LIVE, or RAZORPAY_LIVE with a test
 * key (or none), stops the API from starting rather than charging, or failing to charge, anyone.
 */
function checkRazorpayMode(env: Env): void {
  const key = env.RAZORPAY_KEY_ID;
  const live = key?.startsWith('rzp_live_') ?? false;
  if (live && !env.RAZORPAY_LIVE) {
    throw new EnvError(
      'RAZORPAY_KEY_ID is a live key, but RAZORPAY_LIVE is not true. Set RAZORPAY_LIVE=true only ' +
        'after a final test-mode run of checkout (docs/launch-checklist.md).',
    );
  }
  if (env.RAZORPAY_LIVE && !live) {
    throw new EnvError(
      'RAZORPAY_LIVE is true, so RAZORPAY_KEY_ID must be a live key (rzp_live_...).',
    );
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvError(z.prettifyError(result.error));
  }
  checkRazorpayMode(result.data);
  return result.data;
}
