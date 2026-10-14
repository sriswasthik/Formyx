import { feedbackInputSchema } from '@formyx/shared';
import { Router } from 'express';
import type { AppDependencies } from '../app.js';
import { encryptionFromEnv } from '../lib/encryption.js';
import { getAuth } from '../middleware/auth.js';
import { createFeedbackRateLimiter } from '../middleware/rate-limit.js';
import { queueEmails } from '../notifications/email-jobs.js';
import { renderFeedbackEmail } from '../notifications/feedback-email.js';
import type { Guards } from './index.js';

/** The app's Feedback button: stored, and emailed to the team when FEEDBACK_EMAIL is set. */
export function createFeedbackRouter(
  { env, prisma, jobs, analytics }: AppDependencies,
  { requireAuth }: Guards,
): Router {
  const router = Router();
  const encryption = encryptionFromEnv(env);
  const limit = createFeedbackRateLimiter();

  router.post('/feedback', requireAuth, limit, async (req, res) => {
    const input = feedbackInputSchema.parse(req.body);
    const { userId } = getAuth(req);
    const sender = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, email: true },
    });
    const saved = await prisma.feedback.create({
      data: {
        userId,
        kind: input.kind === 'idea' ? 'IDEA' : input.kind === 'problem' ? 'PROBLEM' : 'OTHER',
        message: input.message,
        page: input.page ?? null,
      },
      select: { id: true },
    });

    if (env.FEEDBACK_EMAIL) {
      const email = renderFeedbackEmail({
        ...input,
        senderName: sender.name,
        senderEmail: sender.email,
        appUrl: env.APP_URL,
      });
      await queueEmails(jobs, encryption, {
        formId: null,
        kind: 'feedback',
        messages: [{ to: env.FEEDBACK_EMAIL, replyTo: sender.email, ...email }],
        idempotencyKey: `feedback:${saved.id}`,
      });
    }
    analytics.track({ name: 'feedback_sent', properties: { kind: input.kind } }, { userId });
    res.status(201).json({ id: saved.id });
  });

  return router;
}
