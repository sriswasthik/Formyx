import type { Plugin } from 'vite';
import { beforeStylesheets } from './route-preload.ts';

/**
 * Preloads the built font files whose names match `pattern` from index.html, so the main font
 * usually arrives before the first paint instead of swapping in (and moving text) after it.
 * Not on pages under `exceptPathPrefix`: public forms preload the fonts their theme uses (see
 * form-asset-preload.ts), so a form in other fonts leaves the connection to them.
 */
export function fontPreload(pattern: RegExp, exceptPathPrefix: string): Plugin {
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
        return beforeStylesheets(
          html,
          `if(location.pathname.indexOf(${JSON.stringify(exceptPathPrefix)})!==0)${JSON.stringify(
            fonts.map((file) => base + file),
          )}.forEach(function(f){var l=document.createElement('link');l.rel='preload';l.href=f;l.setAttribute('as','font');l.type='font/woff2';l.crossOrigin='';document.head.appendChild(l)});`,
        );
      },
    },
  };
}
