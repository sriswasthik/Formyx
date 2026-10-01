import type { Plugin } from 'vite';

interface PreloadedRoute {
  /** URLs starting with this get the route's code preloaded, e.g. `/f/`. */
  pathPrefix: string;
  /** The route's module, relative to the web app, e.g. `src/features/public-form/page.tsx`. */
  module: string;
}

interface Chunk {
  type: 'chunk';
  fileName: string;
  isEntry: boolean;
  facadeModuleId: string | null;
  imports: string[];
}

/**
 * Lazy routes are only requested once the app's entry has run and the router has matched the
 * URL. For the routes given, this adds a small script to index.html that asks for their code
 * straight away instead, alongside the entry, so it is ready when the router wants it.
 */
export function routePreload(routes: PreloadedRoute[]): Plugin {
  let base = '/';
  return {
    name: 'formyx:route-preload',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        const bundle = context.bundle;
        if (!bundle) return html;
        const chunks = Object.values(bundle).filter(
          (output): output is typeof output & Chunk => output.type === 'chunk',
        );
        const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
        const withImports = (chunk: Chunk, seen = new Set<string>()) => {
          if (seen.has(chunk.fileName)) return seen;
          seen.add(chunk.fileName);
          for (const file of chunk.imports) {
            const imported = byFile.get(file);
            if (imported) withImports(imported, seen);
          }
          return seen;
        };
        const entry = chunks.find((chunk) => chunk.isEntry);
        const alreadyLoaded = entry ? withImports(entry) : new Set<string>();

        const scripts = routes.map(({ pathPrefix, module }) => {
          const route = chunks.find((chunk) =>
            chunk.facadeModuleId?.replaceAll('\\', '/').endsWith(module),
          );
          if (!route) throw new Error(`route-preload: no chunk for ${module}`);
          const files = [...withImports(route)].filter((file) => !alreadyLoaded.has(file));
          return `if(location.pathname.indexOf(${JSON.stringify(pathPrefix)})===0)${JSON.stringify(
            files.map((file) => base + file),
          )}.forEach(function(f){var l=document.createElement('link');l.rel='modulepreload';l.href=f;document.head.appendChild(l)});`;
        });

        return [
          {
            tag: 'script',
            children: `(function(){${scripts.join('')}})();`,
            injectTo: 'head',
          },
        ];
      },
    },
  };
}
