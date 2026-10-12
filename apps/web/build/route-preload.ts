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

/** The chunks of a build, and what each one needs. */
export function chunkGraph(bundle: Record<string, { type: string }>) {
  const chunks = Object.values(bundle).filter(
    (output): output is typeof output & Chunk => output.type === 'chunk',
  );
  const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));

  /** A chunk's file and the files of every chunk it imports, however indirectly. */
  const withImports = (chunk: Chunk, seen = new Set<string>()) => {
    if (seen.has(chunk.fileName)) return seen;
    seen.add(chunk.fileName);
    for (const file of chunk.imports) {
      const imported = byFile.get(file);
      if (imported) withImports(imported, seen);
    }
    return seen;
  };

  /** The chunk built from `module` (a path relative to the web app). */
  const chunkFor = (module: string) => {
    const chunk = chunks.find((candidate) =>
      candidate.facadeModuleId?.replaceAll('\\', '/').endsWith(module),
    );
    if (!chunk) throw new Error(`No chunk for ${module}`);
    return chunk;
  };

  const entry = chunks.find((chunk) => chunk.isEntry);
  return { withImports, chunkFor, entryFiles: entry ? withImports(entry) : new Set<string>() };
}

const STYLESHEET_LINK = /<link\b[^>]*\brel="stylesheet"/;

/**
 * Adds an inline script to index.html's head, before the stylesheets: a browser holds an inline
 * script until the stylesheets above it have loaded, most of a second on a slow phone.
 */
export function beforeStylesheets(html: string, script: string): string {
  const stylesheet = html.search(STYLESHEET_LINK);
  const at = stylesheet === -1 ? html.indexOf('</head>') : stylesheet;
  if (at === -1) throw new Error('index.html has no </head>');
  return `${html.slice(0, at)}<script>${script}</script>\n    ${html.slice(at)}`;
}

/**
 * Lazy routes are only requested once the app's entry has run and the router has matched the
 * URL. For the routes given, this adds a small script to index.html that asks for their code
 * straight away instead, alongside the entry, so it is ready when the router wants it.
 * The script goes before the stylesheets (see `beforeStylesheets`).
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
        if (!context.bundle) return html;
        const { withImports, chunkFor, entryFiles } = chunkGraph(context.bundle);
        const scripts = routes.map(({ pathPrefix, module }) => {
          const files = [...withImports(chunkFor(module))].filter((file) => !entryFiles.has(file));
          return `if(location.pathname.indexOf(${JSON.stringify(pathPrefix)})===0)${JSON.stringify(
            files.map((file) => base + file),
          )}.forEach(function(f){var l=document.createElement('link');l.rel='modulepreload';l.href=f;document.head.appendChild(l)});`;
        });
        return beforeStylesheets(html, `(function(){${scripts.join('')}})();`);
      },
    },
  };
}
