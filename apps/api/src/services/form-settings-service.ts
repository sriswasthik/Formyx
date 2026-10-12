import {
  chatWebhookHint,
  FORM_MESSAGES,
  formLocale,
  readLiveSettings,
  renderAutoresponder,
  requiredSettingsFeatures,
  storedFormSchemaSchema,
  type AutoresponderSettings,
  type ChatService,
  type FormSchema,
  type FormSettingsView,
  type LiveSettings,
  type UpdateFormSettingsInput,
  type ValidationIssue,
} from '@formyx/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../lib/app-error.js';
import type { Mailer } from '../lib/mailer.js';
import type { PasswordHasher } from '../lib/password.js';
import type { Database } from '../lib/prisma.js';
import type { SecretBox } from '../lib/webhook-signature.js';
import type { WebhookTransport } from '../lib/webhook-transport.js';
import { chatTestBody } from '../notifications/chat-message.js';
import type { EntitlementService } from './entitlement-service.js';
import { parsePublishedTheme } from './form-service.js';

/*
 * A form's live settings, as editors change them: each section replaced whole and in effect
 * at once. Secrets (the password, chat webhook URLs) are set on their own and only reported
 * as set or not.
 */

const settingsSelect = {
  id: true,
  slug: true,
  title: true,
  workspaceId: true,
  draftSchema: true,
  liveSettings: true,
  passwordHash: true,
  slackWebhookEncrypted: true,
  discordWebhookEncrypted: true,
} satisfies Prisma.FormSelect;

type SettingsRecord = Prisma.FormGetPayload<{ select: typeof settingsSelect }>;

const CHAT_COLUMN = {
  slack: 'slackWebhookEncrypted',
  discord: 'discordWebhookEncrypted',
} as const satisfies Record<ChatService, keyof SettingsRecord>;

export interface FormSettingsService {
  get(formId: string): Promise<FormSettingsView>;
  /**
   * Replaces the sections given. 403 UPGRADE_REQUIRED if one turns on something the plan
   * lacks; 422 if the autoresponder has nowhere to send.
   */
  update(formId: string, input: UpdateFormSettingsInput): Promise<FormSettingsView>;
  /** Sets the password, or removes it with `null`; either way, unlocked browsers lock again. */
  setPassword(formId: string, password: string | null): Promise<FormSettingsView>;
  setChatWebhook(
    formId: string,
    service: ChatService,
    url: string | null,
  ): Promise<FormSettingsView>;
  /** Posts a short test message; 409 if no webhook is set, 502 if the service refused it. */
  testChat(formId: string, service: ChatService): Promise<void>;
  /** Changes the form's address. The old one keeps working; 409 if the new one is taken. */
  changeSlug(formId: string, slug: string): Promise<FormSettingsView>;
  /** Sends `to` the autoresponder email as it would look, with sample answers. */
  sendAutoresponderTest(formId: string, settings: AutoresponderSettings, to: string): Promise<void>;
}

export interface FormSettingsDependencies {
  prisma: Database;
  entitlements: Pick<EntitlementService, 'assertFeatures'>;
  passwords: Pick<PasswordHasher, 'hash'>;
  secrets: SecretBox;
  chat: WebhookTransport;
  mailer: Mailer;
}

function notFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'Form not found');
}

/** Problems with the autoresponder's recipient, given the form's questions and access. */
export function autoresponderIssues(
  settings: LiveSettings,
  schema: Pick<FormSchema, 'fields'>,
): ValidationIssue[] {
  const { autoresponder, access } = settings;
  if (!autoresponder.enabled) return [];
  if (autoresponder.recipientFieldId === null) {
    return access.requireEmail || access.oneResponsePer === 'email'
      ? []
      : [
          {
            path: 'autoresponder.recipientFieldId',
            message: "Ask for respondents' email address in Access, or send to an email question",
          },
        ];
  }
  const field = schema.fields.find((candidate) => candidate.id === autoresponder.recipientFieldId);
  return field?.type === 'email'
    ? []
    : [{ path: 'autoresponder.recipientFieldId', message: 'Choose an email question' }];
}

/** Answers that show what piping looks like in a test email: each question's own name. */
function sampleAnswers(schema: FormSchema): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const field of schema.fields) {
    if (field.type === 'email') answers[field.id] = 'someone@example.com';
    else if (field.type === 'short_text' || field.type === 'long_text') {
      answers[field.id] = `[${field.label.trim() || field.id}]`;
    }
  }
  return answers;
}

