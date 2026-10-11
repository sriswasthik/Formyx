import type { Field } from './fields.js';
import type { FormSchema } from './form-schema.js';
import { HIDDEN_VALUE_MAX_LENGTH } from './submission.js';

/**
 * Hidden fields' answers from a form link's query string: `?source=instagram` fills the
 * hidden field whose `paramName` is "source". Empty values are left out and long ones are
 * cut to what the server keeps. Names match exactly, as links are written.
 */
export function hiddenFieldValues(
  schema: Pick<FormSchema, 'fields'>,
  params: URLSearchParams,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of schema.fields) {
    if (field.type !== 'hidden' || field.paramName === '') continue;
    const value = params.get(field.paramName)?.trim();
    if (value) values[field.id] = value.slice(0, HIDDEN_VALUE_MAX_LENGTH);
  }
  return values;
}

/** One page of a multi-page form: the fields on it and the page break that starts it. */
export interface FormPage<T extends Pick<Field, 'id' | 'type'> = Field> {
  /** The page break before it; `null` for the first page. */
  start: T | null;
  fields: T[];
}

/**
 * Splits fields (those respondents can see, in order) into pages at each page break. Pages
 * with nothing to show (two breaks in a row, a break at the very end, a page of hidden
 * fields) are left out, so respondents never land on an empty page.
 */
export function splitIntoPages<T extends Pick<Field, 'id' | 'type'>>(
  fields: readonly T[],
): FormPage<T>[] {
  const pages: FormPage<T>[] = [{ start: null, fields: [] }];
  for (const field of fields) {
    if (field.type === 'page_break') pages.push({ start: field, fields: [] });
    else pages.at(-1)?.fields.push(field);
  }
  const shown = pages.filter((page) => page.fields.some((field) => field.type !== 'hidden'));
  // Hidden fields still belong to some page, so their answers are sent.
  const hidden = pages
    .filter((page) => !shown.includes(page))
    .flatMap((page) => page.fields.filter((field) => field.type === 'hidden'));
  const first = shown[0];
  if (!first) return [{ start: null, fields: [...hidden] }];
  first.fields.push(...hidden);
  return shown;
}
