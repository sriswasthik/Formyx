import {
  planSheetColumns,
  RESPONSE_ID_KEY,
  sheetConfigSchema,
  sheetValue,
  type FormSchema,
  type SheetConfig,
  type SheetSources,
  type SubmissionRecord,
} from '@formyx/shared';
import type { Database } from '../lib/prisma.js';
import { submissionBatches } from '../services/submission-service.js';
import { GoogleApiError, type SheetsClient, type SpreadsheetTab } from './google.js';

/*
 * Keeping a Google Sheet in step with a form. Every write first reads the sheet's first
 * column (response ids), so a retried job never adds a row twice and a changed response
 * updates its own row, wherever sorting has moved it.
 */

/** Rows per append request. */
const APPEND_BATCH = 500;

export interface SheetForm {
  id: string;
  title: string;
  schema: FormSchema | null;
  sources: SheetSources;
}

interface Prepared {
  config: SheetConfig & { spreadsheetId: string; sheetId: number };
  sheet: SpreadsheetTab;
  row: (submission: SubmissionRecord) => (string | number | null)[];
}

/** The sheet's tab is gone, or Formyx can no longer open the spreadsheet. */
export const isSheetMissing = (error: unknown) =>
  error instanceof GoogleApiError && (error.status === 404 || error.status === 403);

/**
 * Makes sure the sheet exists and its header matches the form: a new spreadsheet the first
 * time (or when the old one is gone and `replaceMissing`), new columns at the end, renamed
 * headers. Saves what changed in the integration's config.
 */
export async function prepareSheet({
  prisma,
  client,
  integrationId,
  storedConfig,
  form,
  replaceMissing,
}: {
  prisma: Database;
  client: SheetsClient;
  integrationId: string;
  storedConfig: unknown;
  form: SheetForm;
  replaceMissing: boolean;
}): Promise<Prepared> {
  let config = sheetConfigSchema.parse(storedConfig ?? {});
  let sheet: SpreadsheetTab | null = null;

  if (config.spreadsheetId !== undefined && config.sheetId !== undefined) {
    try {
      sheet = await client.tab(config.spreadsheetId, config.sheetId);
    } catch (error) {
      if (!replaceMissing || !isSheetMissing(error)) throw error;
      // Deleted (or no longer shared with Formyx): start a new one below.
      config = { columns: [] };
    }
  }
  if (!sheet) {
    const created = await client.create(`${form.title.trim() || 'Untitled form'} responses`);
    config = {
      spreadsheetId: created.spreadsheetId,
      spreadsheetUrl: created.spreadsheetUrl,
      sheetId: created.sheetId,
      columns: [],
    };
    sheet = await client.tab(created.spreadsheetId, created.sheetId);
  }

  const previous = config.columns.length > 0 ? config.columns : null;
  const plan = planSheetColumns(previous, form.schema, form.sources);
  const { spreadsheetId, sheetId } = config;
  if (spreadsheetId === undefined || sheetId === undefined) {
    throw new GoogleApiError(500, 'The sheet has no id');
  }
  if (previous === null || plan.headersChanged) {
    // Formats only the new columns, so people's own formatting of the others stays.
    await client.writeHeader(spreadsheetId, sheet, plan.columns, previous?.length ?? 0);
  }
  const next = { ...config, spreadsheetId, sheetId, columns: plan.columns };
  await prisma.integration.update({ where: { id: integrationId }, data: { config: next } });
  return {
    config: next,
    sheet,
    row: (submission) => plan.row(submission).map(sheetValue),
  };
}

/** Rows (1-based) by response id, from the sheet's first column. */
async function rowsById(client: SheetsClient, prepared: Prepared): Promise<Map<string, number>> {
  const ids = await client.responseIds(prepared.config.spreadsheetId, prepared.sheet);
  const rows = new Map<string, number>();
  // Row 1 is the header.
  ids.forEach((id, index) => {
    if (index > 0 && id && !rows.has(id)) rows.set(id, index + 1);
  });
  return rows;
}

/**
 * Adds every response the sheet doesn't have yet, oldest first; with `fresh`, empties the
 * sheet below the header first (re-syncing everything). Returns how many rows were added.
 */
export async function catchUpSheet({
  prisma,
  client,
  prepared,
  formId,
  fresh,
}: {
  prisma: Database;
  client: SheetsClient;
  prepared: Prepared;
  formId: string;
  fresh: boolean;
}): Promise<number> {
  if (fresh) await client.clearRows(prepared.config.spreadsheetId, prepared.sheet);
  const present = fresh ? new Map<string, number>() : await rowsById(client, prepared);
  let added = 0;
  for await (const batch of submissionBatches(prisma, formId, {
    order: 'oldest',
    size: APPEND_BATCH,
  })) {
    const rows = batch.filter((submission) => !present.has(submission.id)).map(prepared.row);
    await client.append(prepared.config.spreadsheetId, prepared.sheet, rows);
    added += rows.length;
  }
  return added;
}

/** Writes one response: its row if the sheet has one, else a new row at the bottom. */
export async function writeResponse({
  client,
  prepared,
  submission,
}: {
  client: SheetsClient;
  prepared: Prepared;
  submission: SubmissionRecord;
}): Promise<'added' | 'updated'> {
  const row = prepared.row(submission);
  const existing = (await rowsById(client, prepared)).get(submission.id);
  if (existing !== undefined) {
    await client.updateRow(prepared.config.spreadsheetId, prepared.sheet, existing, row);
    return 'updated';
  }
  await client.append(prepared.config.spreadsheetId, prepared.sheet, [row]);
  return 'added';
}

export { RESPONSE_ID_KEY };
