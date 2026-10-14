import { referralCodeSchema, type ReferralLookup, type ReferralSummary } from '@formyx/shared';
import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { AppDependencies } from '../app.js';
import { AppError } from '../lib/app-error.js';
import { routeParam } from '../lib/route-param.js';
import { getAuth, type AuthGuards } from '../middleware/auth.js';
import { createReferralService } from '../referrals/referrals.js';

/** The sign-up page looks a code up once; this keeps codes from being guessed in bulk. */
const LOOKUPS_PER_15_MINUTES = 30;

/**
 * `GET /api/referrals`: the signed-in person's referral code and how their referrals are doing.
 * `GET /api/public/referrals/:code`: who a code belongs to (first name only), for sign-up.
 */
export function createReferralsRouter(
  { prisma }: AppDependencies,
  { requireAuth, requireRealAccount }: AuthGuards,
): Router {
  const router = Router();
  const referrals = createReferralService(prisma);
  const limit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: LOOKUPS_PER_15_MINUTES,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError(429, 'RATE_LIMITED', 'Too many requests. Try again in a few minutes.'));
    },
  });

  // The shared demo account has no link to share.
  router.get('/referrals', requireAuth, requireRealAccount, async (req, res) => {
    const body: ReferralSummary = await referrals.summary(getAuth(req).userId);
    res.json(body);
  });

  router.get('/public/referrals/:code', limit, async (req, res) => {
    const code = referralCodeSchema.safeParse(routeParam(req, 'code').toUpperCase());
    const found = code.success ? await referrals.lookup(code.data) : null;
    if (!found) throw new AppError(404, 'NOT_FOUND', 'This referral link is not valid.');
    const body: ReferralLookup = found;
    res.json(body);
  });

  return router;
}
