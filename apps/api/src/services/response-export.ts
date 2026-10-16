import {
  csvAnswerColumns,
  csvOutcomeColumns,
  readLiveSettings,
  type Field,
  type FormSchema,
  type SubmissionRecord,
} from '@formyx/shared';
import { CSV_BOM, toCsvRow, type CsvValue } from '../lib/csv.js';
import type { Database } from '../lib/prisma.js';
import { submissionBatches } from './submission-service.js';

/*
 * A form's responses as a table, for the CSV and Excel exports and for account data exports.
 */

const EXPORT_BATCH_SIZE = 500;

export interface ExportTable {
  header: string[];
  /** Rows a batch at a time, newest first. */
  batches: AsyncGenerator<CsvValue[][]>;
}

/** Columns only some forms have: those that ask for an email address, or allow changes. */
export interface ExtraColumns {
  respondentEmail: boolean;
  editedAt: boolean;
}

/** The extra columns a form's export has, from its current access settings. */
export async function extraColumns(prisma: Database, formId: string): Promise<ExtraColumns> {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { liveSettings: true },
  });
  const { access } = readLiveSettings(form?.liveSettings);
  return {
    respondentEmail: access.requireEmail || access.oneResponsePer === 'email',
    editedAt: access.allowEdits,
  };
}

/** Every response as rows of cells: what both the CSV and the Excel export write. */
export function exportTable(
  prisma: Database,
  formId: string,
  { schema, retiredFields }: { schema: FormSchema | null; retiredFields: Field[] },
  extra: ExtraColumns,
): ExportTable {
  // A column per answer, or several for matrices, addresses and date ranges; deleted
  // questions' answers last, marked as deleted.
  const columns = schema ? csvAnswerColumns(schema, retiredFields) : [];
  // Scores, values and the end screen, as the server worked them out.
  const outcomeColumns = schema ? csvOutcomeColumns(schema) : [];
  const header = [
    'Response ID',
    'Submitted at (UTC)',
    ...(extra.respondentEmail ? ['Respondent email'] : []),
    ...columns.map((column) => column.header),
    ...outcomeColumns.map((column) => column.header),
    'Time to complete (seconds)',
    ...(extra.editedAt ? ['Changed at (UTC)'] : []),
  ];
  const row = (submission: SubmissionRecord): CsvValue[] => [
    submission.id,
    submission.createdAt,
    ...(extra.respondentEmail ? [submission.respondentEmail ?? null] : []),
    ...columns.map((column) => column.cell(submission.answers)),
    ...outcomeColumns.map((column) => column.cell(submission.outcome)),
    submission.completionTimeMs === null ? null : Math.round(submission.completionTimeMs / 1000),
    ...(extra.editedAt ? [submission.editedAt ?? null] : []),
  ];
  async function* batches(): AsyncGenerator<CsvValue[][]> {
    for await (const batch of submissionBatches(prisma, formId, { size: EXPORT_BATCH_SIZE })) {
      yield batch.map(row);
    }
  }
  return { header, batches: batches() };
}

/** The CSV export, a chunk per batch of responses: a header row, then newest first. */
export async function* csvChunks(table: ExportTable): AsyncGenerator<string> {
  yield CSV_BOM + toCsvRow(table.header);
  for await (const rows of table.batches) yield rows.map(toCsvRow).join('');
}
