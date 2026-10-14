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

/** The home page's copy of index.html, with its top already drawn (see home-shell.tsx). */
export const HOME_FILE = 'home.html';

const ENTRY_SCRIPT = /<script type="module" crossorigin src="([^"]+)"><\/script>\n?/;
const MODULE_PRELOAD = /[ \t]*<link rel="modulepreload" crossorigin href="([^"]+)">\n?/g;
/** build/route-preload.ts's script, and the files it preloads for the home page. */
const ROUTE_PRELOAD = /[ \t]*<script>\(function\(\)\{if\(location\.pathname[\s\S]*?<\/script>\n?/;
const HOME_ROUTE_FILES = /if\(location\.pathname==="\/"\)(\[[^\]]*\])/;

/**
 * Starts the app once the browser has painted the page's content (its first contentful paint)
 * and its fonts have arrived, so the headline is redrawn in Inter straight away rather than
 * after the app's first render, waiting at most a second for them; and after 1.5 seconds
 * whatever happens (a background tab paints nothing; an old browser may not report paints).
 * Its scripts (`preloads`, then the entry) are only asked for then, so on a slow connection
 * the HTML, stylesheet and font come first.
 */
export function deferredEntry(src: string, preloads: readonly string[] = []): string {
  return `(function(){var started=false;function add(el){document.head.appendChild(el)}function start(){if(started)return;started=true;${JSON.stringify(preloads)}.forEach(function(f){var l=document.createElement('link');l.rel='modulepreload';l.crossOrigin='';l.href=f;add(l)});var s=document.createElement('script');s.type='module';s.crossOrigin='';s.src=${JSON.stringify(src)};add(s)}function painted(){if(document.fonts)document.fonts.ready.then(start);else start();setTimeout(start,1000)}try{new PerformanceObserver(function(list){if(list.getEntriesByName('first-contentful-paint').length)painted()}).observe({type:'paint',buffered:true})}catch(e){requestAnimationFrame(function(){setTimeout(painted)})}setTimeout(start,1500)})();`;
}

/**
 * index.html with `markup` drawn in its root, marked so the app knows to wait for the page's
 * code before drawing over it (see main.tsx). Its scripts start after the first paint (see
 * `deferredEntry`), rather than running, and downloading, ahead of it.
 */
export function renderHome(html: string, markup: string): string {
  const root = '<div id="root"></div>';
  if (!html.includes(root)) throw new Error('index.html has no empty <div id="root"></div>');
  const entry = ENTRY_SCRIPT.exec(html);
  if (!entry?.[1]) throw new Error('index.html has no module entry script');
  const routePreload = ROUTE_PRELOAD.exec(html)?.[0] ?? '';
  const homeFiles = HOME_ROUTE_FILES.exec(routePreload)?.[1];
  const preloads = [
    ...[...html.matchAll(MODULE_PRELOAD)].map((match) => match[1] ?? ''),
    ...(homeFiles ? (JSON.parse(homeFiles) as string[]) : []),
  ];
  return html
    .replace(entry[0], '')
    .replace(MODULE_PRELOAD, '')
    .replace(routePreload, '')
    .replace(root, `<div id="root" data-prerendered>${markup}</div>`)
    .replace('</body>', `<script>${deferredEntry(entry[1], preloads)}</script>\n</body>`);
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
 * sitemap.xml, and the home page's copy with its header and hero drawn in (`HOME_FILE`). The
 * registry and the home page's components are loaded through Vite, so they can use the shared
 * package's source and the app's `@/` imports just as the app does.
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

      const { module: home } = await runnerImport<{ renderHomeShell: () => string }>(
        '/src/features/landing/home-shell.tsx',
        {
          root,
          configFile: false,
          logLevel: 'warn',
          resolve: { alias: { '@': join(root, 'src') } },
          environments: {
            inline: { resolve: { noExternal: ['@formyx/shared'], conditions: ['@formyx/source'] } },
          },
        },
      );
      writeFileSync(join(out, HOME_FILE), renderHome(html, home.renderHomeShell()));

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
