import { createHash, randomBytes } from 'node:crypto';
import {
  buildSubmissionValidator,
  computeOutcome,
  formPages,
  isShownQuestionType,
  responseLimitReached,
  sanitizeAnswers,
  toAnswerIssues,
  toPublicSchema,
  type Answers,
  type ClosedFormDetails,
  type FormSchema,
  type ProgressInput,
  type PublicFormResponse,
  type ResponseOutcome,
  type StoredOutcome,
  type SubmissionInput,
  type SubmissionOutcome,
  type SubmissionRecord,
} from '@formyx/shared';
import type { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../lib/app-error.js';
import type { Database } from '../lib/prisma.js';
import type { UploadChecks } from './upload-checks.js';
import { parsePublishedSchema, parsePublishedTheme } from './form-service.js';

const USER_AGENT_MAX_LENGTH = 512;

type Transaction = Parameters<Parameters<Database['$transaction']>[0]>[0];

/** Where pages and fields sit in the form, to tell which of two is further on. */
function formOrder(schema: FormSchema) {
  return {
    pages: new Map(formPages(schema.fields).map((page) => [page.key, page.index])),
    fields: new Map(schema.fields.map((field, index) => [field.id, index])),
  };
}

/**
 * `next` when it comes after `current` in `order`, otherwise `undefined` (nothing to
 * change). Ids no longer in the form never count as further.
 */
function further(
  order: ReadonlyMap<string, number>,
  next: string | undefined,
  current: string | null,
): string | undefined {
  if (next === undefined) return undefined;
  const nextIndex = order.get(next);
  if (nextIndex === undefined) return undefined;
  const currentIndex = current === null ? -1 : (order.get(current) ?? -1);
  return nextIndex > currentIndex ? next : undefined;
}

/**
 * Marks a visit finished, moving its progress on to the last page of the route the server
 * worked out and the last question answered, in case the browser's last reports were lost.
 * Drop-off counts each visit by the furthest page it reached.
 */
async function completeView(
  tx: Transaction,
  schema: FormSchema,
  formId: string,
  token: string,
  finished: { completedAt: Date; route: readonly string[]; answers: Answers },
): Promise<void> {
  const view = await tx.formView.findUnique({
    where: { token },
    select: { id: true, formId: true, furthestPage: true, furthestField: true, completedAt: true },
  });
  if (view?.formId !== formId || view.completedAt) return;
  const order = formOrder(schema);
  const lastAnswered = schema.fields.findLast(
    (field) => isShownQuestionType(field.type) && finished.answers[field.id] !== undefined,
  );
  const furthestPage = further(order.pages, finished.route.at(-1), view.furthestPage);
  const furthestField = further(order.fields, lastAnswered?.id, view.furthestField);
  await tx.formView.update({
    where: { id: view.id },
    data: {
      completedAt: finished.completedAt,
      ...(furthestPage !== undefined && { furthestPage }),
      ...(furthestField !== undefined && { furthestField }),
    },
  });
}

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
  /** The id, title and published questions of a form taking responses; 404 or 410 otherwise. */
  openForm(slug: string): Promise<{ id: string; title: string; schema: FormSchema }>;
  /** Counts a visit to an open form; returns the visit's token for progress reports. */
  recordView(slug: string): Promise<{ token: string }>;
  /**
   * Notes how far a visit got: the page shown and the last question answered, each only
   * ever moving forward in the published form. Unknown tokens, pages and questions are
   * ignored, as is anything after the visit ended in a response.
   */
  recordProgress(slug: string, input: ProgressInput): Promise<void>;
  /**
   * The outcome `answers` would get, without storing anything: what a bot caught by the
   * honeypot is shown, so it cannot tell.
   */
  previewOutcome(slug: string, answers: Answers): Promise<SubmissionOutcome>;
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
  /** For the respondent: the end screen, values and quiz mark (with the review if shown). */
  outcome: SubmissionOutcome;
}

/** What is stored: the route is left out, and so is the quiz review. */
export function toStoredOutcome(outcome: ResponseOutcome): StoredOutcome {
  const { quiz } = outcome;
  return {
    endScreenId: outcome.endScreenId,
    values: outcome.values,
    quiz: quiz && {
      score: quiz.score,
      max: quiz.max,
      percent: quiz.percent,
      passed: quiz.passed,
    },
  };
}

/** What the respondent is told: the review only when the form reveals the answers. */
export function toRespondentOutcome(
  schema: FormSchema,
  outcome: ResponseOutcome,
): SubmissionOutcome {
  const stored = toStoredOutcome(outcome);
  const reveal = schema.logic.quiz?.revealAnswers === true;
  return {
    ...stored,
    quiz: stored.quiz &&
      outcome.quiz && {
        ...stored.quiz,
        ...(reveal && { review: outcome.quiz.review }),
      },
  };
}

/** A random token for a visit: 24 bytes, base64url. */
function createViewToken(): string {
  return randomBytes(24).toString('base64url');
}

/** SHA-256, hex: how draft tokens are stored. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
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
      const theme = parsePublishedTheme(form.record.publishedTheme ?? form.record.theme);
      if (!theme) throw new Error('A published form has no theme');
      // The quiz's right answers stay on the server, which marks it.
      return {
        status: 'open',
        slug: form.slug,
        title: form.title,
        schema: toPublicSchema(form.schema),
        theme,
      };
    },

    async openForm(slug) {
      const form = await find(slug);
      assertOpen(form);
      return { id: form.id, title: form.title, schema: form.schema };
    },

    async recordView(slug) {
      const form = await find(slug);
      assertOpen(form);
      const token = createViewToken();
      await prisma.formView.create({ data: { formId: form.id, token } });
      return { token };
    },

    async recordProgress(slug, input) {
      const form = await find(slug);
      const view = await prisma.formView.findUnique({
        where: { token: input.token },
        select: {
          id: true,
          formId: true,
          furthestPage: true,
          furthestField: true,
          completedAt: true,
        },
      });
      if (view?.formId !== form.id || view.completedAt) return;

      const order = formOrder(form.schema);
      const furthestPage = further(order.pages, input.pageKey, view.furthestPage);
      const furthestField = further(order.fields, input.fieldId, view.furthestField);
      if (furthestPage === undefined && furthestField === undefined) return;
      await prisma.formView.update({
        where: { id: view.id },
        data: {
          ...(furthestPage !== undefined && { furthestPage }),
          ...(furthestField !== undefined && { furthestField }),
        },
      });
    },

    async previewOutcome(slug, answers) {
      const form = await find(slug);
      assertOpen(form);
      return toRespondentOutcome(
        form.schema,
        computeOutcome(form.schema, sanitizeAnswers(form.schema, answers)),
      );
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
        // Worked out here from the answers alone: totals from the browser are never trusted.
        const outcome = computeOutcome(form.schema, result.data);
        const stored = toStoredOutcome(outcome);

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
            outcome: stored,
          },
          select: { id: true, createdAt: true, completionTimeMs: true },
        });
        if (input.viewToken) {
          await completeView(tx, form.schema, form.id, input.viewToken, {
            completedAt: created.createdAt,
            route: outcome.pages,
            answers: result.data,
          });
        }
        if (input.resumeToken) {
          // The draft is finished; its link stops working.
          await tx.formDraft.deleteMany({
            where: { formId: form.id, tokenHash: hashToken(input.resumeToken) },
          });
        }

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
            outcome: stored,
          },
          outcome: toRespondentOutcome(form.schema, outcome),
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
