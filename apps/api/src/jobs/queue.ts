import { PgBoss, type Job } from 'pg-boss';
import type { Logger } from 'pino';
import { isProgrammingError, reportError } from '../lib/monitoring.js';
import { JOB_POLICIES, type JobName, type JobPayloads, type JobPolicy } from './job-types.js';

/*
 * Background jobs that survive restarts: webhooks, emails, chat posts, integrations and the
 * hourly upkeep. Jobs live in Postgres (pg-boss, in its own `pgboss` schema) until they
 * succeed or run out of tries; then they are recorded for the failed-jobs list.
 *
 * pg-boss's own timers are switched off and this module polls instead, adaptively: every
 * second while there is work, then not at all until a job is sent from this process or the
 * next delayed one (a retry, the next hourly upkeep) comes due, with a long safety poll in
 * between. A quiet site therefore sends Postgres no queries, so a serverless database
 * (Neon) can suspend.
 */

export interface JobContext {
  jobId: string;
  /** 1 for the first try. */
  attempt: number;
  attempts: number;
  lastAttempt: boolean;
}

export type JobHandler<N extends JobName> = (
  data: JobPayloads[N],
  context: JobContext,
) => Promise<void>;

/** Thrown by a handler when trying again cannot help (revoked access, a deleted form). */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}

/** A job that has run out of tries (or failed for good), for the failed-jobs list. */
export interface FailedJob<N extends JobName = JobName> {
  name: N;
  jobId: string;
  data: JobPayloads[N];
  attempts: number;
  error: string;
}

export interface SendOptions {
  /** Not before this time. */
  startAfter?: Date;
}

export interface JobQueue {
  send<N extends JobName>(name: N, data: JobPayloads[N], options?: SendOptions): Promise<void>;
  /** Sets what runs jobs of this kind. Call before `start`. */
  handle<N extends JobName>(name: N, handler: JobHandler<N>): void;
  start(): Promise<void>;
  /** Stops taking jobs and waits for the ones running (up to a timeout). */
  stop(): Promise<void>;
  /**
   * Runs every job that is ready, and retries as they come due, until none are left (tests,
   * where retries wait no time). Jobs scheduled for later stay queued.
   */
  drain(): Promise<void>;
}

export interface QueueOptions {
  logger: Logger;
  /** Records a job that has run out of tries; it must not throw. */
  onFailed: (failed: FailedJob) => Promise<void>;
  /** Tests make retries immediate. */
  policies?: Record<JobName, JobPolicy>;
}

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message || error.name : String(error);

/**
 * Runs one try of a job and says what happened: done, retry later, or failed for good (and
 * recorded). Shared by both queues so they behave the same.
 */
export async function runAttempt<N extends JobName>({
  name,
  jobId,
  data,
  attempt,
  policy,
  handler,
  logger,
  onFailed,
}: {
  name: N;
  jobId: string;
  data: JobPayloads[N];
  attempt: number;
  policy: JobPolicy;
  handler: JobHandler<N>;
  logger: Logger;
  onFailed: QueueOptions['onFailed'];
}): Promise<'done' | 'retry' | 'failed'> {
  const lastAttempt = attempt >= policy.attempts;
  try {
    await handler(data, { jobId, attempt, attempts: policy.attempts, lastAttempt });
    return 'done';
  } catch (error) {
    const permanent = error instanceof PermanentJobError;
    const context = { job: name, jobId, attempt, attempts: policy.attempts };
    if (!permanent && !lastAttempt) {
      logger.warn({ ...context, err: error }, 'Job failed; it will be tried again');
      return 'retry';
    }
    logger.error({ ...context, err: error, permanent }, 'Job failed for good');
    // Failures outside Formyx (a receiver down) show under Failed jobs; bugs, and Formyx's own
    // work giving up (payments, upkeep), go to Sentry too, whose alerts email the team.
    if (isProgrammingError(error) || policy.alert) {
      reportError(error, { job: name, attempts: attempt });
    }
    try {
      await onFailed({ name, jobId, data, attempts: attempt, error: describeError(error) });
    } catch (recordError) {
      logger.error({ ...context, err: recordError }, 'Could not record a failed job');
    }
    return 'failed';
  }
}

interface MemoryJob {
  id: number;
  name: JobName;
  data: unknown;
  attempt: number;
  startAfter: Date | undefined;
}

/**
 * Jobs in memory, for tests of routes and notifiers: `drain` runs them at once, with every
 * retry immediate. `sent` lists what was queued.
 */
