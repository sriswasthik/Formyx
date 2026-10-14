import { randomBytes } from 'node:crypto';
import {
  applyBrandKit,
  copyFormTitle,
  createDefaultLiveSettings,
  createDefaultTheme,
  defaultFormNotifications,
  findPublishIssues,
  FORM_MESSAGES,
  formAvailability,
  getFormTemplate,
  readAccountPreferences,
  readLiveSettings,
  readWorkspacePreferences,
  requiredFeatures,
  requiredLogicFeatures,
  slugify,
  type FormDetail,
  type FormSchema,
  type FormSummary,
  type FormTheme,
  type FormTemplateId,
  type ListFormsQuery,
  type LiveSettings,
  type PublishFormInput,
  type UpdateFormInput,
  storedFormSchemaSchema,
  storedFormThemeSchema,
  THEME_PRESETS,
  themeForFeatures,
  type ThemePresetId,
} from '@formyx/shared';
import type { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../lib/app-error.js';
import { escapeLikePattern } from '../lib/like-pattern.js';
import type { Database } from '../lib/prisma.js';
import { workspaceDefaultKit } from './brand-kit-service.js';
import type { EntitlementService } from './entitlement-service.js';

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
  publishedTitle: true,
  theme: true,
  publishedTheme: true,
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
 * server bug: report it as one (500), not as a problem with the request. Schemas and themes
 * saved by older versions are upgraded as they are read.
 */
function parseStored<T>(schema: z.ZodType<T>, value: unknown, column: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`Stored ${column} does not match its schema`, { cause: result.error });
  }
  return result.data;
}

/** A stored `publishedSchema`, or `null` for a form that was never published. */
export function parsePublishedSchema(value: Prisma.JsonValue | null): FormSchema | null {
  return value === null ? null : parseStored(storedFormSchemaSchema, value, 'publishedSchema');
}

/** A stored `publishedTheme`, or `null` for a form that was never published. */
export function parsePublishedTheme(value: Prisma.JsonValue | null): FormTheme | null {
  return value === null ? null : parseStored(storedFormThemeSchema, value, 'publishedTheme');
}

function toDetail(form: DetailRecord): FormDetail {
  return {
    ...toSummary(form),
    draftSchema: parseStored(storedFormSchemaSchema, form.draftSchema, 'draftSchema'),
    publishedSchema: parsePublishedSchema(form.publishedSchema),
    publishedTitle: form.publishedTitle,
    theme: parseStored(storedFormThemeSchema, form.theme, 'theme'),
    publishedTheme: parsePublishedTheme(form.publishedTheme),
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

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function notFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'Form not found');
}

function versionConflict(currentVersion: number): AppError {
  return new AppError(
    409,
    'CONFLICT',
    'This form was changed somewhere else. Load the latest version and try again.',
    { details: { currentVersion } },
  );
}

const LIMIT_REACHED_MESSAGES = {
  response_limit:
    "This form has reached its response limit. Raise or remove the limit in the form's settings, then reopen it.",
  close_date:
    "This form is past its closing time. Change or remove it in the form's settings, then reopen it.",
} as const;

interface NewForm {
  workspaceId: string;
  createdById: string;
  title: string;
  draftSchema: FormSchema;
  theme: FormTheme;
  liveSettings: LiveSettings;
}

/**
 * A template's schema in the creator's language: the form's own words (buttons, checks)
 * follow it, and the submit button too unless the template words it its own way.
 */
function inLanguage(schema: FormSchema, language: FormSchema['settings']['language']): FormSchema {
  if (language === 'en') return schema;
  const englishSubmit = FORM_MESSAGES.en.nav.submit;
  return {
    ...schema,
    settings: {
      ...schema.settings,
      language,
      submitButtonText:
        schema.settings.submitButtonText === englishSubmit
          ? FORM_MESSAGES[language].nav.submit
          : schema.settings.submitButtonText,
    },
  };
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
  /**
   * Snapshots the draft, title and theme as what respondents see. A draft form goes live; a
   * closed one stays closed until reopened. Refused with 409 if the draft moved on from
   * `version`, 422 if it is not complete, or 403 UPGRADE_REQUIRED if the theme uses features
   * the workspace's plan lacks.
   */
  publish(formId: string, input: PublishFormInput): Promise<FormDetail>;
  /** Stops a published form taking responses. */
  close(formId: string): Promise<FormDetail>;
  /** Takes responses again, unless the response limit or closing time says no. */
  reopen(formId: string): Promise<FormDetail>;
}

/**
 * The look a template's forms start with: its preset as the workspace's plan draws it, so a
 * form never starts with Pro features it could not publish; or the default theme.
 */
async function templateTheme(
  entitlements: Pick<EntitlementService, 'forWorkspace'>,
  workspaceId: string,
  presetId: ThemePresetId | null,
): Promise<FormTheme> {
  const preset = presetId && THEME_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) return createDefaultTheme();
  const { features } = await entitlements.forWorkspace(workspaceId);
  return themeForFeatures(structuredClone(preset.theme), features).theme;
}

