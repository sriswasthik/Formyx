/** Lets Excel recognise the file as UTF-8, so accents and non-Latin answers survive. */
export const CSV_BOM = '﻿';

/**
 * Spreadsheet apps run a cell starting with one of these as a formula, so a respondent could
 * plant `=HYPERLINK(...)` or worse in an export (CSV injection).
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export type CsvValue = string | number | null | undefined;

/**
 * One field (RFC 4180): wrapped in quotes when it holds a comma, quote or line break, with
 * quotes doubled. Text that would run as a formula gets a leading `'`, which spreadsheets
 * read as "this is text". Numbers are left as numbers, so negative ones stay usable.
 */
export function escapeCsvField(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';

  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** One record, ending in CRLF as RFC 4180 asks. */
export function toCsvRow(values: readonly CsvValue[]): string {
  return `${values.map(escapeCsvField).join(',')}\r\n`;
}
