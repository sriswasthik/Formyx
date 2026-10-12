import { entitlementsModeSchema } from '@formyx/shared';
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
   * `all_unlocked` (the default, for development and the beta): every workspace gets every
   * feature. `enforced`: each workspace gets what its plan includes.
   */
  ENTITLEMENTS_MODE: entitlementsModeSchema.default('all_unlocked'),
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
  /** Google OAuth client, for Google Sheets. Without both, Sheets can't be connected. */
  GOOGLE_CLIENT_ID: optionalSecret,
  GOOGLE_CLIENT_SECRET: optionalSecret,
  /** Google's sign-in and APIs. Only changed for end-to-end tests (a fake Google). */
  GOOGLE_OAUTH_URL: serviceUrl('https://accounts.google.com'),
  GOOGLE_TOKEN_URL: serviceUrl('https://oauth2.googleapis.com'),
  GOOGLE_SHEETS_URL: serviceUrl('https://sheets.googleapis.com'),
  /** Notion public integration, for Notion. Without both, Notion can't be connected. */
  NOTION_CLIENT_ID: optionalSecret,
  NOTION_CLIENT_SECRET: optionalSecret,
  NOTION_API_URL: serviceUrl('https://api.notion.com'),
  /** Looks up Indian PIN codes for address questions (India Post's public API). */
  PINCODE_API_URL: z
    .url({ protocol: /^https?$/, error: 'Must be an http(s) URL' })
    .default('https://api.postalpincode.in/pincode'),
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvError';
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvError(z.prettifyError(result.error));
  }
  return result.data;
}
