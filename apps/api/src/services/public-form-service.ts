import { createHash, randomBytes, randomInt } from 'node:crypto';
import {
  buildSubmissionValidator,
  CODE_ATTEMPTS,
  computeOutcome,
  fillsForm,
  FORM_MESSAGES,
  formAvailability,
  formPages,
  isShownQuestionType,
  normalizeEmail,
  readLiveSettings,
  readWorkspacePreferences,
  respondentEmailStep,
  sanitizeAnswers,
  storedAnswerSchema,
  submissionMetadataSchema,
  toAnswerIssues,
  toPublicSchema,
  VERIFICATION_CODE_LENGTH,
  VERIFICATION_CODE_MINUTES,
  type Answers,
  type ClosedFormDetails,
  type EditLoadResponse,
  type FormSchema,
  type LiveSettings,
  type ProgressInput,
  type PublicFormResponse,
  type PublicLocale,
  type ResponseOutcome,
  type StoredOutcome,
  type SubmissionInput,
  type SubmissionOutcome,
  type SubmissionRecord,
  type SubmittedAnswers,
} from '@formyx/shared';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../lib/app-error.js';
import {
  isUnlockTokenValid,
  signEmailToken,
  signUnlockToken,
  verifiedEmail,
} from '../lib/form-access-token.js';
import type { Mailer } from '../lib/mailer.js';
import type { PasswordHasher } from '../lib/password.js';
import type { Database } from '../lib/prisma.js';
import { renderCodeEmail } from '../notifications/code-email.js';
import { parsePublishedSchema, parsePublishedTheme } from './form-service.js';
import type { UploadChecks } from './upload-checks.js';

const USER_AGENT_MAX_LENGTH = 512;
const storedAnswersSchema = z.record(z.string(), storedAnswerSchema);
const NO_METADATA = { userAgent: null, referrer: null };

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
  liveSettings: true,
  passwordHash: true,
  passwordVersion: true,
  workspace: { select: { preferences: true } },
  _count: { select: { submissions: true } },
} satisfies Prisma.FormSelect;

type PublicRecord = Prisma.FormGetPayload<{ select: typeof publicSelect }>;

/** A form someone can reach through its public link: it has been published at least once. */
export interface LiveForm {
  id: string;
  slug: string;
  title: string;
  schema: FormSchema;
  settings: LiveSettings;
  record: PublicRecord;
}

/** Details a client needs to explain a submission, such as the browser that sent it. */
export interface SubmissionContext {
  userAgent: string | undefined;
  /** The token from unlocking a form with a password (the `X-Form-Access` header). */
  accessToken: string | undefined;
}

export interface PublicFormService {
  /**
   * The published form; or that it is closed, not open yet or locked by a password. 404 if
   * it was never published. A form's old address finds it too; the reply has its current one.
   */
  get(slug: string, accessToken: string | undefined): Promise<PublicFormResponse>;
  /**
   * The id, title and published questions of a form taking responses that this browser may
   * open; 404, 410, 403 FORM_NOT_OPEN or 401 FORM_LOCKED otherwise.
   */
  openForm(slug: string, accessToken: string | undefined): Promise<LiveForm>;
  /** A token that opens a password-protected form; 401 WRONG_CODE for a wrong password. */
  unlock(slug: string, password: string): Promise<{ token: string }>;
  /** Emails a code confirming `email`, for a form taking one response per person. */
  startVerification(slug: string, email: string, accessToken: string | undefined): Promise<void>;
  /** A token proving `email` was confirmed with the code sent to it. */
  checkVerification(
    slug: string,
    input: { email: string; code: string },
    accessToken: string | undefined,
  ): Promise<{ token: string }>;
  /** Counts a visit to an open form; returns the visit's token for progress reports. */
  recordView(slug: string, accessToken: string | undefined): Promise<{ token: string }>;
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
  previewOutcome(
    slug: string,
    answers: Answers,
    accessToken: string | undefined,
  ): Promise<SubmissionOutcome>;
  /** The answers behind a private edit link, while the form is open and allows edits. */
  loadEdit(slug: string, token: string, accessToken: string | undefined): Promise<EditLoadResponse>;
  /**
   * Stores a response after checking it against the published schema and the form's access
   * settings, or changes the one an edit link belongs to. Answers to hidden or unknown
   * questions are dropped. The response that reaches the limit closes the form. Resolves
   * once the response is committed.
   */
  submit(
    slug: string,
    input: SubmissionInput,
    context: SubmissionContext,
  ): Promise<SavedSubmission>;
}

