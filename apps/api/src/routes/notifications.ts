import { notificationSettingsSchema, type NotificationSettings } from '@formyx/shared';
import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { routeParam } from '../lib/route-param.js';
import { getAuth, type AuthGuards } from '../middleware/auth.js';
import { createNotificationService } from '../services/notification-service.js';

/** Each member's own notification settings. They only affect that member, so any role may change them. */
export function createNotificationsRouter(
  { prisma }: AppDependencies,
  { requireAuth, requireRealAccount, requireFormRole }: AuthGuards,
): Router {
  const router = Router();
  const notifications = createNotificationService(prisma);

  router.get(
    '/forms/:formId/notifications',
    requireAuth,
    requireFormRole('VIEWER'),
    async (req, res) => {
      const body: NotificationSettings = await notifications.get(
        routeParam(req, 'formId'),
        getAuth(req).userId,
      );
      res.json(body);
    },
  );

  router.put(
    '/forms/:formId/notifications',
    requireAuth,
    requireRealAccount,
    requireFormRole('VIEWER'),
    async (req, res) => {
      const input = notificationSettingsSchema.parse(req.body);
      const body: NotificationSettings = await notifications.set(
        routeParam(req, 'formId'),
        getAuth(req).userId,
        input,
      );
      res.json(body);
    },
  );

  return router;
}
