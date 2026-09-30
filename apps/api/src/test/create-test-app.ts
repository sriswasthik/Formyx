import { pino } from 'pino';
import { createApp } from '../app.js';
import { parseEnv } from '../config/env.js';
import { testDatabaseUrl, testPrisma } from './database.js';

export const TEST_JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-chars';

export function createTestApp(env: Record<string, string> = {}) {
  return createApp({
    env: parseEnv({
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
    }),
    logger: pino({ level: 'silent' }),
    prisma: testPrisma,
  });
}
