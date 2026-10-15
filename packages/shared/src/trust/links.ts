import type { FormSchema } from '../forms/form-schema.js';

/*
 * The web addresses a form sends people to: links in its text, end screen buttons and
 * redirects, and the images it shows. Publishing checks each against the blocklist (and
 * Google Safe Browsing, where it is set up).
 */

const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"'`)\]]+/gi;

/** Every distinct http(s) address in `schema`, wherever it is. */
export function extractFormLinks(schema: FormSchema): string[] {
  const links = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === 'string') {
      for (const found of value.matchAll(URL_IN_TEXT)) {
        // A sentence's full stop or comma is not part of the address.
        links.add(found[0].replace(/[.,;:!?]+$/, ''));
      }
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value !== null && typeof value === 'object') {
      Object.values(value).forEach(visit);
    }
  };
  visit(schema);
  return [...links];
}

/** The end screens' redirects that point somewhere: what "custom redirects" means. */
export function formRedirectUrls(schema: FormSchema): string[] {
  return schema.logic.endScreens
    .map((screen) => screen.redirect?.url.trim() ?? '')
    .filter((url) => url !== '');
}
