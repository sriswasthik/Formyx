// Resets the shared demo account: `pnpm db:seed:demo` locally, `pnpm demo:reset` on a server
// (a nightly cron job in render.yaml). Needs only DATABASE_URL.
import { envSchema } from '../config/env.js';
import { createLogger } from '../lib/logger.js';
import { createPrismaClient } from '../lib/prisma.js';
import { resetDemo } from './demo-seed.js';

const env = envSchema
  .pick({ DATABASE_URL: true, NODE_ENV: true, LOG_LEVEL: true })
  .parse(process.env);
const logger = createLogger(env);
const prisma = createPrismaClient(env.DATABASE_URL, logger);

try {
  const started = Date.now();
  const account = await resetDemo(prisma);
  logger.info({ ...account, ms: Date.now() - started }, 'Demo account reset');
} catch (error) {
  logger.fatal({ err: error }, 'Could not reset the demo account');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
