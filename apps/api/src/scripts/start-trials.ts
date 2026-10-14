// Gives existing workspaces on Free their trial, when a server switches to
// ENTITLEMENTS_MODE=enforced (see billing/start-trials.ts):
// `pnpm --filter @formyx/api billing:start-trials -- --dry-run` to see how many, then without.
// It uses DATABASE_URL, so check which database that is before running it.
import { envSchema } from '../config/env.js';
import { startTrialsForExistingWorkspaces } from '../billing/start-trials.js';
import { createLogger } from '../lib/logger.js';
import { createPrismaClient } from '../lib/prisma.js';

const env = envSchema
  .pick({ DATABASE_URL: true, NODE_ENV: true, LOG_LEVEL: true })
  .parse(process.env);
const logger = createLogger(env);
const prisma = createPrismaClient(env.DATABASE_URL, logger);
const dryRun = process.argv.includes('--dry-run');

try {
  const report = await startTrialsForExistingWorkspaces(prisma, { dryRun });
  logger.info({ dryRun, ...report }, dryRun ? 'Trials that would start' : 'Trials started');
} catch (error) {
  logger.fatal({ err: error }, 'Could not start trials');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
