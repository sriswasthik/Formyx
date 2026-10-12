// Runs background jobs in a process of their own, for an API started with WORKERS=off:
// `pnpm --filter @formyx/api jobs:worker` (a Render background worker, say). With the default
// WORKERS=on the API runs them itself and this isn't needed.
import { parseEnv } from '../config/env.js';
import { createLogger } from '../lib/logger.js';
import { createMailer } from '../lib/mailer.js';
import { createPrismaClient } from '../lib/prisma.js';
import { createUploadStorage } from '../lib/upload-storage.js';
import { createServer } from '../server.js';
import { createJobQueue } from './create-queue.js';
import { scheduleNextUpkeep } from './upkeep.js';

/** The API queues jobs from another process, so look for them often. */
const WORKER_IDLE_POLL_MS = 5000;

const env = parseEnv(process.env);
const logger = createLogger(env);
const prisma = createPrismaClient(env.DATABASE_URL, logger);
const jobs = createJobQueue({ env, prisma, logger, work: true, idlePollMs: WORKER_IDLE_POLL_MS });

// The server registers every job handler; it never listens here.
createServer({
  env,
  logger,
  prisma,
  mailer: createMailer(env, logger),
  storage: createUploadStorage(env),
  jobs,
});
await jobs.start();
await scheduleNextUpkeep(jobs);
logger.info('Job worker started');

async function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, 'Stopping the job worker');
  await jobs.stop().catch((error: unknown) => {
    logger.error({ err: error }, 'Could not stop the job queue cleanly');
  });
  await prisma.$disconnect();
  process.exit(0);
}
process.once('SIGINT', (signal) => void shutdown(signal));
process.once('SIGTERM', (signal) => void shutdown(signal));
