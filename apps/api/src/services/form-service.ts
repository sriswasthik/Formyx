import { randomBytes } from 'node:crypto';
import {
  copyFormTitle,
  createDefaultTheme,
  formSchema,
  formThemeSchema,
  getFormTemplate,
  slugify,
  type FormDetail,
  type FormSchema,
  type FormSummary,
  type FormTheme,
  type FormTemplateId,
  type ListFormsQuery,
  type UpdateFormInput,
} from '@formyx/shared';
import type { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../lib/app-error.js';
import type { Database } from '../lib/prisma.js';

const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SLUG_SUFFIX_LENGTH = 8;
const MAX_SLUG_ATTEMPTS = 3;

const summarySelect = {
  id: true,
  workspaceId: true,
  title: true,
  slug: true,
  status: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  _count: { select: { submissions: true } },
} satisfies Prisma.FormSelect;

const detailSelect = {
  ...summarySelect,
  draftSchema: true,
  publishedSchema: true,
  theme: true,
} satisfies Prisma.FormSelect;

type SummaryRecord = Prisma.FormGetPayload<{ select: typeof summarySelect }>;
type DetailRecord = Prisma.FormGetPayload<{ select: typeof detailSelect }>;

function toSummary(form: SummaryRecord): FormSummary {
  return {
    id: form.id,
    workspaceId: form.workspaceId,
    title: form.title,
    slug: form.slug,
    status: form.status,
    version: form.version,
    responseCount: form._count.submissions,
    createdAt: form.createdAt.toISOString(),
    updatedAt: form.updatedAt.toISOString(),
    publishedAt: form.publishedAt?.toISOString() ?? null,
  };
}

/**
 * JSON columns are validated before every write, so stored data failing validation is a
 * server bug: report it as one (500), not as a problem with the request.
 */
function parseStored<T>(schema: z.ZodType<T>, value: unknown, column: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`Stored ${column} does not match its schema`, { cause: result.error });
  }
  return result.data;
}

function toDetail(form: DetailRecord): FormDetail {
  return {
    ...toSummary(form),
    draftSchema: parseStored(formSchema, form.draftSchema, 'draftSchema'),
    publishedSchema:
      form.publishedSchema === null
        ? null
        : parseStored(formSchema, form.publishedSchema, 'publishedSchema'),
    theme: parseStored(formThemeSchema, form.theme, 'theme'),
  };
}

/** "Customer feedback" -> "customer-feedback-x7k2p9q1". The suffix keeps slugs unique and unguessable. */
export function formSlug(title: string): string {
  const suffix = Array.from(
    randomBytes(SLUG_SUFFIX_LENGTH),
    (byte) => SLUG_ALPHABET[byte % SLUG_ALPHABET.length],
  ).join('');
  return `${slugify(title, 40) || 'form'}-${suffix}`;
}

/** Prisma's `contains` becomes ILIKE without escaping, so `%` and `_` would act as wildcards. */
function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function notFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'Form not found');
}

interface NewForm {
  workspaceId: string;
  createdById: string;
  title: string;
  draftSchema: FormSchema;
  theme: FormTheme;
}

export interface FormService {
  list(workspaceId: string, query: ListFormsQuery): Promise<FormSummary[]>;
  create(
    workspaceId: string,
    userId: string,
    input: { templateId: FormTemplateId; title?: string | undefined },
  ): Promise<FormDetail>;
  get(formId: string): Promise<FormDetail>;
  /** Applies the update only if `input.version` is still current; otherwise 409. */
  update(formId: string, input: UpdateFormInput): Promise<FormDetail>;
  duplicate(formId: string, userId: string): Promise<FormDetail>;
  remove(formId: string): Promise<void>;
}

export function createFormService(prisma: Database): FormService {
  async function insert(form: NewForm): Promise<FormDetail> {
    for (let attempt = 1; ; attempt++) {
      try {
        const created = await prisma.form.create({
          data: { ...form, slug: formSlug(form.title) },
          select: detailSelect,
        });
        return toDetail(created);
      } catch (error) {
        // The random suffix makes collisions vanishingly rare, but they are cheap to retry.
        if (!isUniqueViolation(error) || attempt >= MAX_SLUG_ATTEMPTS) throw error;
      }
    }
  }

  async function get(formId: string): Promise<FormDetail> {
    const form = await prisma.form.findUnique({ where: { id: formId }, select: detailSelect });
    if (!form) throw notFound();
    return toDetail(form);
  }

  return {
    async list(workspaceId, { search, status }) {
      const forms = await prisma.form.findMany({
        where: {
          workspaceId,
          ...(status && { status }),
          ...(search && { title: { contains: escapeLikePattern(search), mode: 'insensitive' } }),
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: summarySelect,
      });
      return forms.map(toSummary);
    },

    create(workspaceId, userId, { templateId, title }) {
      const template = getFormTemplate(templateId);
      return insert({
        workspaceId,
        createdById: userId,
        title: title ?? template.defaultTitle,
        draftSchema: template.build(),
        theme: createDefaultTheme(),
      });
    },

    get,

    async update(formId, { version, title, draftSchema }) {
      // Compare-and-set: the write only matches while the form is still at `version`.
      const { count } = await prisma.form.updateMany({
        where: { id: formId, version },
        data: { title, draftSchema, version: { increment: 1 } },
      });

      if (count === 0) {
        const current = await prisma.form.findUnique({
          where: { id: formId },
          select: { version: true },
        });
        if (!current) throw notFound();
        throw new AppError(
          409,
          'CONFLICT',
          'This form was changed somewhere else. Load the latest version and try again.',
          { details: { currentVersion: current.version } },
        );
      }
      return get(formId);
    },

    async duplicate(formId, userId) {
      const source = await get(formId);
      return insert({
        workspaceId: source.workspaceId,
        createdById: userId,
        title: copyFormTitle(source.title),
        draftSchema: source.draftSchema,
        theme: source.theme,
      });
    },

    async remove(formId) {
      const { count } = await prisma.form.deleteMany({ where: { id: formId } });
      if (count === 0) throw notFound();
    },
  };
}
