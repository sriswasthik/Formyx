import type { Plugin } from 'vite';
import { fetchMeta, injectFormMeta } from './form-meta-edge.ts';

/**
 * In development, what the edge function does in production: a public form's page carries
 * its own title, preview image, icon and robots rule (see form-meta-edge.ts), so they can be
 * checked locally.
 */
export function formMetaDev(apiUrl: string): Plugin {
  return {
    name: 'formyx:form-meta-dev',
    apply: 'serve',
    transformIndexHtml: {
      order: 'post',
      async handler(html, { originalUrl, server }) {
        const url = new URL(originalUrl ?? '/', 'http://localhost');
        const slug = /^\/f\/([^/]+)\/?$/.exec(url.pathname)?.[1];
        if (!slug) return html;
        const meta = await fetchMeta(apiUrl.replace(/\/+$/, ''), decodeURIComponent(slug));
        if (!meta) return html;
        const origin =
          server?.resolvedUrls?.local[0]?.replace(/\/+$/, '') ?? 'http://localhost:5173';
        return injectFormMeta(html, meta, `${origin}/f/${meta.slug}`);
      },
    },
  };
}
