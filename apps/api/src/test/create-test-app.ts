import type { AddressInfo } from 'node:net';
import { pino } from 'pino';
import { vi } from 'vitest';
import { createApp } from '../app.js';
import { parseEnv } from '../config/env.js';
import { createEventBus } from '../lib/events.js';
import type { EmailMessage, Mailer } from '../lib/mailer.js';
import type { UploadStorage } from '../lib/upload-storage.js';
import type { DeliveryRequest, WebhookTransport } from '../lib/webhook-transport.js';
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
  }: {
    storage?: UploadStorage | null;
    mailer?: Mailer;
    webhooks?: WebhookDispatcher;
    chat?: WebhookTransport;
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
  });
}

/** A chat transport that remembers what it was asked to post, and answers 200. */
export function createFakeChatTransport() {
  const posts: DeliveryRequest[] = [];
  const transport = vi.fn<WebhookTransport>((request) => {
    posts.push(request);
    return Promise.resolve({ statusCode: 200 });
  });
  return Object.assign(transport, { posts });
}

/** Retries a few milliseconds apart rather than seconds, so tests can wait for them. */
export const TEST_RETRY_DELAYS_MS = [5, 10, 20];

export function createTestWebhookDispatcher(
  env = testEnv({}),
  retryDelaysMs: readonly number[] = TEST_RETRY_DELAYS_MS,
): WebhookDispatcher {
  return createDefaultWebhookDispatcher({
    env,
    prisma: testPrisma,
    logger: silentLogger,
    retryDelaysMs,
  });
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
}

/** The whole API (app, sockets, notifications) listening on a free port. Close it after use. */
export async function startTestServer({
  mailer = createFakeMailer(),
  logger = silentLogger,
  storage = null,
  webhookRetryDelaysMs = TEST_RETRY_DELAYS_MS,
  chat = createFakeChatTransport(),
}: {
  mailer?: Mailer;
  logger?: typeof silentLogger;
  storage?: UploadStorage | null;
  /** Waits between webhook retries; a test that acts between tries makes them longer. */
  webhookRetryDelaysMs?: readonly number[];
  chat?: WebhookTransport;
} = {}): Promise<TestServer> {
  const server = createServer({
    env: testEnv({}),
    logger,
    prisma: testPrisma,
    mailer,
    storage,
    webhooks: createTestWebhookDispatcher(testEnv({}), webhookRetryDelaysMs),
    chat,
  });
  await new Promise<void>((resolve) => {
    server.httpServer.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.httpServer.address() as AddressInfo;
  return { ...server, url: `http://127.0.0.1:${port}` };
}
