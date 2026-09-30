import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

const DEFAULT_TEST_DATABASE_URL = 'postgresql://formyx:formyx@localhost:5432/formyx_test';
const API_ROOT = new URL('../../', import.meta.url);

function readDotEnv(): Record<string, string | undefined> {
  try {
    return parseEnv(readFileSync(new URL('.env', API_ROOT), 'utf8'));
  } catch {
    return {};
  }
}

/** Tests wipe the database, so only ever run them against one that is clearly disposable. */
export function resolveTestDatabaseUrl(
  source: Record<string, string | undefined> = { ...readDotEnv(), ...process.env },
): string {
  const url = source.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against the database "${name}". TEST_DATABASE_URL must name a ` +
        'database ending in "_test", because every test run empties it.',
    );
  }
  return url;
}

export default function setup(project: TestProject) {
  const url = resolveTestDatabaseUrl();
  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');

  try {
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      cwd: API_ROOT,
      // Point both URLs at the test database so a DIRECT_URL in .env can never win.
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
      stdio: 'pipe',
    });
  } catch (error) {
    const output =
      error instanceof Error && 'stderr' in error ? String(error.stderr) : String(error);
    throw new Error(
      `Could not migrate the test database at ${new URL(url).host}. Is Postgres running? ` +
        `See "Database" in the README.\n\n${output}`,
    );
  }

  project.provide('testDatabaseUrl', url);
}
