import type { Logger } from 'pino';
import type { Env } from '../config/env.js';
import type { JobQueue } from '../jobs/queue.js';
import type { Encryption } from '../lib/encryption.js';
import type { Database } from '../lib/prisma.js';
import { processRazorpayEvent } from './events.js';
import { createRazorpayClient } from './razorpay.js';

/** Applies each stored Razorpay webhook event in the background (see routes/razorpay-webhook.ts). */
export function registerBillingEvents({
  env,
  logger,
  prisma,
  jobs,
  encryption,
}: {
  env: Env;
  logger: Logger;
  prisma: Database;
  jobs: JobQueue;
  encryption: Encryption;
}): void {
  const razorpay = createRazorpayClient(env);
  jobs.handle('billing.event', ({ eventId }) =>
    processRazorpayEvent({ env, logger, prisma, jobs, encryption, razorpay }, eventId),
  );
}
