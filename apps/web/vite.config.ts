/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defaultClientConditions, defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '');
  const proxy = {
    '/api': { target: env.API_PROXY_TARGET || 'http://localhost:4000', changeOrigin: true },
  };

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
      // Resolve workspace packages (e.g. @formyx/shared) to their TypeScript source.
      conditions: ['@formyx/source', ...defaultClientConditions],
    },
    server: { port: 5173, strictPort: true, proxy },
    preview: { port: 4173, strictPort: true, proxy },
    build: {
      rolldownOptions: {
        output: {
          // Long-lived vendor chunks cache across deploys; app code changes more often.
          codeSplitting: {
            groups: [
              {
                name: 'react',
                test: /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/,
              },
              {
                name: 'radix',
                test: /[\\/]node_modules[\\/](@radix-ui|radix-ui|@floating-ui)[\\/]/,
              },
              {
                name: 'motion',
                test: /[\\/]node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/,
              },
            ],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      restoreMocks: true,
    },
  };
});
