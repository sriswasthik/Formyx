import { analyticsQuerySchema, type FormAnalytics } from '@formyx/shared';
import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { routeParam } from '../lib/route-param.js';
import type { AuthGuards } from '../middleware/auth.js';
import { createAnalyticsService } from '../services/analytics-service.js';
import { createSubmissionService } from '../services/submission-service.js';

export function createAnalyticsRouter(
  { prisma }: AppDependencies,
  { requireAuth, requireFormRole }: AuthGuards,
): Router {
  const router = Router();
  const analytics = createAnalyticsService(prisma, createSubmissionService(prisma));

  router.get(
    '/forms/:formId/analytics',
    requireAuth,
    requireFormRole('VIEWER'),
    async (req, res) => {
      const { range, tz } = analyticsQuerySchema.parse(req.query);
      const body: FormAnalytics = await analytics.get(routeParam(req, 'formId'), {
        range,
        timeZone: tz,
      });
      res.json(body);
    },
  );

  return router;
}
