import type { Logger } from 'pino';
import type { Env } from '../config/env.js';
import type { Encryption } from '../lib/encryption.js';
import type { EmailMessage, Mailer } from '../lib/mailer.js';
import type { Database } from '../lib/prisma.js';
import type { UploadStorage } from '../lib/upload-storage.js';
import { createBillingService } from '../billing/billing-service.js';
import { billingConfigured, createRazorpayClient } from '../billing/razorpay.js';
import { createAccountDeletionService } from '../privacy/account-deletion.js';
import { expireDataExports } from '../privacy/data-export.js';
import { runBillingUpkeep } from '../billing/upkeep.js';
import { resumePausedSubscriptions } from '../referrals/referrals.js';
import { queueInactiveEmails } from '../lifecycle/lifecycle.js';
import { queueEmails } from '../notifications/email-jobs.js';
import { applyRetention, pruneExpired, sendDigests } from './jobs.js';
import type { JobQueue } from './queue.js';

/*
 * Once an hour, a little after the hour: daily digests (each form at its own hour, in its
 * workspace's time zone), deleting responses older than a form keeps them, clearing expired
 * codes and drafts, and billing's reminders and plan endings (billing/upkeep.ts). The job queues the next one when it is done; the queue keeps at
 * most one waiting, so restarts and extra instances never double it.
 */

const HOUR_MS = 60 * 60 * 1000;
/** Minutes past the hour it runs. */
const MINUTES_PAST = 5;

/** The next run's time: `MINUTES_PAST` minutes past the coming hour. */
export function nextUpkeepAt(now: Date = new Date()): Date {
  const next = new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS + MINUTES_PAST * 60_000);
  return next.getTime() > now.getTime() ? next : new Date(next.getTime() + HOUR_MS);
}

export async function scheduleNextUpkeep(jobs: JobQueue, now: Date = new Date()): Promise<void> {
  const at = nextUpkeepAt(now);
  await jobs.send('upkeep.hourly', { hour: at.toISOString().slice(0, 13) }, { startAfter: at });
}

export function registerUpkeep({
  jobs,
  prisma,
  mailer,
  storage,
  logger,
  env,
  encryption,
}: {
  jobs: JobQueue;
  prisma: Database;
  mailer: Mailer;
  storage: UploadStorage | null;
  logger: Logger;
  env: Env;
  encryption: Encryption;
}): void {
  jobs.handle('upkeep.hourly', async () => {
    const deps = {
      prisma,
      mailer,
      storage,
      logger,
      appUrl: env.APP_URL,
      queueEmail: (email: { formId: string; messages: EmailMessage[]; idempotencyKey: string }) =>
        queueEmails(jobs, encryption, { ...email, kind: 'digest' }),
    };
    try {
      const started = Date.now();
      const digests = await sendDigests(deps);
      const retention = await applyRetention(deps);
      const pruned = await pruneExpired(deps);
      const billing = await runBillingUpkeep({ prisma, jobs, encryption, env, logger });
      const inactive = await queueInactiveEmails({ prisma, jobs });
      // Data rights: exports past their week, and accounts whose week to undo is up.
      const exportsExpired = await expireDataExports(prisma);
      const accountsDeleted = await createAccountDeletionService({
        prisma,
        billing: createBillingService({ prisma, env, razorpay: createRazorpayClient(env) }),
        mailer,
        logger,
        appUrl: env.APP_URL,
      }).runDue();
      // Subscriptions a referral reward paused, back on once their free month is up.
      const resumed = billingConfigured(env)
        ? await resumePausedSubscriptions({ prisma, logger, razorpay: createRazorpayClient(env) })
        : 0;
      logger.info(
        {
          digests,
          retention,
          pruned,
          billing,
          inactive,
          resumed,
          exportsExpired,
          accountsDeleted,
          ms: Date.now() - started,
        },
        'Hourly upkeep done',
      );
    } finally {
      await scheduleNextUpkeep(jobs);
    }
  });
}
