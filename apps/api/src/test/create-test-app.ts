import type { AddressInfo } from 'node:net';
import { pino } from 'pino';
import { vi } from 'vitest';
import { createApp } from '../app.js';
import { parseEnv } from '../config/env.js';
import { createEventBus } from '../lib/events.js';
import type { EmailMessage, Mailer } from '../lib/mailer.js';
import type { UploadStorage } from '../lib/upload-storage.js';
import type { DeliveryRequest, WebhookTransport } from '../lib/webhook-transport.js';
import { createFailureRecorder } from '../jobs/failures.js';
import { JOB_POLICIES, type JobName, type JobPolicy } from '../jobs/job-types.js';
import { createMemoryQueue } from '../jobs/queue.js';
import { createDefaultWebhookDispatcher, type WebhookDispatcher } from '../webhooks/dispatcher.js';
import { createServer, type FormyxServer } from '../server.js';
import { testDatabaseUrl, testPrisma } from './database.js';

export const TEST_JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-chars';

const silentLogger = pino({ level: 'silent' });

function testEnv(env: Record<string, string>) {
  return parseEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: testDatabaseUrl,
    JWT_SECRET: TEST_JWT_SECRET,
    // The minimum cost keeps password hashing from dominating test time.
    BCRYPT_COST: '4',
    // One app serves a whole test file; rate-limit tests pass their own low limit.
    AUTH_RATE_LIMIT_MAX: '1000',
    SUBMISSION_RATE_LIMIT_MAX: '1000',
    INVITE_RATE_LIMIT_MAX: '1000',
    API_RATE_LIMIT_MAX: '100000',
    // Test receivers listen on 127.0.0.1.
    WEBHOOK_ALLOW_PRIVATE_URLS: 'true',
    APP_URL: 'https://app.formyx.test',
    ...env,
  });
}

/**
 * The Express app alone: enough for request/response tests. Events go nowhere, emails go to
 * a fake mailer, and uploads are off unless a `storage` is given (see `createFakeCloudinary`).
 */
export function createTestApp(
  env: Record<string, string> = {},
  {
    storage = null,
    mailer = createFakeMailer(),
    webhooks,
    chat = createFakeChatTransport(),
    jobs = createTestQueue(),
  }: {
    storage?: UploadStorage | null;
    mailer?: Mailer;
    webhooks?: WebhookDispatcher;
    chat?: WebhookTransport;
    jobs?: TestQueue;
  } = {},
) {
  const parsed = testEnv(env);
  return createApp({
    env: parsed,
    logger: silentLogger,
    prisma: testPrisma,
    events: createEventBus(silentLogger),
    storage,
    mailer,
    webhooks: webhooks ?? createTestWebhookDispatcher(parsed),
    chat,
    jobs,
  });
}

/** Every kind of job with its real number of tries, but no wait between them. */
export const TEST_JOB_POLICIES = Object.fromEntries(
  Object.entries(JOB_POLICIES).map(([name, policy]) => [name, { ...policy, firstRetrySeconds: 0 }]),
) as Record<JobName, JobPolicy>;

/**
 * Jobs in memory, retried at once, failures recorded as in production. `autoRun` runs each as
 * soon as it is sent; otherwise call `drain()`.
 */
export function createTestQueue({ autoRun = false }: { autoRun?: boolean } = {}) {
  return createMemoryQueue({
    logger: silentLogger,
    policies: TEST_JOB_POLICIES,
    onFailed: createFailureRecorder(testPrisma),
    autoRun,
  });
}
export type TestQueue = ReturnType<typeof createTestQueue>;

/** A chat transport that remembers what it was asked to post, and answers 200. */
export function createFakeChatTransport() {
  const posts: DeliveryRequest[] = [];
  const transport = vi.fn<WebhookTransport>((request) => {
    posts.push(request);
    return Promise.resolve({ statusCode: 200 });
  });
  return Object.assign(transport, { posts });
}

export function createTestWebhookDispatcher(env = testEnv({})): WebhookDispatcher {
  return createDefaultWebhookDispatcher({ env, prisma: testPrisma, logger: silentLogger });
}

/** A mailer that remembers what it was asked to send. */
export function createFakeMailer() {
  const sent: { messages: EmailMessage[]; idempotencyKey: string }[] = [];
  const send = vi.fn<Mailer['send']>((messages, { idempotencyKey }) => {
    sent.push({ messages, idempotencyKey });
    return Promise.resolve();
  });
  return { send, sent } satisfies Mailer & { sent: unknown };
}

export interface TestServer extends FormyxServer {
  /** e.g. `http://127.0.0.1:53123`. */
  url: string;
  jobs: TestQueue;
}

/** The whole API (app, sockets, notifications) listening on a free port. Close it after use. */
export async function startTestServer({
  mailer = createFakeMailer(),
  logger = silentLogger,
  storage = null,
  chat = createFakeChatTransport(),
  autoRunJobs = true,
  env = {},
}: {
  mailer?: Mailer;
  logger?: typeof silentLogger;
  storage?: UploadStorage | null;
  chat?: WebhookTransport;
  /** Run jobs as soon as they are sent (the default), or only on `server.jobs.drain()`. */
  autoRunJobs?: boolean;
  /** Settings on top of the test defaults (fake Google's address, say). */
  env?: Record<string, string>;
} = {}): Promise<TestServer> {
  const jobs = createTestQueue({ autoRun: autoRunJobs });
  const server = createServer({
    env: testEnv(env),
    logger,
    prisma: testPrisma,
    mailer,
    storage,
    webhooks: createTestWebhookDispatcher(testEnv({})),
    chat,
    jobs,
  });
  await new Promise<void>((resolve) => {
    server.httpServer.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.httpServer.address() as AddressInfo;
  return { ...server, jobs, url: `http://127.0.0.1:${port}` };
}