export interface SavedSubmission {
  formId: string;
  formTitle: string;
  schema: FormSchema;
  settings: LiveSettings;
  submission: SubmissionRecord;
  /** For the respondent: the end screen, values and quiz mark (with the review if shown). */
  outcome: SubmissionOutcome;
  /** The private link's token, when the form allows changing responses. */
  editToken: string | null;
  /** Whether this changed an earlier response rather than adding one. */
  edited: boolean;
  respondentEmail: string | null;
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

/** SHA-256, hex: how draft, edit and email tokens are stored. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** How a respondent's address is kept for one response per person: hashed, normalised. */
export function respondentKey(email: string): string {
  return hashToken(normalizeEmail(email));
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

function locked(): AppError {
  return new AppError(401, 'FORM_LOCKED', 'This form needs its password.');
}

function toLiveForm(record: PublicRecord | null): LiveForm {
  const schema = record ? parsePublishedSchema(record.publishedSchema) : null;
  if (!record || !schema) throw notFound();
  return {
    id: record.id,
    slug: record.slug,
    title: record.publishedTitle ?? record.title,
    schema,
    settings: readLiveSettings(record.liveSettings),
    record,
  };
}

function localeOf(form: LiveForm): PublicLocale {
  const { language, dateFormat, numberFormat } = form.schema.settings;
  return { language, dateFormat, numberFormat };
}

function availability(form: LiveForm, now = new Date()) {
  return formAvailability({
    status: form.record.status,
    access: form.settings.access,
    responseCount: form.record._count.submissions,
    now,
  });
}

export interface PublicFormServiceOptions {
  prisma: Database;
  uploads: Pick<UploadChecks, 'verifyAnswers'>;
  /** Signs the tokens from unlocking forms and confirming addresses. */
  secret: string;
  passwords: Pick<PasswordHasher, 'verify' | 'verifyAgainstDummy'>;
  /** Sends the codes that confirm respondents' addresses. */
  mailer: Mailer;
}

export function createPublicFormService({
  prisma,
  uploads,
  secret,
  passwords,
  mailer,
}: PublicFormServiceOptions): PublicFormService {
  /** The form at `slug`, or at the address it had before its slug changed. */
  async function findRecord(db: Pick<Database, 'form' | 'formSlug'>, slug: string) {
    const current = await db.form.findUnique({ where: { slug }, select: publicSelect });
    if (current) return current;
    const old = await db.formSlug.findUnique({ where: { slug }, select: { formId: true } });
    return old ? db.form.findUnique({ where: { id: old.formId }, select: publicSelect }) : null;
  }

  async function find(slug: string): Promise<LiveForm> {
    return toLiveForm(await findRecord(prisma, slug));
  }

  function isUnlocked(form: LiveForm, accessToken: string | undefined): boolean {
    return (
      form.record.passwordHash === null ||
      isUnlockTokenValid(accessToken, form.id, form.record.passwordVersion, secret)
    );
  }

  /** Throws unless the form takes responses now and this browser may open it. */
  function assertCanRespond(form: LiveForm, accessToken: string | undefined): void {
    const state = availability(form);
    if (state.state === 'closed') throw closed(form.title);
    if (state.state === 'not_open') {
      throw new AppError(403, 'FORM_NOT_OPEN', 'This form is not open yet.', {
        details: { opensAt: state.opensAt },
      });
    }
    if (!isUnlocked(form, accessToken)) throw locked();
  }

  async function openForm(slug: string, accessToken: string | undefined): Promise<LiveForm> {
    const form = await find(slug);
    assertCanRespond(form, accessToken);
    return form;
  }

  /** The respondent's address and how it is known, as the form's access settings ask. */
  function respondentOf(
    form: LiveForm,
    input: Pick<SubmissionInput, 'respondentEmail' | 'verificationToken'>,
  ): { email: string | null; key: string | null } {
    const step = respondentEmailStep(form.settings.access);
    if (step === 'verify') {
      const email = verifiedEmail(input.verificationToken, form.id, secret);
      if (!email) {
        throw new AppError(
          403,
          'VERIFICATION_REQUIRED',
          'Confirm your email address with the code we sent you.',
        );
      }
      return { email, key: respondentKey(email) };
    }
    if (step === 'ask') {
      const email = input.respondentEmail?.trim();
      if (!email) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Enter your email address.', {
          details: [{ path: 'respondentEmail', message: 'Enter your email address' }],
        });
      }
      return { email: normalizeEmail(email), key: null };
    }
    return { email: null, key: null };
  }

  return {
    async get(slug, accessToken) {
      const form = await find(slug);
      const locale = localeOf(form);
      const state = availability(form);
      if (state.state === 'closed') {
        const message = form.settings.access.closedMessage?.trim();
        return {
          status: 'closed',
          slug: form.slug,
          title: form.title,
          locale,
          ...(message && { message }),
        };
      }
      // Respondents see the theme as published; forms published before themes were
      // snapshotted fall back to the current one.
      const theme = parsePublishedTheme(form.record.publishedTheme ?? form.record.theme);
      if (!theme) throw new Error('A published form has no theme');
      if (state.state === 'not_open') {
        return {
          status: 'not_open',
          slug: form.slug,
          title: form.title,
          locale,
          opensAt: state.opensAt,
          timeZone: readWorkspacePreferences(form.record.workspace.preferences).timeZone,
        };
      }
      if (!isUnlocked(form, accessToken)) {
        return { status: 'locked', slug: form.slug, title: form.title, locale, theme };
      }
      const { access } = form.settings;
      // The quiz's right answers stay on the server, which marks it.
      return {
        status: 'open',
        slug: form.slug,
        title: form.title,
        schema: toPublicSchema(form.schema),
        theme,
        access: {
          emailStep: respondentEmailStep(access),
          oneResponsePerBrowser: access.oneResponsePer === 'browser',
          allowEdits: access.allowEdits,
          indexable: !access.unlisted,
        },
      };
    },

    openForm,

    async unlock(slug, password) {
      const form = await find(slug);
      const hash = form.record.passwordHash;
      // Forms without a password do the same work, so timing does not tell them apart.
      const right = hash
        ? await passwords.verify(password, hash)
        : (await passwords.verifyAgainstDummy(password), false);
      if (!right) throw new AppError(401, 'WRONG_CODE', 'That password is not right.');
      return { token: signUnlockToken(form.id, form.record.passwordVersion, secret) };
    },

    async startVerification(slug, email, accessToken) {
      const form = await openForm(slug, accessToken);
      if (form.settings.access.oneResponsePer !== 'email') {
        throw new AppError(400, 'BAD_REQUEST', 'This form does not confirm email addresses.');
      }
      const emailHash = respondentKey(email);
      const answered = await prisma.submission.findUnique({
        where: { formId_respondentKey: { formId: form.id, respondentKey: emailHash } },
        select: { id: true },
      });
      if (answered) {
        throw new AppError(409, 'ALREADY_RESPONDED', 'This email address has already responded.');
      }

      const code = String(randomInt(0, 10 ** VERIFICATION_CODE_LENGTH)).padStart(
        VERIFICATION_CODE_LENGTH,
        '0',
      );
      // One live code per address and form: a new one replaces the last.
      const [, created] = await prisma.$transaction([
        prisma.respondentVerification.deleteMany({
          where: { OR: [{ formId: form.id, emailHash }, { expiresAt: { lt: new Date() } }] },
        }),
        prisma.respondentVerification.create({
          data: {
            formId: form.id,
            emailHash,
            codeHash: '',
            expiresAt: new Date(Date.now() + VERIFICATION_CODE_MINUTES * 60_000),
          },
          select: { id: true },
        }),
      ]);
      // Hashed with the row's id, so the same code for two addresses hashes differently.
      await prisma.respondentVerification.update({
        where: { id: created.id },
        data: { codeHash: hashToken(`${created.id}:${code}`) },
      });
      const rendered = renderCodeEmail({
        formTitle: form.title,
        code,
        messages: FORM_MESSAGES[form.schema.settings.language],
      });
      await mailer.send([{ to: normalizeEmail(email), ...rendered }], {
        idempotencyKey: `verify-${created.id}`,
      });
    },

    async checkVerification(slug, { email, code }, accessToken) {
      const form = await openForm(slug, accessToken);
      const emailHash = respondentKey(email);
      const wrong = () =>
        new AppError(401, 'WRONG_CODE', 'That code is not right, or it has expired.');
      const pending = await prisma.respondentVerification.findFirst({
        where: { formId: form.id, emailHash, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });
      if (!pending || pending.attempts >= CODE_ATTEMPTS) throw wrong();
      if (pending.codeHash !== hashToken(`${pending.id}:${code.trim()}`)) {
        await prisma.respondentVerification.update({
          where: { id: pending.id },
          data: { attempts: { increment: 1 } },
        });
        throw wrong();
      }
      await prisma.respondentVerification.delete({ where: { id: pending.id } });
      return { token: signEmailToken(form.id, normalizeEmail(email), secret) };
    },

    async recordView(slug, accessToken) {
      const form = await openForm(slug, accessToken);
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

    async previewOutcome(slug, answers, accessToken) {
      const form = await openForm(slug, accessToken);
      return toRespondentOutcome(
        form.schema,
        computeOutcome(form.schema, sanitizeAnswers(form.schema, answers)),
      );
    },

    async loadEdit(slug, token, accessToken) {
      const form = await openForm(slug, accessToken);
      const submission = form.settings.access.allowEdits
        ? await prisma.submission.findUnique({
            where: { editTokenHash: hashToken(token) },
            select: { formId: true, answers: true, respondentEmail: true },
          })
        : null;
      if (submission?.formId !== form.id) throw editUnavailable();
      // Stored answers were checked when they were saved; anything unreadable starts afresh.
      const answers = storedAnswersSchema.safeParse(submission.answers);
      return {
        answers: answers.success ? answers.data : {},
        respondentEmail: submission.respondentEmail,
      };
    },

    async submit(slug, input, context) {
      // Uploaded files are checked with storage first, outside the transaction, so no network
      // call ever holds the form's lock.
      const live = await openForm(slug, context.accessToken);
      const checked = await uploads.verifyAnswers(live, input.answers);

      return prisma.$transaction(async (tx) => {
        // Lock the form so concurrent submissions queue up: the response limit is checked
        // and the response stored as one step, so the limit can never be overshot.
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM forms WHERE id = ${live.id} FOR UPDATE
        `;
        if (locked.length === 0) throw notFound();

        const form = toLiveForm(await findRecord(tx, live.slug));
        assertCanRespond(form, context.accessToken);

        const messages = FORM_MESSAGES[form.schema.settings.language];
        const answers = sanitizeAnswers(form.schema, checked);
        const result = buildSubmissionValidator(form.schema, answers, messages).safeParse(answers);
        if (!result.success) throw invalidAnswers(result.error);
        // Worked out here from the answers alone: totals from the browser are never trusted.
        const outcome = computeOutcome(form.schema, result.data);
        const stored = toStoredOutcome(outcome);
        const metadata = {
          userAgent: context.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
          referrer: input.referrer || null,
        };
        const saved = {
          formId: form.id,
          formTitle: form.title,
          schema: form.schema,
          settings: form.settings,
          outcome: toRespondentOutcome(form.schema, outcome),
        };

        if (input.editToken) {
          const edited = await changeResponse(tx, form, input.editToken, {
            answers: result.data,
            outcome: stored,
          });
          return {
            ...saved,
            submission: { ...edited, answers: result.data, outcome: stored },
            editToken: input.editToken,
            edited: true,
            respondentEmail: edited.respondentEmail,
          };
        }

        const respondent = respondentOf(form, input);
        const editToken = form.settings.access.allowEdits
          ? randomBytes(32).toString('base64url')
          : null;
        let created;
        try {
          created = await tx.submission.create({
            data: {
              formId: form.id,
              answers: result.data,
              completionTimeMs: input.completionTimeMs ?? null,
              metadata,
              outcome: stored,
              respondentEmail: respondent.email,
              respondentKey: respondent.key,
              editTokenHash: editToken && hashToken(editToken),
            },
            select: { id: true, createdAt: true, completionTimeMs: true },
          });
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new AppError(
              409,
              'ALREADY_RESPONDED',
              'This email address has already responded.',
            );
          }
          throw error;
        }
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

        if (fillsForm(form.settings.access, form.record._count.submissions + 1)) {
          await tx.form.update({ where: { id: form.id }, data: { status: 'CLOSED' } });
        }
        return {
          ...saved,
          submission: {
            id: created.id,
            createdAt: created.createdAt.toISOString(),
            completionTimeMs: created.completionTimeMs,
            answers: result.data,
            metadata,
            outcome: stored,
          },
          editToken,
          edited: false,
          respondentEmail: respondent.email,
        };
      });
    },
  };
}

/** Changes the response `token` belongs to: answers and outcome, worked out again. */
async function changeResponse(
  tx: Transaction,
  form: LiveForm,
  token: string,
  update: { answers: SubmittedAnswers; outcome: StoredOutcome },
) {
  if (!form.settings.access.allowEdits) throw editUnavailable();
  const existing = await tx.submission.findUnique({
    where: { editTokenHash: hashToken(token) },
    select: {
      id: true,
      formId: true,
      createdAt: true,
      completionTimeMs: true,
      metadata: true,
      respondentEmail: true,
    },
  });
  if (existing?.formId !== form.id) throw editUnavailable();
  await tx.submission.update({
    where: { id: existing.id },
    data: {
      answers: update.answers,
      outcome: update.outcome,
      editedAt: new Date(),
    },
  });
  const metadata = submissionMetadataSchema.safeParse(existing.metadata);
  return {
    id: existing.id,
    createdAt: existing.createdAt.toISOString(),
    completionTimeMs: existing.completionTimeMs,
    metadata: metadata.success ? metadata.data : NO_METADATA,
    respondentEmail: existing.respondentEmail,
  };
}

function editUnavailable(): AppError {
  return new AppError(404, 'EDIT_UNAVAILABLE', 'This link no longer changes a response.');
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function invalidAnswers(error: z.ZodError): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Some answers need your attention.', {
    details: toAnswerIssues(error),
  });
}
