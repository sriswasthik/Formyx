import {
  answerableFields,
  isChoiceFieldType,
  storedAnswerSchema,
  submissionMetadataSchema,
  type FormSchema,
  type listSubmissionsQuerySchema,
  type SubmissionOrder,
  type SubmissionPage,
  type SubmissionRecord,
} from '@formyx/shared';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../lib/app-error.js';
import { escapeLikePattern } from '../lib/like-pattern.js';
import type { Database } from '../lib/prisma.js';
import { parsePublishedSchema } from './form-service.js';

/*
 * Timestamps are `timestamp` columns holding UTC, while the database session may run in any
 * time zone. Raw SQL therefore never lets Postgres convert implicitly: values go in as
 * `<iso>::timestamptz AT TIME ZONE 'UTC'` and come out formatted as ISO strings.
 */

export type ListSubmissionsQuery = z.output<typeof listSubmissionsQuerySchema>;

const cursorSchema = z.object({ createdAt: z.iso.datetime(), id: z.string().min(1).max(64) });
type Cursor = z.infer<typeof cursorSchema>;

/** Where a page ended: the last response's time and id, which together are unique. */
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeCursor(value: string): Cursor {
  let decoded: unknown = null;
  try {
    decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    // Not base64url JSON: refused below.
  }
  const result = cursorSchema.safeParse(decoded);
  if (!result.success) {
    throw new AppError(
      400,
      'BAD_REQUEST',
      'This page of responses is no longer valid. Start again from the first page.',
    );
  }
  return result.data;
}

const answersSchema = z.record(z.string(), storedAnswerSchema);
const NO_METADATA = { userAgent: null, referrer: null };

interface StoredRow {
  id: string;
  createdAt: string;
  completionTimeMs: number | null;
  answers: unknown;
  metadata: unknown;
}

function toRecord(row: StoredRow): SubmissionRecord {
  // Answers were validated when they were stored, so a mismatch here is a server bug.
  const answers = answersSchema.safeParse(row.answers);
  if (!answers.success) {
    throw new Error('Stored answers do not match their schema', { cause: answers.error });
  }
  const metadata = submissionMetadataSchema.safeParse(row.metadata);
  return {
    id: row.id,
    createdAt: row.createdAt,
    completionTimeMs: row.completionTimeMs,
    answers: answers.data,
    metadata: metadata.success ? metadata.data : NO_METADATA,
  };
}

const recordSelect = {
  id: true,
  createdAt: true,
  completionTimeMs: true,
  answers: true,
  metadata: true,
} satisfies Prisma.SubmissionSelect;

type SelectedRow = Prisma.SubmissionGetPayload<{ select: typeof recordSelect }>;

function fromSelected(row: SelectedRow): SubmissionRecord {
  return toRecord({ ...row, createdAt: row.createdAt.toISOString() });
}

/** The raw rows `list` reads. */
interface RawRow {
  id: string;
  created_at: string;
  completion_time_ms: number | null;
  answers: unknown;
  metadata: unknown;
}

