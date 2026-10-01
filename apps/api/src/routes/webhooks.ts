import {
  createWebhookInputSchema,
  type CreatedWebhook,
  type WebhookDeliveries,
  type WebhookDelivery,
  type WebhooksResponse,
} from '@formyx/shared';
import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { AppError } from '../lib/app-error.js';
import { routeParam } from '../lib/route-param.js';
import { createSecretBox } from '../lib/webhook-signature.js';
import { webhookUrlProblem } from '../lib/webhook-transport.js';
import { getAuth, type AuthGuards } from '../middleware/auth.js';
import { createWebhookTestRateLimiter } from '../middleware/rate-limit.js';
import { createWebhookService } from '../services/webhook-service.js';
import { testPayload } from '../webhooks/payload.js';

/** A form's webhooks: adding, removing, the delivery log and test events. EDITOR and up. */
export function createWebhooksRouter(
  { prisma, env, webhooks: dispatcher }: AppDependencies,
  { requireAuth, requireFormRole }: AuthGuards,
): Router {
  const router = Router();
  const webhooks = createWebhookService(prisma, createSecretBox(env.JWT_SECRET));
  const limitTests = createWebhookTestRateLimiter();
  const guards = [requireAuth, requireFormRole('EDITOR')];

  router.get('/forms/:formId/webhooks', ...guards, async (req, res) => {
    const body: WebhooksResponse = { webhooks: await webhooks.list(routeParam(req, 'formId')) };
    res.json(body);
  });

  router.post('/forms/:formId/webhooks', ...guards, async (req, res) => {
    const { url } = createWebhookInputSchema.parse(req.body);
    const problem = webhookUrlProblem(url, { allowPrivate: env.WEBHOOK_ALLOW_PRIVATE_URLS });
    if (problem) {
      throw new AppError(400, 'VALIDATION_ERROR', problem, {
        details: [{ path: 'url', message: problem }],
      });
    }
    const body: CreatedWebhook = await webhooks.create(
      routeParam(req, 'formId'),
      getAuth(req).userId,
      url,
    );
    res.status(201).json(body);
  });

  router.delete('/forms/:formId/webhooks/:webhookId', ...guards, async (req, res) => {
    await webhooks.remove(routeParam(req, 'formId'), routeParam(req, 'webhookId'));
    res.status(204).end();
  });

  router.get('/forms/:formId/webhooks/:webhookId/deliveries', ...guards, async (req, res) => {
    const body: WebhookDeliveries = {
      deliveries: await webhooks.deliveries(
        routeParam(req, 'formId'),
        routeParam(req, 'webhookId'),
      ),
    };
    res.json(body);
  });

  router.post(
    '/forms/:formId/webhooks/:webhookId/test',
    ...guards,
    limitTests,
    async (req, res) => {
      const webhookId = routeParam(req, 'webhookId');
      const subject = await webhooks.testSubject(routeParam(req, 'formId'), webhookId);
      const delivery: WebhookDelivery | null = await dispatcher.sendNow(
        webhookId,
        testPayload(subject),
      );
      if (!delivery) throw new AppError(404, 'NOT_FOUND', 'Webhook not found');
      res.json(delivery);
    },
  );

  return router;
}
