import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runnerImport, type Plugin } from 'vite';
import type { PublicPage, publicPages } from '../src/app/public-pages.ts';
import { injectFormMeta } from './form-meta-edge.ts';

/** Where the pages' copies of index.html go, under the build: `pages/templates/x.html`. */
export const PAGES_DIR = 'pages';

/** The built file for a page's path. */
export function pageFile(path: string): string {
  return `${PAGES_DIR}${path}.html`;
}

/** JSON that is safe inside a <script> element, whatever the strings in it say. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** index.html, saying what `page` is before any script runs. */
export function renderPage(html: string, page: PublicPage, appUrl: string): string {
  const out = injectFormMeta(
    html,
    {
      slug: page.path,
      title: page.title,
      description: page.description,
      imageUrl: `${appUrl}/og-image.png`,
      indexable: true,
    },
    `${appUrl}${page.path}`,
  );
  if (!page.structuredData) return out;
  const json = `<script type="application/ld+json">${scriptJson(page.structuredData)}</script>`;
  return out.replace('</head>', `  ${json}\n  </head>`);
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** sitemap.xml: the homepage and every public page. */
export function renderSitemap(pages: readonly PublicPage[], appUrl: string): string {
  const urls = ['/', ...pages.map((page) => page.path)].map(
    (path) => `  <url><loc>${escapeXml(`${appUrl}${path}`)}</loc></url>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

/** robots.txt, pointing at the sitemap and keeping the pages' raw files out of results. */
export function renderRobots(robots: string, appUrl: string): string {
  return `${robots.trimEnd()}\nDisallow: /${PAGES_DIR}/\n\nSitemap: ${appUrl}/sitemap.xml\n`;
}

/**
 * After the build: a copy of index.html for each page in src/app/public-pages.ts, with its own
 * title, description and structured data (build/vercel-output.ts serves them at their paths),
 * plus sitemap.xml. The registry is loaded through Vite, so it can use the shared package's
 * source just as the app does.
 */
export function staticPages(appUrl: string): Plugin {
  let root = process.cwd();
  let outDir = 'dist';

  return {
    name: 'formyx:static-pages',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
    },
    async writeBundle() {
      const { module } = await runnerImport<{ publicPages: typeof publicPages }>(
        '/src/app/public-pages.ts',
        {
          root,
          configFile: false,
          logLevel: 'warn',
          // runnerImport's own environment; the shared package is read from its source.
          environments: {
            inline: { resolve: { noExternal: ['@formyx/shared'], conditions: ['@formyx/source'] } },
          },
        },
      );
      const pages = module.publicPages();
      const out = join(root, outDir);
      const html = readFileSync(join(out, 'index.html'), 'utf8');

      for (const page of pages) {
        const file = join(out, pageFile(page.path));
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, renderPage(html, page, appUrl));
      }
      writeFileSync(join(out, 'sitemap.xml'), renderSitemap(pages, appUrl));
      const robots = join(out, 'robots.txt');
      writeFileSync(robots, renderRobots(readFileSync(robots, 'utf8'), appUrl));
    },
  };
}
