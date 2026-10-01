import type { Plugin } from 'vite';

/**
 * Preloads the built font files whose names match `pattern` from index.html, so the main font
 * usually arrives before the first paint instead of swapping in (and moving text) after it.
 */
export function fontPreload(pattern: RegExp): Plugin {
  let base = '/';
  return {
    name: 'formyx:font-preload',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        if (!context.bundle) return html;
        const fonts = Object.keys(context.bundle).filter((file) => pattern.test(file));
        if (fonts.length === 0) throw new Error(`font-preload: no font matches ${pattern}`);
        return fonts.map((file) => ({
          tag: 'link',
          attrs: {
            rel: 'preload',
            href: base + file,
            as: 'font',
            type: 'font/woff2',
            crossorigin: '',
          },
          injectTo: 'head' as const,
        }));
      },
    },
  };
}
