import { defineConfig } from 'prisma/config';

// The Prisma CLI does not read .env files; load ours when present. Variables that are
// already set in the environment (CI, tests, production) take precedence.
try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the environment.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Migrations need a direct connection. With a pooled URL (e.g. Neon) set DIRECT_URL too.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
});
