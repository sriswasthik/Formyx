import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Monitoring from '../lib/monitoring.js';
import { reportError } from '../lib/monitoring.js';
import { resetJobs, testDatabaseUrl } from '../test/database.js';
import { JOB_POLICIES, type JobName, type JobPolicy } from './job-types.js';
import {
  createMemoryQueue,
  createPgBossQueue,
  PermanentJobError,
  type FailedJob,
  type JobContext,
  type JobQueue,
} from './queue.js';

vi.mock('../lib/monitoring.js', async (importOriginal) => ({
  ...(await importOriginal<typeof Monitoring>()),
  reportError: vi.fn(),
}));

/** A promise and the function that settles it. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const logger = pino({ level: 'silent' });

/** Every kind of job with three tries and no wait between them. */
const immediate = Object.fromEntries(
  Object.keys(JOB_POLICIES).map((name) => [
    name,
    { ...JOB_POLICIES[name as JobName], attempts: 3, firstRetrySeconds: 0 },
  ]),
) as Record<JobName, JobPolicy>;

const email = (key: string) => ({
  formId: 'form_1',
  kind: 'response' as const,
  sealedMessages: 'v2.test.sealed',
  recipients: 1,
  idempotencyKey: key,
});

/** A handler that fails `failures` times, then succeeds. */
function flaky(failures: number, error = () => new Error('Service unavailable')) {
  let calls = 0;
  return vi.fn((_data: unknown, _context: JobContext) => {
    calls += 1;
    return calls <= failures ? Promise.reject(error()) : Promise.resolve();
  });
}

describe.each([
  ['memory', () => ({ make: createMemoryQueue, real: false })],
  ['pg-boss', () => ({ make: null, real: true })],
] as const)('%s queue', (_kind, setup) => {
  let queue: JobQueue;
  let failed: FailedJob[];

  beforeEach(async () => {
    failed = [];
    const options = {
      logger,
      policies: immediate,
      onFailed: (job: FailedJob) => {
        failed.push(job);
        return Promise.resolve();
      },
    };
    const { real } = setup();
    if (real) {
      await resetJobs();
      queue = createPgBossQueue({ ...options, connectionString: testDatabaseUrl, work: false });
    } else {
      queue = createMemoryQueue(options);
    }
  });

  afterEach(async () => {
    await queue.stop();
  });

  it('retries a failing job until it succeeds', async () => {
    const handler = flaky(2);
    queue.handle('email.send', handler);
    await queue.start();

    await queue.send('email.send', email('a'));
    await queue.drain();

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler.mock.calls.map(([, context]) => context.attempt)).toEqual([1, 2, 3]);
    expect(handler.mock.calls[2]?.[1].lastAttempt).toBe(true);
    expect(failed).toEqual([]);
  });

  it('records a job that runs out of tries, with its last error', async () => {
    const handler = flaky(99, () => new Error('Resend said 503'));
    queue.handle('email.send', handler);
    await queue.start();

    await queue.send('email.send', email('b'));
    await queue.drain();

    expect(handler).toHaveBeenCalledTimes(3);
    expect(failed).toEqual([
      expect.objectContaining({
        name: 'email.send',
        attempts: 3,
        error: 'Resend said 503',
        data: email('b'),
      }),
    ]);
  });

  it('gives up at once when trying again cannot help', async () => {
    const handler = flaky(99, () => new PermanentJobError('Access to the sheet was removed'));
    queue.handle('integration.sync', handler);
    await queue.start();

    await queue.send('integration.sync', {
      formId: 'form_1',
      integrationId: 'int_1',
      submissionId: 'sub_1',
      change: 'created',
    });
    await queue.drain();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(failed).toEqual([
      expect.objectContaining({ attempts: 1, error: 'Access to the sheet was removed' }),
    ]);
  });

  it('leaves jobs scheduled for later alone', async () => {
    const handler = vi.fn(() => Promise.resolve());
    queue.handle('upkeep.hourly', handler);
    await queue.start();

    await queue.send(
      'upkeep.hourly',
      { hour: 'later' },
      { startAfter: new Date(Date.now() + 60_000) },
    );
    await queue.drain();

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('pg-boss queue, working on its own', () => {
  let queue: JobQueue | undefined;

  afterEach(async () => {
    await queue?.stop();
    queue = undefined;
  });

  it('runs a job as soon as it is sent, without waiting for a poll', async () => {
    await resetJobs();
    const done = deferred<number>();
    queue = createPgBossQueue({
      logger,
      policies: immediate,
      onFailed: () => Promise.resolve(),
      connectionString: testDatabaseUrl,
      work: true,
      // A poll this rare can't be what runs it.
      idlePollMs: 10 * 60 * 1000,
    });
    queue.handle('email.send', () => {
      done.resolve(Date.now());
      return Promise.resolve();
    });
    await queue.start();

    const sentAt = Date.now();
    await queue.send('email.send', email('c'));
    expect((await done.promise) - sentAt).toBeLessThan(3000);
  });

  it('wakes for a delayed job when it comes due', async () => {
    await resetJobs();
    const done = deferred<number>();
    queue = createPgBossQueue({
      logger,
      policies: immediate,
      onFailed: () => Promise.resolve(),
      connectionString: testDatabaseUrl,
      work: true,
      idlePollMs: 10 * 60 * 1000,
    });
    queue.handle('upkeep.hourly', () => {
      done.resolve(Date.now());
      return Promise.resolve();
    });
    await queue.start();

    const due = Date.now() + 1500;
    await queue.send('upkeep.hourly', { hour: 'soon' }, { startAfter: new Date(due) });
    const ranAt = await done.promise;
    expect(ranAt).toBeGreaterThanOrEqual(due);
    expect(ranAt - due).toBeLessThan(3000);
  });

  it('keeps jobs queued across a restart', async () => {
    await resetJobs();
    const options = {
      logger,
      policies: immediate,
      onFailed: () => Promise.resolve(),
      connectionString: testDatabaseUrl,
    };
    const sender = createPgBossQueue({ ...options, work: false });
    await sender.start();
    await sender.send('email.send', email('d'));
    await sender.stop();

    const handler = vi.fn(() => Promise.resolve());
    queue = createPgBossQueue({ ...options, work: false });
    queue.handle('email.send', handler);
    await queue.start();
    await queue.drain();
    expect(handler).toHaveBeenCalledWith(email('d'), expect.objectContaining({ attempt: 1 }));
  });
});

describe('alerts', () => {
  it('tell Sentry when Formyx’s own work gives up, but not when an outside service is down', async () => {
    vi.mocked(reportError).mockClear();
    const queue = createMemoryQueue({
      logger,
      policies: immediate,
      onFailed: () => Promise.resolve(),
    });
    queue.handle(
      'billing.event',
      flaky(99, () => new Error('Razorpay said 503')),
    );
    queue.handle(
      'email.send',
      flaky(99, () => new Error('Resend said 503')),
    );
    await queue.start();
    await queue.send('billing.event', { eventId: 'evt_1' });
    await queue.send('email.send', email('c'));
    await queue.drain();

    expect(vi.mocked(reportError).mock.calls).toEqual([
      [
        expect.objectContaining({ message: 'Razorpay said 503' }),
        { job: 'billing.event', attempts: 3 },
      ],
    ]);
    await queue.stop();
  });
});
