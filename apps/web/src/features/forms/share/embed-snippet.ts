/** What to paste into another site to show the form there (see public/embed.js). */
export function embedSnippet(slug: string, origin: string = window.location.origin): string {
  return `<div data-formyx="${slug}"></div>\n<script src="${origin}/embed.js" async></script>`;
}
