import {
  buildSubmissionValidator,
  formThemeSchema,
  responseLimitReached,
  sanitizeAnswers,
  toAnswerIssues,
  type ClosedFormDetails,
  type FormSchema,
  type PublicFormResponse,
  type SubmissionInput,
  type SubmissionRecord,
} from '@formyx/shared';
import type { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../lib/app-error.js';
import type { Database } from '../lib/prisma.js';
import type { UploadChecks } from './upload-checks.js';
import { parsePublishedSchema } from './form-service.js';

const USER_AGENT_MAX_LENGTH = 512;

const publicSelect = {
  id: true,
  slug: true,
  title: true,
  status: true,
  publishedSchema: true,
  publishedTitle: true,
  theme: true,
  publishedTheme: true,
  _count: { select: { submissions: true } },
} satisfies Prisma.FormSelect;

type PublicRecord = Prisma.FormGetPayload<{ select: typeof publicSelect }>;

/** A form someone can reach through its public link: it has been published at least once. */
interface LiveForm {
  id: string;
  slug: string;
  title: string;
  schema: FormSchema;
  record: PublicRecord;
}

/** Details a client needs to explain a submission, such as the browser that sent it. */
export interface SubmissionContext {
  userAgent: string | undefined;
}

export interface PublicFormService {
  /** The published form, or that it is closed; 404 if it was never published. */
  get(slug: string): Promise<PublicFormResponse>;
  /** The id and published questions of a form taking responses; 404 or 410 otherwise. */
  openForm(slug: string): Promise<{ id: string; schema: FormSchema }>;
  /** Counts a visit to an open form. */
  recordView(slug: string): Promise<void>;
  /**
   * Stores a response after checking it against the published schema. Answers to hidden or
   * unknown questions are dropped. The response that reaches the limit closes the form.
   * Resolves once the response is committed.
   */
  submit(
    slug: string,
    input: SubmissionInput,
    context: SubmissionContext,
  ): Promise<SavedSubmission>;
}

export interface SavedSubmission {
  formId: string;
  submission: SubmissionRecord;
}

function notFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'Form not found');
}

function closed(title: string): AppError {
  const details: ClosedFormDetails = { title };
  return new AppError(410, 'FORM_CLOSED', 'This form is no longer accepting responses.', {
    details,
  });
}

function toLiveForm(record: PublicRecord | null): LiveForm {
  const schema = record ? parsePublishedSchema(record.publishedSchema) : null;
  if (!record || !schema) throw notFound();
  return {
    id: record.id,
    slug: record.slug,
    title: record.publishedTitle ?? record.title,
    schema,
    record,
  };
}

/** Whether the form is published and within its response limit and closing time. */
function isOpen(form: LiveForm, now = new Date()): boolean {
  return (
    form.record.status === 'PUBLISHED' &&
    responseLimitReached(form.schema.settings, form.record._count.submissions, now) === null
  );
}

/** Throws 410 unless the form takes responses. */
function assertOpen(form: LiveForm): void {
  if (!isOpen(form)) throw closed(form.title);
}

export function createPublicFormService(
  prisma: Database,
  uploads: Pick<UploadChecks, 'verifyAnswers'>,
): PublicFormService {
  async function find(slug: string): Promise<LiveForm> {
    return toLiveForm(await prisma.form.findUnique({ where: { slug }, select: publicSelect }));
  }

  return {
    async get(slug) {
      const form = await find(slug);
      if (!isOpen(form)) return { status: 'closed', slug: form.slug, title: form.title };

      // Respondents see the theme as published; forms published before themes were
      // snapshotted fall back to the current one.
      const theme = formThemeSchema.safeParse(form.record.publishedTheme ?? form.record.theme);
      if (!theme.success) {
        throw new Error('Stored theme does not match its schema', { cause: theme.error });
      }
      return {
        status: 'open',
        slug: form.slug,
        title: form.title,
        schema: form.schema,
        theme: theme.data,
      };
    },

    async openForm(slug) {
      const form = await find(slug);
      assertOpen(form);
      return { id: form.id, schema: form.schema };
    },

    async recordView(slug) {
      const form = await find(slug);
      assertOpen(form);
      await prisma.formView.create({ data: { formId: form.id } });
    },

    async submit(slug, input, context) {
      // Uploaded files are checked with storage first, outside the transaction, so no network
      // call ever holds the form's lock.
      const live = await find(slug);
      assertOpen(live);
      const checked = await uploads.verifyAnswers(live, input.answers);

      return prisma.$transaction(async (tx) => {
        // Lock the form so concurrent submissions queue up: the response limit is checked
        // and the response stored as one step, so the limit can never be overshot.
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM forms WHERE slug = ${slug} FOR UPDATE
        `;
        if (locked.length === 0) throw notFound();

        const form = toLiveForm(
          await tx.form.findUnique({ where: { slug }, select: publicSelect }),
        );
        assertOpen(form);

        const answers = sanitizeAnswers(form.schema, checked);
        const result = buildSubmissionValidator(form.schema, answers).safeParse(answers);
        if (!result.success) throw invalidAnswers(result.error);

        const metadata = {
          userAgent: context.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
          referrer: input.referrer || null,
        };
        const created = await tx.submission.create({
          data: {
            formId: form.id,
            answers: result.data,
            completionTimeMs: input.completionTimeMs ?? null,
            metadata,
          },
          select: { id: true, createdAt: true, completionTimeMs: true },
        });

        const count = form.record._count.submissions + 1;
        if (responseLimitReached(form.schema.settings, count) === 'response_limit') {
          await tx.form.update({ where: { id: form.id }, data: { status: 'CLOSED' } });
        }
        return {
          formId: form.id,
          submission: {
            id: created.id,
            createdAt: created.createdAt.toISOString(),
            completionTimeMs: created.completionTimeMs,
            answers: result.data,
            metadata,
          },
        };
      });
    },
  };
}

function invalidAnswers(error: z.ZodError): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Some answers need your attention.', {
    details: toAnswerIssues(error),
  });
}
