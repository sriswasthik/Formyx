// Rewrites stored forms in the current format (theme v2, the current question schema).
// Locally: `pnpm --filter @formyx/api db:migrate-forms`; on a server after a build:
// `pnpm --filter @formyx/api forms:migrate`. Add `--dry-run` to only report. It uses
// DATABASE_URL, so check which database that is before running it.
import { envSchema } from '../config/env.js';
import { createLogger } from '../lib/logger.js';
import { createPrismaClient } from '../lib/prisma.js';
import { migrateForms } from './form-migration.js';

const env = envSchema
  .pick({ DATABASE_URL: true, NODE_ENV: true, LOG_LEVEL: true })
  .parse(process.env);
const logger = createLogger(env);
const prisma = createPrismaClient(env.DATABASE_URL, logger);
const dryRun = process.argv.includes('--dry-run');

try {
  const started = Date.now();
  const report = await migrateForms(prisma, { dryRun });
  for (const failure of report.failed) logger.warn(failure, 'Form could not be upgraded');
  logger.info(
    {
      dryRun,
      checked: report.checked,
      updated: report.updated,
      skipped: report.skipped,
      failed: report.failed.length,
      ms: Date.now() - started,
    },
    dryRun ? 'Forms that would be upgraded' : 'Forms upgraded',
  );
  // Skipped forms changed while this ran: another run picks them up.
  if (report.failed.length > 0) process.exitCode = 1;
} catch (error) {
  logger.fatal({ err: error }, 'Could not upgrade forms');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
