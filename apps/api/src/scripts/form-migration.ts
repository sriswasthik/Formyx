import { isSameJson, migrateFormSchema, upgradeStoredTheme } from '@formyx/shared';
import type { Database } from '../lib/prisma.js';

/*
 * Rewrites stored forms in the current format: question schemas to FORM_SCHEMA_VERSION and
 * themes to v2. The API upgrades old data as it reads it, so this is tidying rather than a
 * prerequisite: it can run any time after a deploy, and again (it only touches rows that
 * need it). See `migrate-forms.ts` for running it.
 */

/** The JSON columns that hold something with a version. */
interface StoredForm {
  id: string;
  draftSchema: unknown;
  publishedSchema: unknown;
  theme: unknown;
  publishedTheme: unknown;
}

type Column = Exclude<keyof StoredForm, 'id'>;

export interface FormMigrationFailure {
  formId: string;
  column: Column;
  message: string;
}

export interface FormMigrationReport {
  /** Forms looked at. */
  checked: number;
  /** Forms rewritten (in a dry run: that would be). */
  updated: number;
  /** Forms changed by someone else while this ran; they are left for the next run. */
  skipped: number;
  /** Forms with a column that could not be read; left as they are. */
  failed: FormMigrationFailure[];
}

export interface FormMigrationOptions {
  /** Report what would change without writing. */
  dryRun?: boolean;
  /** Forms read per query. */
  batchSize?: number;
}

const UPGRADES: Record<Column, (value: unknown) => unknown> = {
  draftSchema: migrateFormSchema,
  publishedSchema: (value) => (value === null ? null : migrateFormSchema(value)),
  theme: upgradeStoredTheme,
  publishedTheme: (value) => (value === null ? null : upgradeStoredTheme(value)),
};

const COLUMNS = Object.keys(UPGRADES) as Column[];

/** The form in the current format, or why a column could not be upgraded. */
export function upgradeForm(
  form: StoredForm,
): { upgraded: StoredForm } | { failure: FormMigrationFailure } {
  const upgraded: StoredForm = { ...form };
  for (const column of COLUMNS) {
    try {
      upgraded[column] = UPGRADES[column](form[column]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { failure: { formId: form.id, column, message } };
    }
  }
  return { upgraded };
}

const json = (value: unknown) => (value === null ? null : JSON.stringify(value));

/**
 * Writes `upgraded` only while the row still holds `original`, so an editor saving at the same
 * moment is never overwritten. Raw SQL leaves `updated_at` and `version` alone: tidying the
 * format is not an edit. Returns whether the row was written.
 */
export async function writeIfUnchanged(
  prisma: Database,
  original: StoredForm,
  upgraded: StoredForm,
): Promise<boolean> {
  const count = await prisma.$executeRaw`
    UPDATE "forms" SET
      "draft_schema" = ${json(upgraded.draftSchema)}::jsonb,
      "published_schema" = ${json(upgraded.publishedSchema)}::jsonb,
      "theme" = ${json(upgraded.theme)}::jsonb,
      "published_theme" = ${json(upgraded.publishedTheme)}::jsonb
    WHERE "id" = ${original.id}
      AND "draft_schema" = ${json(original.draftSchema)}::jsonb
      AND "published_schema" IS NOT DISTINCT FROM ${json(original.publishedSchema)}::jsonb
      AND "theme" = ${json(original.theme)}::jsonb
      AND "published_theme" IS NOT DISTINCT FROM ${json(original.publishedTheme)}::jsonb
  `;
  return count === 1;
}

/** Upgrades every stored form, a batch at a time. */
export async function migrateForms(
  prisma: Database,
  { dryRun = false, batchSize = 200 }: FormMigrationOptions = {},
): Promise<FormMigrationReport> {
  const report: FormMigrationReport = { checked: 0, updated: 0, skipped: 0, failed: [] };
  let cursor: string | undefined;

  for (;;) {
    const forms = await prisma.form.findMany({
      select: {
        id: true,
        draftSchema: true,
        publishedSchema: true,
        theme: true,
        publishedTheme: true,
      },
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor !== undefined && { cursor: { id: cursor }, skip: 1 }),
    });
    if (forms.length === 0) return report;
    cursor = forms.at(-1)?.id;

    for (const form of forms) {
      report.checked++;
      const result = upgradeForm(form);
      if ('failure' in result) {
        report.failed.push(result.failure);
        continue;
      }
      if (COLUMNS.every((column) => isSameJson(form[column], result.upgraded[column]))) continue;

      if (dryRun || (await writeIfUnchanged(prisma, form, result.upgraded))) report.updated++;
      else report.skipped++;
    }
  }
}