export function createFormService(
  prisma: Database,
  entitlements: Pick<EntitlementService, 'assertFeatures' | 'forWorkspace'>,
): FormService {
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

    async create(workspaceId, userId, { templateId, title }) {
      const template = getFormTemplate(templateId);
      const [kit, workspace, user] = await Promise.all([
        // New forms start in the workspace's default brand kit, if it has one.
        workspaceDefaultKit(prisma, workspaceId),
        prisma.workspace.findUnique({ where: { id: workspaceId }, select: { preferences: true } }),
        prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } }),
      ]);
      // In the creator's language, notifying as the workspace's new forms do.
      const account = readAccountPreferences(user?.preferences);
      const defaults = readWorkspacePreferences(workspace?.preferences);
      const created = await insert({
        workspaceId,
        createdById: userId,
        title: title ?? template.defaultTitle,
        draftSchema: inLanguage(template.build(), account.language),
        // The workspace's default brand kit, if it has one; otherwise the template's own look.
        theme: kit
          ? applyBrandKit(createDefaultTheme(), kit)
          : await templateTheme(entitlements, workspaceId, template.presetId),
        liveSettings: createDefaultLiveSettings(defaultFormNotifications(defaults)),
      });
      if (account.emailOnNewForms) {
        await prisma.formSubscription.create({ data: { userId, formId: created.id } });
      }
      return created;
    },

    get,

    async update(formId, { version, title, draftSchema, theme }) {
      // Compare-and-set: the write only matches while the form is still at `version`.
      const { count } = await prisma.form.updateMany({
        where: { id: formId, version },
        data: { title, draftSchema, theme, version: { increment: 1 } },
      });

      if (count === 0) {
        const current = await prisma.form.findUnique({
          where: { id: formId },
          select: { version: true },
        });
        if (!current) throw notFound();
        throw versionConflict(current.version);
      }
      return get(formId);
    },

    async duplicate(formId, userId) {
      const source = await get(formId);
      const stored = await prisma.form.findUnique({
        where: { id: formId },
        select: { liveSettings: true },
      });
      // Settings come along; the password and chat webhooks (secrets) do not.
      return insert({
        workspaceId: source.workspaceId,
        createdById: userId,
        title: copyFormTitle(source.title),
        draftSchema: source.draftSchema,
        theme: source.theme,
        liveSettings: readLiveSettings(stored?.liveSettings),
      });
    },

    async remove(formId) {
      const { count } = await prisma.form.deleteMany({ where: { id: formId } });
      if (count === 0) throw notFound();
    },

    async publish(formId, { version }) {
      const form = await prisma.form.findUnique({
        where: { id: formId },
        select: {
          workspaceId: true,
          version: true,
          title: true,
          status: true,
          draftSchema: true,
          theme: true,
        },
      });
      if (!form) throw notFound();
      if (form.version !== version) throw versionConflict(form.version);

      const draft = parseStored(storedFormSchemaSchema, form.draftSchema, 'draftSchema');
      const issues = findPublishIssues(draft);
      if (issues.length > 0) {
        throw new AppError(422, 'FORM_INCOMPLETE', 'Finish the form before publishing it.', {
          details: issues,
        });
      }
      // Anyone may try Pro looks and logic in the editor; going live with them takes the plan.
      const theme = parseStored(storedFormThemeSchema, form.theme, 'theme');
      await entitlements.assertFeatures(form.workspaceId, [
        ...requiredFeatures(theme),
        ...requiredLogicFeatures(draft),
      ]);

      // Conditional on the version, so a draft saved in the meantime is never published unseen.
      const { count } = await prisma.form.updateMany({
        where: { id: formId, version },
        data: {
          publishedSchema: draft,
          publishedTitle: form.title,
          publishedTheme: theme,
          publishedAt: new Date(),
          ...(form.status === 'DRAFT' && { status: 'PUBLISHED' }),
        },
      });
      if (count === 0) {
        const current = await prisma.form.findUnique({
          where: { id: formId },
          select: { version: true },
        });
        if (!current) throw notFound();
        throw versionConflict(current.version);
      }
      return get(formId);
    },

    async close(formId) {
      const { count } = await prisma.form.updateMany({
        where: { id: formId, status: 'PUBLISHED' },
        data: { status: 'CLOSED' },
      });
      if (count === 0) {
        const form = await get(formId);
        throw new AppError(
          409,
          'CONFLICT',
          form.status === 'CLOSED'
            ? 'This form is already closed.'
            : 'Only published forms can be closed.',
        );
      }
      return get(formId);
    },

    async reopen(formId) {
      const form = await get(formId);
      if (form.status !== 'CLOSED') {
        throw new AppError(409, 'CONFLICT', 'Only closed forms can be reopened.');
      }
      const stored = await prisma.form.findUnique({
        where: { id: formId },
        select: { liveSettings: true },
      });
      // As if it were open again: would its limit or closing time close it at once?
      const availability = formAvailability({
        status: 'PUBLISHED',
        access: readLiveSettings(stored?.liveSettings).access,
        responseCount: form.responseCount,
      });
      if (
        availability.state === 'closed' &&
        (availability.reason === 'response_limit' || availability.reason === 'close_date')
      ) {
        throw new AppError(409, 'CONFLICT', LIMIT_REACHED_MESSAGES[availability.reason]);
      }

      await prisma.form.updateMany({
        where: { id: formId, status: 'CLOSED' },
        data: { status: 'PUBLISHED' },
      });
      return get(formId);
    },
  };
}