export function createMemoryQueue(
  options: QueueOptions & {
    /** Run each job as soon as it is sent, as a worker would (end-to-end-style tests). */
    autoRun?: boolean;
  },
) {
  const policies = options.policies ?? JOB_POLICIES;
  const handlers = new Map<JobName, JobHandler<never>>();
  const pending: MemoryJob[] = [];
  const sent: { name: JobName; data: unknown }[] = [];
  let nextId = 1;
  let draining: Promise<void> | null = null;
  let again = false;

  async function runPending() {
    for (;;) {
      const index = pending.findIndex(
        (job) =>
          handlers.has(job.name) && (!job.startAfter || job.startAfter.getTime() <= Date.now()),
      );
      const job = pending[index];
      if (!job) return;
      pending.splice(index, 1);
      const handler = handlers.get(job.name) as JobHandler<JobName>;
      const outcome = await runAttempt({
        name: job.name,
        jobId: String(job.id),
        data: job.data as JobPayloads[JobName],
        attempt: job.attempt,
        policy: policies[job.name],
        handler,
        logger: options.logger,
        onFailed: options.onFailed,
      });
      if (outcome === 'retry') pending.push({ ...job, attempt: job.attempt + 1 });
    }
  }

  /** One drain at a time; a send during one runs in it or right after. */
  function drain(): Promise<void> {
    if (draining) {
      again = true;
      return draining;
    }
    draining = (async () => {
      // `again` is set by sends while this runs.
      const takeAgain = () => {
        const value = again;
        again = false;
        return value;
      };
      do {
        await runPending();
      } while (takeAgain());
    })().finally(() => {
      draining = null;
    });
    return draining;
  }

  const queue: JobQueue & { sent: typeof sent; pending: () => number } = {
    sent,
    pending: () => pending.length,
    send(name, data, sendOptions = {}) {
      sent.push({ name, data });
      pending.push({ id: nextId++, name, data, attempt: 1, startAfter: sendOptions.startAfter });
      if (options.autoRun) setImmediate(() => void drain());
      return Promise.resolve();
    },
    handle(name, handler) {
      handlers.set(name, handler);
    },
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    drain,
  };
  return queue;
}

/** The pg-boss queue's settings for each kind of job. */
function queueSettings(policy: JobPolicy) {
  const immediate = policy.firstRetrySeconds === 0;
  return {
    retryLimit: policy.attempts - 1,
    retryDelay: policy.firstRetrySeconds,
    retryBackoff: !immediate,
    ...(!immediate && { retryDelayMax: policy.maxRetrySeconds }),
    expireInSeconds: policy.timeoutSeconds,
    // Done jobs go after a day; failures are kept in job_failures instead.
    deleteAfterSeconds: 24 * 60 * 60,
    ...(policy.singleQueued && { policy: 'stately' as const }),
  };
}

/** While there is work, poll this often. */
const ACTIVE_POLL_MS = 1000;
/** With nothing due, look anyway this often, for jobs queued by other processes. */
const DEFAULT_IDLE_POLL_MS = 60 * 60 * 1000;
/** pg-boss's maintenance (expiring stuck jobs, deleting old ones), at most this often. */
const MAINTENANCE_EVERY_MS = 15 * 60 * 1000;
const SCHEMA = 'pgboss';

export interface PgBossQueueOptions extends QueueOptions {
  connectionString: string;
  /** Run jobs here (true), or only queue them for another process (false). */
  work: boolean;
  /** Safety poll with nothing due; a separate worker uses a short one. */
  idlePollMs?: number;
}