const CREATED_AT_ISO = Prisma.raw(`to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);

/**
 * Responses where some answer contains `search`, ignoring case. Choices are stored as option
 * ids, so they match through their option labels: what people see, not the ids. Only the
 * questions of the current published form count, as only they are shown.
 */
function searchFilter(schema: FormSchema, search: string): Prisma.Sql {
  const pattern = `%${escapeLikePattern(search)}%`;
  const needle = search.toLocaleLowerCase();
  const fields = answerableFields(schema);
  const terms: Prisma.Sql[] = [];

  const textIds = fields.filter((field) => !isChoiceFieldType(field.type)).map(({ id }) => id);
  if (textIds.length > 0) {
    terms.push(Prisma.sql`EXISTS (
      SELECT 1 FROM jsonb_each_text(answers) AS answer
      WHERE answer.key IN (${Prisma.join(textIds)}) AND answer.value ILIKE ${pattern}
    )`);
  }

  for (const field of fields) {
    if (!('options' in field)) continue;
    const ids = field.options
      .filter((option) => option.label.toLocaleLowerCase().includes(needle))
      .map((option) => option.id);
    if (ids.length === 0) continue;
    terms.push(
      field.type === 'multi_choice'
        ? Prisma.sql`answers -> ${field.id} ?| ARRAY[${Prisma.join(ids)}]::text[]`
        : Prisma.sql`answers ->> ${field.id} IN (${Prisma.join(ids)})`,
    );
  }

  return terms.length > 0 ? Prisma.sql`(${Prisma.join(terms, ' OR ')})` : Prisma.sql`FALSE`;
}

/** Every response to a form in `order`, `size` at a time, without holding them all at once. */
export async function* submissionBatches(
  prisma: Database,
  formId: string,
  { order = 'newest', size = 500 }: { order?: SubmissionOrder; size?: number } = {},
): AsyncGenerator<SubmissionRecord[]> {
  const direction = order === 'newest' ? 'desc' : 'asc';
  const after = (createdAt: Date, id: string): Prisma.SubmissionWhereInput =>
    order === 'newest'
      ? { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] }
      : { OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: id } }] };
  let last: { createdAt: Date; id: string } | null = null;

  for (;;) {
    const rows: SelectedRow[] = await prisma.submission.findMany({
      where: { formId, ...(last && after(last.createdAt, last.id)) },
      orderBy: [{ createdAt: direction }, { id: direction }],
      take: size,
      select: recordSelect,
    });
    if (rows.length > 0) yield rows.map(fromSelected);

    const end = rows.at(-1);
    if (!end || rows.length < size) return;
    last = { createdAt: end.createdAt, id: end.id };
  }
}

export interface SubmissionService {
  /** One page of a form's responses, newest or oldest first, optionally filtered. */
  list(formId: string, query: ListSubmissionsQuery): Promise<SubmissionPage>;
  /** One response; 404 unless it belongs to the form. */
  get(formId: string, submissionId: string): Promise<SubmissionRecord>;
  /** Deletes those of `ids` that belong to the form, and returns their ids. */
  remove(formId: string, ids: readonly string[]): Promise<string[]>;
  /** The title respondents see and the published questions: what an export is made of. */
  published(formId: string): Promise<{ title: string; schema: FormSchema | null }>;
}

export function createSubmissionService(prisma: Database): SubmissionService {
  async function published(formId: string) {
    const form = await prisma.form.findUnique({
      where: { id: formId },
      select: { title: true, publishedTitle: true, publishedSchema: true },
    });
    if (!form) throw new AppError(404, 'NOT_FOUND', 'Form not found');
    return {
      title: form.publishedTitle ?? form.title,
      schema: parsePublishedSchema(form.publishedSchema),
    };
  }

  return {
    async list(formId, { cursor, limit, order, search, answered }) {
      const filters = [Prisma.sql`form_id = ${formId}`];
      if (answered) filters.push(Prisma.sql`answers ? ${answered}`);
      if (search) {
        const { schema } = await published(formId);
        filters.push(schema ? searchFilter(schema, search) : Prisma.sql`FALSE`);
      }
      const where = Prisma.join(filters, ' AND ');

      const newest = order === 'newest';
      const direction = newest ? Prisma.sql`DESC` : Prisma.sql`ASC`;
      const after = cursor ? decodeCursor(cursor) : null;
      const page = after
        ? Prisma.sql`AND (created_at, id) ${newest ? Prisma.sql`<` : Prisma.sql`>`}
            (${after.createdAt}::timestamptz AT TIME ZONE 'UTC', ${after.id})`
        : Prisma.empty;

      // One row more than asked for says whether another page follows.
      const [rows, counted] = await Promise.all([
        prisma.$queryRaw<RawRow[]>`
          SELECT id, ${CREATED_AT_ISO} AS created_at, completion_time_ms, answers, metadata
          FROM submissions
          WHERE ${where} ${page}
          ORDER BY created_at ${direction}, id ${direction}
          LIMIT ${limit + 1}
        `,
        prisma.$queryRaw<{ total: number }[]>`
          SELECT count(*)::int AS total FROM submissions WHERE ${where}
        `,
      ]);

      const submissions = rows.slice(0, limit).map((row) =>
        toRecord({
          id: row.id,
          createdAt: row.created_at,
          completionTimeMs: row.completion_time_ms,
          answers: row.answers,
          metadata: row.metadata,
        }),
      );
      const last = submissions.at(-1);
      return {
        submissions,
        nextCursor:
          rows.length > limit && last
            ? encodeCursor({ createdAt: last.createdAt, id: last.id })
            : null,
        total: counted[0]?.total ?? 0,
      };
    },

    async get(formId, submissionId) {
      const row = await prisma.submission.findFirst({
        where: { id: submissionId, formId },
        select: recordSelect,
      });
      if (!row) throw new AppError(404, 'NOT_FOUND', 'Response not found');
      return fromSelected(row);
    },

    async remove(formId, ids) {
      if (ids.length === 0) return [];
      // Scoped to the form: ids of another form's responses are ignored, never deleted.
      const deleted = await prisma.$queryRaw<{ id: string }[]>`
        DELETE FROM submissions
        WHERE form_id = ${formId} AND id IN (${Prisma.join([...new Set(ids)])})
        RETURNING id
      `;
      return deleted.map(({ id }) => id);
    },

    published,
  };
}
