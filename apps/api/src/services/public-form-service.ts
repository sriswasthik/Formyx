import {
  buildSubmissionValidator,
  formThemeSchema,
  responseLimitReached,
  sanitizeAnswers,
  toAnswerIssues,
  type ClosedFormDetails,
  type FormSchema,
  type PublicForm,
  type SubmissionInput,
} from '@formyx/shared';
import type { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../lib/app-error.js';
import type { Database } from '../lib/prisma.js';
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
  /** The published form, or 404 if there is none, or 410 if it takes no more responses. */
  get(slug: string): Promise<PublicForm>;
  /** Counts a visit to an open form. */
  recordView(slug: string): Promise<void>;
  /**
   * Stores a response after checking it against the published schema. Answers to hidden or
   * unknown questions are dropped. The response that reaches the limit closes the form.
   */
  submit(slug: string, input: SubmissionInput, context: SubmissionContext): Promise<{ id: string }>;
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

/** Throws 410 unless the form is published and within its response limit and closing date. */
function assertOpen(form: LiveForm, now = new Date()): void {
  const open =
    form.record.status === 'PUBLISHED' &&
    responseLimitReached(form.schema.settings, form.record._count.submissions, now) === null;
  if (!open) throw closed(form.title);
}

export function createPublicFormService(prisma: Database): PublicFormService {
  async function findOpen(slug: string): Promise<LiveForm> {
    const form = toLiveForm(
      await prisma.form.findUnique({ where: { slug }, select: publicSelect }),
    );
    assertOpen(form);
    return form;
  }

  return {
    async get(slug) {
      const form = await findOpen(slug);
      const theme = formThemeSchema.safeParse(form.record.theme);
      if (!theme.success) {
        throw new Error('Stored theme does not match its schema', { cause: theme.error });
      }
      return { slug: form.slug, title: form.title, schema: form.schema, theme: theme.data };
    },

    async recordView(slug) {
      const form = await findOpen(slug);
      await prisma.formView.create({ data: { formId: form.id } });
    },

    submit(slug, input, context) {
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

        const answers = sanitizeAnswers(form.schema, input.answers);
        const result = buildSubmissionValidator(form.schema, answers).safeParse(answers);
        if (!result.success) throw invalidAnswers(result.error);

        const submission = await tx.submission.create({
          data: {
            formId: form.id,
            answers: result.data,
            completionTimeMs: input.completionTimeMs ?? null,
            metadata: {
              userAgent: context.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
              referrer: input.referrer || null,
            },
          },
          select: { id: true },
        });

        const count = form.record._count.submissions + 1;
        if (responseLimitReached(form.schema.settings, count) === 'response_limit') {
          await tx.form.update({ where: { id: form.id }, data: { status: 'CLOSED' } });
        }
        return submission;
      });
    },
  };
}

function invalidAnswers(error: z.ZodError): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Some answers need your attention.', {
    details: toAnswerIssues(error),
  });
}
