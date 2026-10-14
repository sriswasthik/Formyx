import {
  cancelInputSchema,
  subscribeInputSchema,
  verifyCheckoutInputSchema,
  type BillingSummary,
  type Checkout,
  type PaymentsResponse,
  type VerifyCheckoutResponse,
} from '@formyx/shared';
import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { createBillingService } from '../billing/billing-service.js';
import { createRazorpayClient } from '../billing/razorpay.js';
import { getAuth, getMembership } from '../middleware/auth.js';
import { createBillingRateLimiter } from '../middleware/rate-limit.js';
import type { Guards } from './index.js';

/** A workspace's billing, for its owners only. Changes need a real account (not the demo). */
export function createBillingRouter(
  { prisma, env, analytics }: AppDependencies,
  { requireAuth, requireRealAccount, requireWorkspaceRole }: Guards,
): Router {
  const router = Router();
  const billing = createBillingService({ prisma, env, razorpay: createRazorpayClient(env) });
  const read = [requireAuth, requireWorkspaceRole('OWNER')];
  const change = [
    requireAuth,
    requireWorkspaceRole('OWNER'),
    requireRealAccount,
    createBillingRateLimiter(),
  ];
  const base = '/workspaces/:workspaceId/billing';

  router.get(base, ...read, async (req, res) => {
    const body: BillingSummary = await billing.summary(getMembership(req).workspaceId);
    res.json(body);
  });

  router.get(`${base}/payments`, ...read, async (req, res) => {
    const body: PaymentsResponse = await billing.payments(getMembership(req).workspaceId);
    res.json(body);
  });

  router.post(`${base}/subscribe`, ...change, async (req, res) => {
    const input = subscribeInputSchema.parse(req.body);
    const { workspaceId } = getMembership(req);
    const { userId } = getAuth(req);
    const body: Checkout = await billing.subscribe(workspaceId, userId, input);
    analytics.track(
      {
        name: 'checkout_started',
        properties: { targetPlan: input.plan, interval: input.interval, resume: false },
      },
      { userId, workspaceId },
    );
    res.status(201).json(body);
  });

  router.post(`${base}/verify`, ...change, async (req, res) => {
    const input = verifyCheckoutInputSchema.parse(req.body);
    const { workspaceId } = getMembership(req);
    const { userId } = getAuth(req);
    const { status, plan, interval } = await billing.verify(workspaceId, userId, input);
    analytics.track(
      { name: 'checkout_completed', properties: { targetPlan: plan, interval, resume: false } },
      { userId, workspaceId },
    );
    const body: VerifyCheckoutResponse = { status };
    res.json(body);
  });

  router.post(`${base}/cancel`, ...change, async (req, res) => {
    const input = cancelInputSchema.parse(req.body ?? {});
    const { workspaceId } = getMembership(req);
    const body: BillingSummary = await billing.cancel(workspaceId, input);
    analytics.track(
      {
        name: 'subscription_cancelled',
        properties: { targetPlan: body.plan, ...(input.reason && { reason: input.reason }) },
      },
      { userId: getAuth(req).userId, workspaceId },
    );
    res.json(body);
  });

  router.post(`${base}/resume`, ...change, async (req, res) => {
    const { workspaceId } = getMembership(req);
    const { userId } = getAuth(req);
    const body: Checkout = await billing.resume(workspaceId, userId);
    analytics.track(
      {
        name: 'checkout_started',
        properties: { targetPlan: body.plan, interval: body.interval, resume: true },
      },
      { userId, workspaceId },
    );
    res.status(201).json(body);
  });

  router.post(`${base}/change-plan`, ...change, async (req, res) => {
    const input = subscribeInputSchema.parse(req.body);
    const { workspaceId } = getMembership(req);
    const body: BillingSummary = await billing.changePlan(workspaceId, input);
    analytics.track(
      { name: 'plan_changed', properties: { targetPlan: input.plan, interval: input.interval } },
      { userId: getAuth(req).userId, workspaceId },
    );
    res.json(body);
  });

  router.post(
    `${base}/dismiss-downgrade`,
    requireAuth,
    requireWorkspaceRole('OWNER'),
    async (req, res) => {
      await billing.dismissDowngrade(getMembership(req).workspaceId);
      res.status(204).end();
    },
  );

  return router;
}
