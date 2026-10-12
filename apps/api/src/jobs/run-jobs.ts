// Runs the scheduled jobs once: `pnpm --filter @formyx/api jobs:run` locally, `pnpm jobs` on
// a server (an hourly cron job in render.yaml). Uses the API's environment.
import { parseEnv } from '../config/env.js';
import { createLogger } from '../lib/logger.js';
import { createMailer } from '../lib/mailer.js';
import { createPrismaClient } from '../lib/prisma.js';
import { createUploadStorage } from '../lib/upload-storage.js';
import { applyRetention, pruneExpired, sendDigests } from './jobs.js';

const env = parseEnv(process.env);
const logger = createLogger(env);
const prisma = createPrismaClient(env.DATABASE_URL, logger);

try {
  const deps = {
    prisma,
    mailer: createMailer(env, logger),
    storage: createUploadStorage(env),
    logger,
    appUrl: env.APP_URL,
  };
  const started = Date.now();
  const digests = await sendDigests(deps);
  const retention = await applyRetention(deps);
  const pruned = await pruneExpired(deps);
  logger.info({ digests, retention, pruned, ms: Date.now() - started }, 'Scheduled jobs done');
} catch (error) {
  logger.fatal({ err: error }, 'Scheduled jobs failed');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
