/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defaultClientConditions, defineConfig, loadEnv } from 'vite';
import { fontPreload } from './build/font-preload.ts';
import { formMetaDev } from './build/form-meta-dev.ts';
import { routePreload } from './build/route-preload.ts';
import { vercelOutput } from './build/vercel-output.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '');
  const proxy = {
    // `ws` carries the live-updates socket, which lives under /api too.
    '/api': {
      target: env.API_PROXY_TARGET || 'http://localhost:4000',
      changeOrigin: true,
      ws: true,
    },
  };

  // Where the site is served, for absolute links in index.html (link previews need them).
  const appUrl = (env.VITE_APP_URL || 'http://localhost:5173').replace(/\/+$/, '');

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'formyx:app-url',
        transformIndexHtml: (html) => html.replaceAll('%APP_URL%', appUrl),
      },
      // Inter, Latin letters: the font almost every page needs first.
      fontPreload(/^assets\/inter-latin-wght-normal-[\w-]+\.woff2$/),
      // Public forms are the page most often opened cold, on any connection.
      routePreload([
        { pathPrefix: '/f/', module: 'src/features/public-form/public-form-page.tsx' },
      ]),
      // Only on Vercel: routes, the /api proxy, security headers and the edge function that
      // gives each public form its own link preview (see build/vercel-output.ts).
      vercelOutput(),
      // The same link previews in development.
      formMetaDev(proxy['/api'].target),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
      // Resolve workspace packages (e.g. @formyx/shared) to their TypeScript source.
      conditions: ['@formyx/source', ...defaultClientConditions],
    },
    server: { port: 5173, strictPort: true, proxy },
    preview: { port: 4173, strictPort: true, proxy },
    build: {
      // Read by scripts/bundle-report.mjs to size each route.
      manifest: true,
      rolldownOptions: {
        output: {
          // React changes least and every page needs it: its own long-cached chunk. Other
          // libraries are left in the chunks of the pages that use them, so a page never
          // downloads, say, every Radix component because one of them is needed.
          codeSplitting: {
            groups: [
              {
                name: 'react',
                test: /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/,
              },
            ],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'build/**/*.test.ts'],
      restoreMocks: true,
      // Editor tests render the whole editor and type like a person, waiting out autosave's
      // one-second delay. They take a second or two, so 5s leaves no room on a busy machine.
      testTimeout: 15_000,
    },
  };
});
