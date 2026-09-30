import { PrismaPg } from '@prisma/adapter-pg';
import type { Logger } from 'pino';
import { PrismaClient } from '../generated/prisma/client.js';

export type Database = PrismaClient;

/** Creates a Prisma client backed by a `pg` connection pool. Connects lazily, on the first query. */
export function createPrismaClient(databaseUrl: string, logger?: Logger): Database {
  const adapter = new PrismaPg(databaseUrl, {
    onPoolError: (err) => {
      logger?.error({ err }, 'Postgres pool error');
    },
  });
  return new PrismaClient({ adapter });
}
