import { PIN_CODE_PATTERN, type PinCodeLookup } from '@formyx/shared';
import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { AppDependencies } from '../app.js';
import { AppError } from '../lib/app-error.js';
import { routeParam } from '../lib/route-param.js';
import { createPinCodeService, type PinCodeService } from '../services/pin-code-service.js';

/** Respondents type a PIN code once or twice; this leaves room for a busy office. */
const LOOKUPS_PER_15_MINUTES = 120;

/**
 * `GET /api/public/pincodes/:pin`: the city and state of an Indian PIN code, for address
 * questions. Public, rate limited per IP, and cacheable by browsers for a day.
 */
export function createPinCodesRouter(
  { env, logger }: AppDependencies,
  pinCodes: PinCodeService = createPinCodeService({ baseUrl: env.PINCODE_API_URL, logger }),
): Router {
  const router = Router();
  const limit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: LOOKUPS_PER_15_MINUTES,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError(429, 'RATE_LIMITED', 'Too many lookups. Type the city and state instead.'));
    },
  });

  router.get('/:pin', limit, async (req, res) => {
    const pin = routeParam(req, 'pin');
    if (!PIN_CODE_PATTERN.test(pin)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Use a 6-digit PIN code');
    }
    let found: PinCodeLookup | null;
    try {
      found = await pinCodes.lookup(pin);
    } catch (cause) {
      throw new AppError(503, 'INTERNAL_ERROR', 'PIN codes cannot be looked up right now.', {
        cause,
      });
    }
    if (!found) throw new AppError(404, 'NOT_FOUND', 'No place has this PIN code');
    res.set('Cache-Control', 'public, max-age=86400');
    res.json(found);
  });

  return router;
}
