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
    /** Every demo sign-in counts: each one is cheap, but nobody needs dozens. */
    demo: authLimiter(env.AUTH_RATE_LIMIT_MAX, false),
  };
}

/** Views are cheap and recorded once per browser session, so their limit is generous. */
const VIEW_LIMIT = 100;
const PROGRESS_LIMIT = 600;
const DRAFT_SAVE_LIMIT = 10;
const DRAFT_RESUME_LIMIT = 30;
const UNLOCK_LIMIT = 10;
const CODE_SEND_LIMIT = 5;
const CODE_CHECK_LIMIT = 20;
const EDIT_LOAD_LIMIT = 30;

/** Each client IP counts separately for each form, so one busy form cannot block another. */
function perFormKey(req: Request): string {
  return `${ipKeyGenerator(req.ip ?? '')}:${String(req.params.slug)}`;
}

function publicLimiter(
  limit: number,
  message: string,
  { skipSuccessfulRequests = false }: { skipSuccessfulRequests?: boolean } = {},
) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    skipSuccessfulRequests,
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
    /** A report per page and answer: room for long forms and several visits. */
    progress: publicLimiter(PROGRESS_LIMIT, 'Too many requests. Try again in a few minutes.'),
    /** Each save sends an email, so few are allowed. */
    saveDraft: publicLimiter(DRAFT_SAVE_LIMIT, 'Too many saves. Try again in a few minutes.'),
    /** Guessing a 256-bit token is hopeless; this just keeps the endpoint quiet. */
    resumeDraft: publicLimiter(
      DRAFT_RESUME_LIMIT,
      'Too many requests. Try again in a few minutes.',
    ),
    /** Wrong passwords count, right ones do not: slows guessing a form's password. */
    unlock: publicLimiter(UNLOCK_LIMIT, 'Too many tries. Wait a few minutes and try again.', {
      skipSuccessfulRequests: true,
    }),
    /** Each code is an email to someone, so few are sent. */
    sendCode: publicLimiter(CODE_SEND_LIMIT, 'Too many codes. Wait a few minutes and try again.'),
    /** Each code also allows only a few tries (CODE_ATTEMPTS). */
    checkCode: publicLimiter(CODE_CHECK_LIMIT, 'Too many tries. Wait a few minutes and try again.'),
    loadEdit: publicLimiter(EDIT_LOAD_LIMIT, 'Too many requests. Try again in a few minutes.'),
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

function limitedTo(limit: number, keyGenerator: (req: Request) => string, message: string) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    keyGenerator,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError(429, 'RATE_LIMITED', message));
    },
  });
}

/** Per-user limit on invite emails, new or sent again: owners cannot be used to spam. */
export function createInviteRateLimiter(env: Pick<Env, 'INVITE_RATE_LIMIT_MAX'>) {
  return limitedTo(
    env.INVITE_RATE_LIMIT_MAX,
    // Runs after requireAuth, so there is always a user.
    (req) => `user:${req.auth?.userId ?? ipKeyGenerator(req.ip ?? '')}`,
    'Too many invites. Try again in a few minutes.',
  );
}

/** Opening and accepting invite links, per IP. */
const INVITE_LINK_LIMIT = 60;

export function createInviteLinkRateLimiter() {
  return limitedTo(
    INVITE_LINK_LIMIT,
    (req) => ipKeyGenerator(req.ip ?? ''),
    'Too many requests. Try again in a few minutes.',
  );
}

/** "Send test event" makes a request to any URL an editor gives, so it is limited per user. */
const WEBHOOK_TEST_LIMIT = 30;

export function createWebhookTestRateLimiter() {
  return limitedTo(
    WEBHOOK_TEST_LIMIT,
    (req) => `user:${req.auth?.userId ?? ipKeyGenerator(req.ip ?? '')}`,
    'Too many test events. Try again in a few minutes.',
  );
}
