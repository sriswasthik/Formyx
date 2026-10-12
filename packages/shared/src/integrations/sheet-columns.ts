import { z } from 'zod';
import { csvAnswerColumns, csvOutcomeColumns, type CsvCell } from '../forms/csv-columns.js';
import type { FormSchema } from '../forms/form-schema.js';
import type { SubmissionRecord } from '../forms/responses.js';

/*
 * How a form's responses fill a Google Sheet. People sort, filter and add formulas beside
 * the data, so columns never move: a new question gets a new column at the end, a renamed one
 * keeps its column (with the new header), and a removed one keeps its column and its past
 * answers. Each column is known by a key that survives renames (see `CsvColumn.key`).
 *
 * The response id comes first, so a changed response finds its row however the sheet has
 * been sorted.
 */

export const SHEET_COLUMN_KINDS = ['text', 'number', 'date', 'datetime'] as const;
export type SheetColumnKind = (typeof SHEET_COLUMN_KINDS)[number];

export const sheetColumnSchema = z.object({
  key: z.string().min(1).max(200),
  header: z.string().max(500),
  kind: z.enum(SHEET_COLUMN_KINDS),
});
export type SheetColumn = z.infer<typeof sheetColumnSchema>;

/** Keys of the columns every sheet has, whatever the form asks. */
export const RESPONSE_ID_KEY = 'meta:id';
const SUBMITTED_KEY = 'meta:submitted';
const EMAIL_KEY = 'meta:email';
const DURATION_KEY = 'meta:duration';
const EDITED_KEY = 'meta:edited';

/** A column with how to fill it from a response. */
interface ColumnSource extends SheetColumn {
  cell: (submission: SubmissionRecord) => SheetCell;
}

/** A cell as written: text, a number, a date (`YYYY-MM-DD`) or a time (ISO), or empty. */
export type SheetCell = CsvCell | { date: string } | { datetime: string };

export interface SheetSources {
  /** Asked before the questions, when the form collects respondents' email. */
  collectsEmail: boolean;
  /** Respondents can change their responses: show when they did. */
  allowsEdits: boolean;
}

/** The columns `schema` gives today, in form order, with how to fill each. */
function columnSources(schema: FormSchema | null, sources: SheetSources): ColumnSource[] {
  const answers = schema ? csvAnswerColumns(schema) : [];
  const outcomes = schema ? csvOutcomeColumns(schema) : [];
  const toCell = (value: CsvCell, kind: SheetColumnKind): SheetCell =>
    kind === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? { date: value }
      : value;
  return [
    {
      key: RESPONSE_ID_KEY,
      header: 'Response ID',
      kind: 'text',
      cell: (submission) => submission.id,
    },
    {
      key: SUBMITTED_KEY,
      header: 'Submitted at (UTC)',
      kind: 'datetime',
      cell: (submission) => ({ datetime: submission.createdAt }),
    },
    ...(sources.collectsEmail
      ? [
          {
            key: EMAIL_KEY,
            header: 'Respondent email',
            kind: 'text' as const,
            cell: (submission: SubmissionRecord) => submission.respondentEmail ?? null,
          },
        ]
      : []),
    ...answers.map((column) => ({
      key: `field:${column.key}`,
      header: column.header,
      kind: column.kind,
      cell: (submission: SubmissionRecord) => toCell(column.cell(submission.answers), column.kind),
    })),
    ...outcomes.map((column) => ({
      key: `outcome:${column.key}`,
      header: column.header,
      kind: column.kind,
      cell: (submission: SubmissionRecord) => column.cell(submission.outcome),
    })),
    {
      key: DURATION_KEY,
      header: 'Time to complete (seconds)',
      kind: 'number',
      cell: (submission) =>
        submission.completionTimeMs === null
          ? null
          : Math.round(submission.completionTimeMs / 1000),
    },
    ...(sources.allowsEdits
      ? [
          {
            key: EDITED_KEY,
            header: 'Changed at (UTC)',
            kind: 'datetime' as const,
            cell: (submission: SubmissionRecord) =>
              submission.editedAt ? { datetime: submission.editedAt } : null,
          },
        ]
      : []),
  ];
}

export interface SheetPlan {
  /** Every column, in sheet order. Save it: the next plan starts from it. */
  columns: SheetColumn[];
  /** Columns new since the last plan, which the sheet needs added (and formatted). */
  added: SheetColumn[];
  /** Whether any header text differs from the last plan (a rename, or new columns). */
  headersChanged: boolean;
  /** One response as a row, a cell per column. */
  row: (submission: SubmissionRecord) => SheetCell[];
}

/**
 * The sheet's columns for `schema`, starting from the ones it already has (`previous`, or
 * `null` for a new sheet).
 */
export function planSheetColumns(
  previous: readonly SheetColumn[] | null,
  schema: FormSchema | null,
  sources: SheetSources,
): SheetPlan {
  const current = columnSources(schema, sources);
  const byKey = new Map(current.map((column) => [column.key, column]));
  const kept = (previous ?? []).map((column) => {
    const now = byKey.get(column.key);
    // A renamed question keeps its column; a removed one keeps its column and header.
    return now ? { key: column.key, header: now.header, kind: now.kind } : column;
  });
  const known = new Set(kept.map((column) => column.key));
  const added = current
    .filter((column) => !known.has(column.key))
    .map(({ key, header, kind }) => ({ key, header, kind }));
  const columns = [...kept, ...added];
  const headersChanged =
    added.length > 0 ||
    kept.some((column, index) => column.header !== (previous ?? [])[index]?.header);

  return {
    columns,
    added,
    headersChanged,
    row: (submission) => columns.map((column) => byKey.get(column.key)?.cell(submission) ?? null),
  };
}

/** The sheet's integration settings, stored with it. */
export const sheetConfigSchema = z.object({
  spreadsheetId: z.string().min(1).optional(),
  spreadsheetUrl: z.url().optional(),
  /** The tab responses go to, by id, so renaming the tab is fine. */
  sheetId: z.number().int().optional(),
  columns: z.array(sheetColumnSchema).default([]),
});
export type SheetConfig = z.infer<typeof sheetConfigSchema>;

/** Days between 1899-12-30 and the Unix epoch: how spreadsheets count dates. */
const SERIAL_EPOCH_DAYS = 25_569;
const MS_PER_DAY = 86_400_000;

/**
 * A cell as a value the Sheets API stores without interpreting it: text stays text (an
 * answer of "=HYPERLINK(…)" is never a formula), and dates become serial numbers that the
 * column's date format shows as dates.
 */
export function sheetValue(cell: SheetCell): string | number | null {
  if (cell === null || typeof cell === 'string' || typeof cell === 'number') return cell;
  const ms = 'date' in cell ? Date.parse(`${cell.date}T00:00:00Z`) : Date.parse(cell.datetime);
  if (Number.isNaN(ms)) return 'date' in cell ? cell.date : cell.datetime;
  return Math.round((ms / MS_PER_DAY + SERIAL_EPOCH_DAYS) * 1e8) / 1e8;
}

/** "A", "B", …, "Z", "AA": a column's letters from its 0-based index. */
export function columnLetters(index: number): string {
  let letters = '';
  let rest = index + 1;
  while (rest > 0) {
    const remainder = (rest - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    rest = Math.floor((rest - 1) / 26);
  }
  return letters;
}
