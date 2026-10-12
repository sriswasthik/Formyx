/*
 * The edge function in front of public forms (/f/:slug). Link previews (chat apps, social
 * sites) and search engines read a page's <head> without running its scripts, so this writes
 * the form's own title, description, preview image, icon and robots rule into index.html
 * before it is sent. If the API is slow or the form is unknown, the page goes out as it is and
 * the app takes over as usual.
 *
 * It runs on Vercel's edge runtime as plain JavaScript: vercel-output.ts transpiles this file
 * and appends the handler's settings, so it must not import anything at runtime (type-only
 * imports are fine; they disappear).
 */
import type { FormMeta } from '@formyx/shared';

/** How long the API gets before the page goes out without the form's details. */
export const META_TIMEOUT_MS = 1500;

export function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** The tags the site's own index.html has for itself, which a form's replace. */
const SITE_META =
  /[ \t]*<meta\b[^>]*\b(?:name|property)="(?:description|og:[^"]*|twitter:[^"]*)"[^>]*>\n?/g;
const SITE_ICONS = /[ \t]*<link\b[^>]*\brel="(?:icon|apple-touch-icon)"[^>]*>\n?/g;
const PREVIEW_COMMENT = /[ \t]*<!-- Link previews\.[^>]*-->\n?/;

/** `html` with the form's title, description, preview image, icon and robots rule. */
export function injectFormMeta(html: string, meta: FormMeta, pageUrl: string): string {
  const tags: [string, string, string][] = [
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', 'Formyx'],
    ['property', 'og:title', meta.title],
    ['property', 'og:url', pageUrl],
    ['property', 'og:image', meta.imageUrl],
    ['property', 'og:image:alt', meta.title],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', meta.title],
    ['name', 'twitter:image', meta.imageUrl],
  ];
  if (meta.description) {
    tags.push(
      ['name', 'description', meta.description],
      ['property', 'og:description', meta.description],
      ['name', 'twitter:description', meta.description],
    );
  }
  if (!meta.indexable) tags.push(['name', 'robots', 'noindex, nofollow']);

  const lines = tags.map(
    ([kind, key, content]) => `<meta ${kind}="${key}" content="${escapeAttribute(content)}" />`,
  );
  lines.push(`<link rel="canonical" href="${escapeAttribute(pageUrl)}" />`);
  if (meta.faviconUrl) lines.push(`<link rel="icon" href="${escapeAttribute(meta.faviconUrl)}" />`);

  let out = html
    .replace(PREVIEW_COMMENT, '')
    .replace(SITE_META, '')
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeAttribute(meta.title)}</title>`);
  if (meta.faviconUrl) out = out.replace(SITE_ICONS, '');
  return out.replace('</head>', `    ${lines.join('\n    ')}\n  </head>`);
}

/** Reads a form's details from the API, or `null` if it is unknown, unpublished or too slow. */
export async function fetchMeta(apiUrl: string, slug: string): Promise<FormMeta | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, META_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiUrl}/api/public/forms/${encodeURIComponent(slug)}/meta`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const meta = (await response.json()) as Partial<FormMeta>;
    return typeof meta.slug === 'string' &&
      typeof meta.title === 'string' &&
      typeof meta.imageUrl === 'string' &&
      typeof meta.indexable === 'boolean'
      ? (meta as FormMeta)
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface FormMetaHandlerOptions {
  /** The API's address, e.g. `https://formyx-api.onrender.com`. */
  apiUrl: string;
  /** The built index.html. */
  html: string;
}

/** Answers `GET /f/:slug` with index.html, written for that form. */
export function createFormMetaHandler({ apiUrl, html }: FormMetaHandlerOptions) {
  const api = apiUrl.replace(/\/+$/, '');
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const match = /^\/f\/([^/]+)\/?$/.exec(url.pathname);
    const slug = match?.[1] ? decodeURIComponent(match[1]) : null;
    const meta = slug ? await fetchMeta(api, slug) : null;

    // An old address: send people (and crawlers) to the current one, keeping the query.
    if (meta && slug && meta.slug !== slug) {
      const target = new URL(`/f/${encodeURIComponent(meta.slug)}${url.search}`, url.origin);
      return Response.redirect(target.toString(), 301);
    }

    const body = meta ? injectFormMeta(html, meta, `${url.origin}/f/${meta.slug}`) : html;
    return new Response(body, {
      // Security headers come from the /f/ route in config.json, as for every page.
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Short: a new title or image should show up soon after it is published.
        'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
      },
    });
  };
}