/** The production queue, on Postgres. */
export function createPgBossQueue(options: PgBossQueueOptions): JobQueue {
  const { logger, work } = options;
  const policies = options.policies ?? JOB_POLICIES;
  const idlePollMs = options.idlePollMs ?? DEFAULT_IDLE_POLL_MS;
  const boss = new PgBoss({
    connectionString: options.connectionString,
    schema: SCHEMA,
    application_name: 'formyx-jobs',
    max: 4,
    // Timers off: see the comment at the top.
    supervise: false,
    schedule: false,
    registerInstance: false,
    openTelemetry: { enabled: false },
  });
  boss.on('error', (error: unknown) => {
    logger.error({ err: error }, 'Job queue error');
  });

  const handlers = new Map<JobName, JobHandler<never>>();
  const running = new Map<JobName, number>();
  const inFlight = new Set<Promise<void>>();
  let started = false;
  let stopping = false;
  let timer: NodeJS.Timeout | undefined;
  /** When `timer` fires. */
  let timerAt = Number.POSITIVE_INFINITY;
  let polling: Promise<number> | null = null;
  let lastMaintenance = 0;
  // Read through functions: they change while a poll is awaited.
  const isStopping = () => stopping;
  const busy = () => inFlight.size > 0;

  async function settle(name: JobName, job: Job<unknown>, outcome: 'done' | 'retry' | 'failed') {
    const attemptRef = { id: job.id, retryCount: job.retryCount };
    if (outcome === 'retry') {
      await boss.fail(name, attemptRef, { retry: true });
    } else {
      // A job that failed for good is recorded in job_failures; pg-boss needn't retry it.
      await boss.complete(name, attemptRef, outcome === 'failed' ? { failed: true } : null);
    }
  }

  function run(name: JobName, job: Job<unknown>) {
    const handler = handlers.get(name) as JobHandler<JobName>;
    running.set(name, (running.get(name) ?? 0) + 1);
    const task = runAttempt({
      name,
      jobId: job.id,
      data: job.data as JobPayloads[JobName],
      attempt: job.retryCount + 1,
      policy: policies[name],
      handler,
      logger,
      onFailed: options.onFailed,
    })
      .then((outcome) => settle(name, job, outcome))
      .catch((error: unknown) => {
        logger.error({ err: error, job: name, jobId: job.id }, 'Could not settle a job');
      })
      .finally(() => {
        running.set(name, (running.get(name) ?? 1) - 1);
        inFlight.delete(task);
        // A retry may already be due (tests retry at once), and a slot just opened.
        if (!stopping) wake(ACTIVE_POLL_MS);
      });
    inFlight.add(task);
  }

  /** Takes as many ready jobs as there are free slots; returns how many. */
  async function pollOnce(): Promise<number> {
    let taken = 0;
    for (const name of handlers.keys()) {
      const free = policies[name].concurrency - (running.get(name) ?? 0);
      if (free <= 0 || stopping) continue;
      const jobs = await boss.fetch<unknown>(name, { batchSize: free });
      for (const job of jobs) run(name, job);
      taken += jobs.length;
    }
    if (taken > 0 && Date.now() - lastMaintenance > MAINTENANCE_EVERY_MS) {
      lastMaintenance = Date.now();
      void boss.supervise().catch((error: unknown) => {
        logger.warn({ err: error }, 'Job queue maintenance failed');
      });
    }
    return taken;
  }

  /** When the next delayed job is due, if any. */
  async function nextDue(): Promise<Date | null> {
    const { rows } = await boss
      .getDb()
      .executeSql(
        `SELECT min(start_after) AS due FROM ${SCHEMA}.job WHERE name = ANY($1) AND state IN ('created', 'retry')`,
        [[...handlers.keys()]],
      );
    const due = (rows[0] as { due: Date | string | null } | undefined)?.due;
    return due ? new Date(due) : null;
  }

  async function tick() {
    timer = undefined;
    timerAt = Number.POSITIVE_INFINITY;
    if (stopping || polling) return;
    let taken = 0;
    try {
      polling = pollOnce();
      taken = await polling;
    } catch (error) {
      logger.error({ err: error }, 'Could not fetch jobs');
    } finally {
      polling = null;
    }
    if (isStopping()) return;
    if (taken > 0 || busy()) {
      wake(ACTIVE_POLL_MS);
      return;
    }
    try {
      const due = await nextDue();
      const wait = due ? Math.max(due.getTime() - Date.now(), 0) + 250 : idlePollMs;
      wake(Math.min(wait, idlePollMs));
    } catch (error) {
      logger.error({ err: error }, 'Could not check for delayed jobs');
      wake(ACTIVE_POLL_MS * 30);
    }
  }

  /** Polls in `ms`, unless a poll is already set sooner. */
  function wake(ms: number) {
    if (!work || !started || stopping) return;
    const at = Date.now() + ms;
    if (timer && timerAt <= at) return;
    clearTimeout(timer);
    timerAt = at;
    timer = setTimeout(() => void tick(), ms);
  }

  return {
    async send(name, data, sendOptions = {}) {
      await boss.send(name, data as object, {
        ...(sendOptions.startAfter && { startAfter: sendOptions.startAfter }),
      });
      wake(sendOptions.startAfter ? Math.max(sendOptions.startAfter.getTime() - Date.now(), 0) : 0);
    },

    handle(name, handler) {
      handlers.set(name, handler);
    },

    async start() {
      await boss.start();
      for (const name of Object.keys(policies) as JobName[]) {
        const { policy = 'standard', ...settings } = queueSettings(policies[name]);
        const existing = await boss.getQueue(name);
        if (existing && (existing.policy ?? 'standard') === policy) {
          await boss.updateQueue(name, settings);
          continue;
        }
        // A queue's policy is fixed when it is made; one made before its policy changed is
        // made again (it only ever holds the next run of a repeating job, which is requeued).
        if (existing) {
          logger.warn({ queue: name }, 'Re-creating a job queue whose policy changed');
          await boss.deleteQueue(name);
        }
        await boss.createQueue(name, { ...settings, policy });
      }
      started = true;
      if (work) {
        lastMaintenance = Date.now();
        // Jobs stuck "active" by a process that died are expired here, then retried.
        await boss.supervise().catch((error: unknown) => {
          logger.warn({ err: error }, 'Job queue maintenance failed');
        });
        wake(0);
      }
    },

    async stop() {
      stopping = true;
      clearTimeout(timer);
      await polling?.catch(() => undefined);
      const waiting = Promise.allSettled([...inFlight]);
      await Promise.race([waiting, new Promise((resolve) => setTimeout(resolve, 8000))]);
      await boss.stop({ graceful: false, close: true });
    },

    async drain() {
      for (let round = 0; round < 1000; round += 1) {
        const taken = await pollOnce();
        await Promise.allSettled([...inFlight]);
        if (taken === 0 && !busy()) {
          // One more look: a retry may have come due while the last jobs ran.
          if ((await pollOnce()) === 0 && !busy()) return;
          await Promise.allSettled([...inFlight]);
        }
      }
      throw new Error('The job queue did not drain');
    },
  };
}
