import {
  readAccountPreferences,
  unsubscribeInputSchema,
  type UnsubscribeResponse,
} from '@formyx/shared';
import { Router, type Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { AppDependencies } from '../app.js';
import { AppError } from '../lib/app-error.js';
import { readUnsubscribeToken } from '../lib/unsubscribe-token.js';

/** A link is clicked once or twice; this only keeps the endpoint quiet. */
const REQUESTS_PER_15_MINUTES = 30;

/**
 * `POST /api/public/unsubscribe` and `/resubscribe`: "Tips and reminders" off or on from a
 * lifecycle email's link, without signing in (the signed token says whose). Mail apps'
 * one-click unsubscribe (RFC 8058) posts with the token in the query; the web page sends it
 * as JSON. Never on GET: link scanners open links, and must not unsubscribe anyone.
 */
export function createUnsubscribeRouter({ env, prisma }: AppDependencies): Router {
  const router = Router();
  const limit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: REQUESTS_PER_15_MINUTES,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError(429, 'RATE_LIMITED', 'Too many requests. Try again in a few minutes.'));
    },
  });

  async function setProductEmails(req: Request, productEmails: boolean) {
    const fromQuery = typeof req.query.token === 'string' ? req.query.token : undefined;
    const { token } = unsubscribeInputSchema.parse(
      fromQuery === undefined ? req.body : { token: fromQuery },
    );
    const userId = readUnsubscribeToken(token, env.JWT_SECRET);
    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } })
      : null;
    if (!userId || !user) {
      throw new AppError(
        400,
        'BAD_REQUEST',
        'This link is not valid. Change emails in Preferences.',
      );
    }
    const preferences = { ...readAccountPreferences(user.preferences), productEmails };
    await prisma.user.update({ where: { id: userId }, data: { preferences } });
    const body: UnsubscribeResponse = { productEmails };
    return body;
  }

  router.post('/unsubscribe', limit, async (req, res) => {
    res.json(await setProductEmails(req, false));
  });

  router.post('/resubscribe', limit, async (req, res) => {
    res.json(await setProductEmails(req, true));
  });

  return router;
}
