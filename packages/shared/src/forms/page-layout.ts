import type { Field } from './fields.js';
import { START_PAGE_KEY } from './logic-schema.js';

/** One page of a form as built: its key, and the fields on it (page breaks left out). */
export interface PageLayout<T extends Pick<Field, 'id' | 'type'> = Field> {
  /** `START_PAGE_KEY` for the first page, otherwise the id of the page break that starts it. */
  key: string;
  index: number;
  /** The page break that starts it; `null` for the first page. */
  pageBreak: T | null;
  fields: T[];
}

/**
 * Every page of a form, in order, as page breaks divide it: empty pages included, since
 * logic refers to pages by their key whatever respondents end up seeing on them.
 */
export function formPages<T extends Pick<Field, 'id' | 'type'>>(
  fields: readonly T[],
): PageLayout<T>[] {
  const pages: PageLayout<T>[] = [{ key: START_PAGE_KEY, index: 0, pageBreak: null, fields: [] }];
  for (const field of fields) {
    if (field.type === 'page_break') {
      pages.push({ key: field.id, index: pages.length, pageBreak: field, fields: [] });
    } else {
      pages.at(-1)?.fields.push(field);
    }
  }
  return pages;
}

/** The index of the page each field is on (page breaks are on the page they start). */
export function pageIndexByField(
  fields: readonly Pick<Field, 'id' | 'type'>[],
): Map<string, number> {
  const indexes = new Map<string, number>();
  let page = 0;
  for (const field of fields) {
    if (field.type === 'page_break') page += 1;
    if (!indexes.has(field.id)) indexes.set(field.id, page);
  }
  return indexes;
}
