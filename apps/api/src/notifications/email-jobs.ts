import type { JobPayloads } from '../jobs/job-types.js';
import { PermanentJobError, type JobQueue } from '../jobs/queue.js';
import type { Encryption } from '../lib/encryption.js';
import type { EmailMessage, Mailer } from '../lib/mailer.js';

/*
 * Emails about responses go through the job queue, so a slow or failing email service is
 * retried later rather than lost. Emails someone is waiting for on screen (sign-in codes,
 * invites, "send me a test") are sent straight away instead, so they see a failure at once.
 */

type EmailJob = JobPayloads['email.send'];

/** Queues `messages` to be sent; the email service sends them once per `idempotencyKey`. */
export async function queueEmails(
  jobs: JobQueue,
  encryption: Encryption,
  {
    formId,
    kind,
    messages,
    idempotencyKey,
  }: Omit<EmailJob, 'sealedMessages' | 'recipients'> & { messages: EmailMessage[] },
): Promise<void> {
  if (messages.length === 0) return;
  await jobs.send('email.send', {
    formId,
    kind,
    sealedMessages: encryption.encrypt(JSON.stringify(messages)),
    recipients: messages.length,
    idempotencyKey,
  });
}

export function registerEmailJobs(jobs: JobQueue, mailer: Mailer, encryption: Encryption): void {
  jobs.handle('email.send', async (job) => {
    let messages: EmailMessage[];
    try {
      messages = JSON.parse(encryption.decrypt(job.sealedMessages)) as EmailMessage[];
    } catch {
      throw new PermanentJobError('The email can’t be read: the encryption key changed.');
    }
    await mailer.send(messages, { idempotencyKey: job.idempotencyKey });
  });
}
