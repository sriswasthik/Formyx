export const SLUG_MAX_LENGTH = 48;

/**
 * Turns arbitrary text into a URL-safe slug: `"Ünïcode Forms!"` -> `"unicode-forms"`.
 * Returns an empty string when nothing usable is left, so callers can pick a fallback.
 */
export function slugify(text: string, maxLength = SLUG_MAX_LENGTH): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, maxLength)
    .replace(/^-+|-+$/g, '');
}
