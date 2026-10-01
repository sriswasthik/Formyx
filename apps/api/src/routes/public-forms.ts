import { randomUUID } from 'node:crypto';
import {
  HONEYPOT_FIELD,
  submissionInputSchema,
  type PublicFormResponse,
  type SubmissionResponse,
} from '@formyx/shared';
import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { routeParam } from '../lib/route-param.js';
import { createPublicRateLimiters } from '../middleware/rate-limit.js';
import { createPublicFormService } from '../services/public-form-service.js';
import { createUploadChecks } from '../services/upload-checks.js';

/**
 * Published forms, for anyone with the link: no account needed. Only the published snapshot
 * is ever sent, never the draft.
 */
export function createPublicFormsRouter({
  env,
  logger,
  prisma,
  events,
  storage,
}: AppDependencies): Router {
  const router = Router();
  const forms = createPublicFormService(
    prisma,
    createUploadChecks({ storage, root: env.CLOUDINARY_FOLDER }),
  );
  const limit = createPublicRateLimiters(env);

  // Closing a form must take effect at once, so nothing may cache these responses.
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/:slug', async (req, res) => {
    const form: PublicFormResponse = await forms.get(routeParam(req, 'slug'));
    res.json(form);
  });

  router.post('/:slug/view', limit.view, async (req, res) => {
    await forms.recordView(routeParam(req, 'slug'));
    res.status(204).end();
  });

  router.post('/:slug/submissions', limit.submit, async (req, res) => {
    const input = submissionInputSchema.parse(req.body);

    // People never see the honeypot. Whoever filled it in gets the usual reply, so bots
    // cannot tell they were caught, but nothing is stored.
    if (input[HONEYPOT_FIELD]?.trim()) {
      logger.info({ slug: routeParam(req, 'slug') }, 'Ignored a submission caught by the honeypot');
      const body: SubmissionResponse = { id: randomUUID() };
      res.status(201).json(body);
      return;
    }

    const saved = await forms.submit(routeParam(req, 'slug'), input, {
      userAgent: req.get('user-agent'),
    });
    const body: SubmissionResponse = { id: saved.submission.id };
    res.status(201).json(body);
    // Committed and answered: now live dashboards and notification emails can follow.
    events.emit('submission.created', saved);
  });

  return router;
}
