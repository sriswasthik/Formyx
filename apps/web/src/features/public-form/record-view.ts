import { recordFormView } from './public-form-api';

const viewedKey = (slug: string) => `formyx:viewed:${slug}`;

/**
 * Counts a view of the form once per browser session. Storage can be unavailable (private
 * windows, blocked site data); then every visit counts, which beats counting none.
 */
export function recordViewOnce(slug: string): void {
  try {
    if (sessionStorage.getItem(viewedKey(slug))) return;
    sessionStorage.setItem(viewedKey(slug), '1');
  } catch {
    // Storage is off: count the view anyway.
  }
  // Views are best effort; a failure must never get in the respondent's way.
  recordFormView(slug).catch(() => undefined);
}
