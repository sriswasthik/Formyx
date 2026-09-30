import { rateLimit } from 'express-rate-limit';
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
