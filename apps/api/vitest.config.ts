import { defineConfig } from 'vitest/config';

// Resolve workspace packages to their TypeScript source so tests never depend on a prior build.
const conditions = ['@formyx/source', 'module', 'node', 'development|production'];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['./src/test/global-setup.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // Test files share one Postgres database and empty it between tests.
    fileParallelism: false,
  },
});
