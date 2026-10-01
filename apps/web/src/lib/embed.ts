/**
 * Whether this page is a form embedded in another site (`/f/:slug?embed=1`, see
 * `public/embed.js`). The inline script in index.html decides it before first paint.
 */
export function isEmbedded(): boolean {
  return document.documentElement.hasAttribute('data-embed');
}
