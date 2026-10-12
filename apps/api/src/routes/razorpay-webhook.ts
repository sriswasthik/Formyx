import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { webhookSignatureValid } from '../billing/razorpay.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../lib/app-error.js';

/** Where Razorpay sends webhooks; set it, with RAZORPAY_WEBHOOK_SECRET, in Razorpay's dashboard. */
export const RAZORPAY_WEBHOOK_PATH = '/api/webhooks/razorpay';

/*
 * Razorpay's webhooks: the source of truth for subscriptions and payments. Each one is checked
 * against its signature over the raw body, stored by its event id (a repeat is a no-op) and
 * answered at once; the job queue applies it (billing/events.ts), retrying if that fails.
 */
export function createRazorpayWebhookRouter({
  env,
  prisma,
  jobs,
  logger,
}: AppDependencies): Router {
  const router = Router();

  router.post('/webhooks/razorpay', async (req, res) => {
    const secret = env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      throw new AppError(503, 'BILLING_UNAVAILABLE', 'Payments are not set up on this server.');
    }
    const body: unknown = req.body;
    const signature = req.get('x-razorpay-signature') ?? '';
    if (!Buffer.isBuffer(body) || !webhookSignatureValid(secret, body, signature)) {
      logger.warn({ path: req.path }, 'Razorpay webhook with a wrong signature');
      throw new AppError(400, 'INVALID_SIGNATURE', 'The signature does not match.');
    }

    let event: Prisma.InputJsonObject;
    try {
      event = JSON.parse(body.toString('utf8')) as Prisma.InputJsonObject;
    } catch {
      throw new AppError(400, 'BAD_REQUEST', 'The body is not JSON.');
    }
    const eventId = req.get('x-razorpay-event-id');
    const type = typeof event.event === 'string' ? event.event : null;
    if (!eventId || !type) {
      throw new AppError(400, 'BAD_REQUEST', 'An event id and type are needed.');
    }

    const { count } = await prisma.razorpayEvent.createMany({
      data: [{ id: eventId, type, payload: event }],
      skipDuplicates: true,
    });
    if (count === 1) await jobs.send('billing.event', { eventId });
    logger.info({ eventId, type, duplicate: count === 0 }, 'Razorpay webhook received');
    res.json({ received: true });
  });

  return router;
}
