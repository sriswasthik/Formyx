import { inject } from 'vitest';
import { createPrismaClient, type Database } from '../lib/prisma.js';

export const testDatabaseUrl = inject('testDatabaseUrl');

/** One client per test file. It connects on first use and is closed in `setup.ts`. */
export const testPrisma: Database = createPrismaClient(testDatabaseUrl);

/** Empties every application table; much faster than re-running migrations between tests. */
export async function resetDatabase(prisma: Database = testPrisma): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'
  `;
  if (rows.length === 0) return;

  const tables = rows.map(({ tablename }) => `"${tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}

/** Empties the job queue (pg-boss keeps its jobs in its own schema, which resetDatabase skips). */
export async function resetJobs(prisma: Database = testPrisma): Promise<void> {
  const [installed] = await prisma.$queryRaw<{ found: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'pgboss' AND table_name = 'job'
    ) AS found
  `;
  if (installed?.found) await prisma.$executeRawUnsafe('DELETE FROM pgboss.job');
}
