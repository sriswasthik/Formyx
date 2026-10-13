import type { ChatService, WebhookPayload } from '@formyx/shared';

/*
 * Every kind of background job: what it carries and how hard it tries. Payloads are stored
 * in Postgres until the job is done, so they hold ids and ready-made bodies, never secrets.
 */

/** A response arrived, or its respondent changed it. */
export type SubmissionChange = 'created' | 'updated';

export interface JobPayloads {
  /** One event to one webhook; `body` is serialised once so every attempt signs the same bytes. */
  'webhook.deliver': { formId: string; webhookId: string; payload: WebhookPayload; body: string };
  /**
   * Emails about responses: notifications, autoresponders, digests. The messages are sealed
   * (see lib/encryption.ts): they hold respondents' answers, and an autoresponder can hold
   * the private link that changes a response.
   */
  'email.send': {
    formId: string | null;
    kind: 'response' | 'autoresponder' | 'digest' | 'feedback' | 'billing';
    /** `EmailMessage[]` as JSON, sealed. */
    sealedMessages: string;
    recipients: number;
    /** The email service drops a second send with the same key, so retries never repeat. */
    idempotencyKey: string;
  };
  /** A response, posted to the form's Slack or Discord channel. */
  'chat.post': {
    formId: string;
    service: ChatService;
    submissionId: string;
    change: SubmissionChange;
  };
  /** One response, written to an integration (a Google Sheet, a Notion database). */
  'integration.sync': {
    formId: string;
    integrationId: string;
    submissionId: string;
    change: SubmissionChange;
  };
  /**
   * Every response it doesn't have yet, written to a newly connected (or reconnected, or
   * resumed) integration; with `fresh`, everything again from a clean slate.
   */
  'integration.backfill': { formId: string; integrationId: string; fresh?: boolean };
  /** Digests, retention and clean-up, once an hour. */
  'upkeep.hourly': { hour: string };
  /** A Razorpay webhook event, stored by id in razorpay_events, applied to billing. */
  'billing.event': { eventId: string };
  /**
   * One lifecycle email to one account (see lifecycle/lifecycle.ts). Rendered when it runs,
   * so it checks the person still wants it and has not had it already.
   */
  'lifecycle.send': {
    userId: string;
    kind: LifecycleKind;
    /** "" for one-off emails; the day they were last active for `inactive`. */
    periodKey: string;
    formId?: string | undefined;
  };
}

export type LifecycleKind = 'welcome' | 'first_form_published' | 'first_response' | 'inactive';

export type JobName = keyof JobPayloads;

export interface JobPolicy {
  /** Tries in all, the first included. */
  attempts: number;
  /** Seconds before the first retry; each one after waits about twice as long. */
  firstRetrySeconds: number;
  /** The longest wait between tries. */
  maxRetrySeconds: number;
  /** Jobs of this kind running at once in one process. */
  concurrency: number;
  /** A try still running after this long counts as failed (the process probably died). */
  timeoutSeconds: number;
  /** At most one queued and one running (`stately`), so a repeating job is never doubled. */
  singleQueued?: boolean;
}

export const JOB_POLICIES: Record<JobName, JobPolicy> = {
  // About 30s, 1m, 2m, 4m, 8m: receivers get the better part of a quarter of an hour.
  'webhook.deliver': {
    attempts: 6,
    firstRetrySeconds: 30,
    maxRetrySeconds: 3600,
    concurrency: 4,
    timeoutSeconds: 120,
  },
  'email.send': {
    attempts: 5,
    firstRetrySeconds: 60,
    maxRetrySeconds: 1800,
    concurrency: 2,
    timeoutSeconds: 120,
  },
  'chat.post': {
    attempts: 5,
    firstRetrySeconds: 30,
    maxRetrySeconds: 1800,
    concurrency: 2,
    timeoutSeconds: 120,
  },
  // Google and Notion limit how fast one account writes; backing off up to an hour rides out
  // rate limits and short outages.
  'integration.sync': {
    attempts: 8,
    firstRetrySeconds: 30,
    maxRetrySeconds: 3600,
    concurrency: 2,
    timeoutSeconds: 300,
  },
  'integration.backfill': {
    attempts: 5,
    firstRetrySeconds: 60,
    maxRetrySeconds: 3600,
    concurrency: 1,
    timeoutSeconds: 1800,
  },
  'upkeep.hourly': {
    attempts: 2,
    firstRetrySeconds: 300,
    maxRetrySeconds: 600,
    concurrency: 1,
    timeoutSeconds: 1800,
    singleQueued: true,
  },
  // One at a time, so two events for one subscription are never applied at once. Payments
  // matter: tries go on for about a day (Razorpay itself retries a webhook for 24 hours).
  'billing.event': {
    attempts: 10,
    firstRetrySeconds: 30,
    maxRetrySeconds: 3600 * 4,
    concurrency: 1,
    timeoutSeconds: 120,
  },
  'lifecycle.send': {
    attempts: 5,
    firstRetrySeconds: 60,
    maxRetrySeconds: 3600,
    concurrency: 2,
    timeoutSeconds: 120,
  },
};

/** What a failed job was about, for the failed-jobs list. */
export interface JobSubject {
  formId: string | null;
  integrationId?: string;
  webhookId?: string;
  /** A sentence for people: "Send a new response to Slack". */
  summary: string;
}

export function describeJob<N extends JobName>(name: N, data: JobPayloads[N]): JobSubject {
  switch (name) {
    case 'webhook.deliver': {
      const job = data as JobPayloads['webhook.deliver'];
      return {
        formId: job.formId,
        webhookId: job.webhookId,
        summary: `Deliver ${job.payload.event} to a webhook`,
      };
    }
    case 'email.send': {
      const job = data as JobPayloads['email.send'];
      const count = job.recipients;
      const what =
        job.kind === 'autoresponder'
          ? 'the autoresponder email'
          : job.kind === 'digest'
            ? 'the daily digest'
            : job.kind === 'feedback'
              ? 'feedback to the team'
              : job.kind === 'billing'
                ? 'a billing email to the workspace’s owners'
                : `the new response email${count === 1 ? '' : 's'}`;
      return { formId: job.formId, summary: `Send ${what}` };
    }
    case 'chat.post': {
      const job = data as JobPayloads['chat.post'];
      const service = job.service === 'slack' ? 'Slack' : 'Discord';
      return {
        formId: job.formId,
        summary: `Post a ${job.change === 'updated' ? 'changed' : 'new'} response to ${service}`,
      };
    }
    case 'integration.sync': {
      const job = data as JobPayloads['integration.sync'];
      return {
        formId: job.formId,
        integrationId: job.integrationId,
        summary: job.change === 'updated' ? 'Update a changed response' : 'Add a new response',
      };
    }
    case 'integration.backfill': {
      const job = data as JobPayloads['integration.backfill'];
      return {
        formId: job.formId,
        integrationId: job.integrationId,
        summary: job.fresh ? 'Copy every response again' : 'Copy every response so far',
      };
    }
    case 'billing.event':
      return { formId: null, summary: 'Apply a payment update from Razorpay' };
    case 'lifecycle.send': {
      const job = data as JobPayloads['lifecycle.send'];
      return {
        formId: job.formId ?? null,
        summary: `Send the ${job.kind.replaceAll('_', ' ')} email`,
      };
    }
    default:
      return { formId: null, summary: 'Hourly upkeep: digests and deleting old responses' };
  }
}
