import type { Logger } from 'pino';
import type { Env } from '../config/env.js';
import type { Database } from '../lib/prisma.js';
import { createFailureRecorder } from './failures.js';
import { createPgBossQueue, type JobQueue } from './queue.js';

/**
 * The API's job queue, from its settings: on the direct database connection (a pooler in
 * transaction mode can't hold the queue's locks), recording jobs that fail for good.
 */
export function createJobQueue({
  env,
  prisma,
  logger,
  work = env.WORKERS,
  idlePollMs,
}: {
  env: Pick<Env, 'DATABASE_URL' | 'DIRECT_URL' | 'WORKERS'>;
  prisma: Database;
  logger: Logger;
  /** Run jobs in this process; otherwise only queue them. */
  work?: boolean;
  idlePollMs?: number;
}): JobQueue {
  return createPgBossQueue({
    connectionString: env.DIRECT_URL ?? env.DATABASE_URL,
    logger,
    work,
    ...(idlePollMs !== undefined && { idlePollMs }),
    onFailed: createFailureRecorder(prisma),
  });
}