export function createFormSettingsService({
  prisma,
  entitlements,
  passwords,
  secrets,
  chat,
  mailer,
}: FormSettingsDependencies): FormSettingsService {
  async function load(formId: string): Promise<SettingsRecord> {
    const record = await prisma.form.findUnique({ where: { id: formId }, select: settingsSelect });
    if (!record) throw notFound();
    return record;
  }

  function chatView(sealed: string | null) {
    if (!sealed) return null;
    try {
      return { hint: chatWebhookHint(secrets.decrypt(sealed)) };
    } catch {
      // Sealed with an older JWT_SECRET: shown as set, and it can be replaced.
      return { hint: '…' };
    }
  }

  function toView(record: SettingsRecord): FormSettingsView {
    return {
      settings: readLiveSettings(record.liveSettings),
      slug: record.slug,
      hasPassword: record.passwordHash !== null,
      chat: {
        slack: chatView(record.slackWebhookEncrypted),
        discord: chatView(record.discordWebhookEncrypted),
      },
    };
  }

  async function get(formId: string): Promise<FormSettingsView> {
    return toView(await load(formId));
  }

  return {
    get,

    async update(formId, input) {
      const record = await load(formId);
      await entitlements.assertFeatures(record.workspaceId, requiredSettingsFeatures(input));
      const current = readLiveSettings(record.liveSettings);
      const settings: LiveSettings = {
        access: input.access ?? current.access,
        notifications: input.notifications ?? current.notifications,
        autoresponder: input.autoresponder ?? current.autoresponder,
        sharing: input.sharing ?? current.sharing,
        data: input.data ?? current.data,
      };
      // The draft is what editors are working on, so checks match what they see.
      const draft = storedFormSchemaSchema.parse(record.draftSchema);
      const issues = autoresponderIssues(settings, draft);
      if (issues.length > 0) {
        throw new AppError(422, 'VALIDATION_ERROR', 'The autoresponder has nowhere to send.', {
          details: issues,
        });
      }
      await prisma.form.update({ where: { id: formId }, data: { liveSettings: settings } });
      return get(formId);
    },

    async setPassword(formId, password) {
      await load(formId);
      await prisma.form.update({
        where: { id: formId },
        data: {
          passwordHash: password === null ? null : await passwords.hash(password),
          passwordVersion: { increment: 1 },
        },
      });
      return get(formId);
    },

    async setChatWebhook(formId, service, url) {
      const record = await load(formId);
      if (url !== null) {
        await entitlements.assertFeatures(record.workspaceId, ['chat_notifications']);
      }
      await prisma.form.update({
        where: { id: formId },
        data: { [CHAT_COLUMN[service]]: url === null ? null : secrets.encrypt(url) },
      });
      return get(formId);
    },

    async testChat(formId, service) {
      const record = await load(formId);
      const sealed = record[CHAT_COLUMN[service]];
      if (!sealed) throw new AppError(409, 'CONFLICT', 'Add a webhook URL first.');
      let statusCode: number;
      try {
        ({ statusCode } = await chat({
          url: secrets.decrypt(sealed),
          body: chatTestBody(service, record.title),
          headers: { 'Content-Type': 'application/json' },
        }));
      } catch {
        throw new AppError(502, 'BAD_REQUEST', 'The test message could not be sent.');
      }
      if (statusCode < 200 || statusCode >= 300) {
        throw new AppError(
          502,
          'BAD_REQUEST',
          `The webhook answered ${statusCode}. Check the URL, or make a new one.`,
        );
      }
    },

    async changeSlug(formId, slug) {
      const record = await load(formId);
      if (slug === record.slug) return toView(record);
      const [taken, old] = await Promise.all([
        prisma.form.findUnique({ where: { slug }, select: { id: true } }),
        prisma.formSlug.findUnique({ where: { slug }, select: { formId: true } }),
      ]);
      if (taken || (old && old.formId !== formId)) {
        throw new AppError(409, 'CONFLICT', 'Another form already uses this address.');
      }
      await prisma.$transaction([
        // Taking back one of its own old addresses: it is current again, not old.
        prisma.formSlug.deleteMany({ where: { slug } }),
        prisma.formSlug.create({ data: { slug: record.slug, formId } }),
        prisma.form.update({ where: { id: formId }, data: { slug } }),
      ]);
      return get(formId);
    },

    async sendAutoresponderTest(formId, settings, to) {
      const record = await prisma.form.findUnique({
        where: { id: formId },
        select: { title: true, draftSchema: true, theme: true },
      });
      if (!record) throw notFound();
      const schema = storedFormSchemaSchema.parse(record.draftSchema);
      const theme = parsePublishedTheme(record.theme);
      if (!theme) throw notFound();
      const rendered = renderAutoresponder({
        formTitle: record.title,
        schema,
        theme,
        settings,
        answers: sampleAnswers(schema),
        outcome: null,
        editUrl: settings.includeEditLink ? 'https://formyx.app/' : null,
        locale: formLocale(schema.settings, FORM_MESSAGES[schema.settings.language]),
      });
      await mailer.send([{ to, ...rendered, subject: `[Test] ${rendered.subject}` }], {
        idempotencyKey: `autoresponder-test/${formId}/${Date.now()}`,
      });
    },
  };
}
