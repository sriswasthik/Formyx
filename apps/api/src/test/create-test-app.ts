import type { AddressInfo } from 'node:net';
import { pino } from 'pino';
import { createApp } from '../app.js';
import { parseEnv } from '../config/env.js';
import { createEventBus } from '../lib/events.js';
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
    ...env,
  });
}

/** The Express app alone: enough for request/response tests. Events go nowhere. */
export function createTestApp(env: Record<string, string> = {}) {
  return createApp({
    env: testEnv(env),
    logger: silentLogger,
    prisma: testPrisma,
    events: createEventBus(silentLogger),
  });
}

export interface TestServer extends FormyxServer {
  /** e.g. `http://127.0.0.1:53123`. */
  url: string;
}

/** The whole API (app and sockets) listening on a free port. Close it after use. */
export async function startTestServer({
  logger = silentLogger,
}: { logger?: typeof silentLogger } = {}): Promise<TestServer> {
  const server = createServer({ env: testEnv({}), logger, prisma: testPrisma });
  await new Promise<void>((resolve) => {
    server.httpServer.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.httpServer.address() as AddressInfo;
  return { ...server, url: `http://127.0.0.1:${port}` };
}
