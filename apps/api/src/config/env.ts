import { z } from 'zod';

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
   * Lets webhooks use plain http and reach localhost and private networks. For development
   * only: on a server it would let anyone with a form send requests inside your network.
   */
  WEBHOOK_ALLOW_PRIVATE_URLS: z
    .enum(['true', 'false'], { error: 'Use true or false' })
    .default('false')
    .transform((value) => value === 'true'),
  /** Where the web app lives, for links in emails. */
  APP_URL: z
    .url({ protocol: /^https?$/, error: 'Must be an http(s) URL' })
    .default('http://localhost:5173')
    .transform((url) => new URL(url).origin),
  /** Sends notification emails through Resend. Without it, emails are logged instead of sent. */
  RESEND_API_KEY: optionalSecret,
  /** Sender of notification emails; its domain must be verified in Resend. */
  EMAIL_FROM: z.string().trim().min(3).default('Formyx <notifications@formyx.app>'),
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
