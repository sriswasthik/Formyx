import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { Env } from '../config/env.js';
import { AppError } from '../lib/app-error.js';

const WINDOW_MS = 15 * 60 * 1000;

function authLimiter(limit: number, skipSuccessfulRequests: boolean) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    skipSuccessfulRequests,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError(429, 'RATE_LIMITED', 'Too many attempts. Try again in a few minutes.'));
    },
  });
}

/**
 * Per-IP limits for the auth endpoints. Counters live in memory, which is fine for a single
 * API instance; running several needs a shared store such as Redis.
 */
export function createAuthRateLimiters(env: Pick<Env, 'AUTH_RATE_LIMIT_MAX'>) {
  return {
    /** Every sign-up counts, to slow down mass account creation. */
    register: authLimiter(env.AUTH_RATE_LIMIT_MAX, false),
    /** Only failed log-ins count: slows password guessing without locking out a shared office IP. */
    login: authLimiter(env.AUTH_RATE_LIMIT_MAX, true),
  };
}

/** Views are cheap and recorded once per browser session, so their limit is generous. */
const VIEW_LIMIT = 100;

/** Each client IP counts separately for each form, so one busy form cannot block another. */
function perFormKey(req: Request): string {
  return `${ipKeyGenerator(req.ip ?? '')}:${String(req.params.slug)}`;
}

function publicLimiter(limit: number, message: string) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    keyGenerator: perFormKey,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError(429, 'RATE_LIMITED', message));
    },
  });
}

/** Per-IP, per-form limits for the public form endpoints, which need no account. */
export function createPublicRateLimiters(env: Pick<Env, 'SUBMISSION_RATE_LIMIT_MAX'>) {
  return {
    submit: publicLimiter(
      env.SUBMISSION_RATE_LIMIT_MAX,
      'Too many responses from your network. Try again in a few minutes.',
    ),
    view: publicLimiter(VIEW_LIMIT, 'Too many requests. Try again in a few minutes.'),
  };
}

/** Signatures for respondents' uploads: a few per file question, with room for retries. */
const UPLOAD_SIGNATURE_LIMIT = 60;

/** Per-IP, per-form limit on signing respondents' uploads, which needs no account. */
export function createUploadRateLimiter() {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: UPLOAD_SIGNATURE_LIMIT,
    keyGenerator: (req) => {
      const form = typeof req.query.form === 'string' ? req.query.form : '';
      return `${ipKeyGenerator(req.ip ?? '')}:${form}`;
    },
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError(429, 'RATE_LIMITED', 'Too many uploads. Try again in a few minutes.'));
    },
  });
}
