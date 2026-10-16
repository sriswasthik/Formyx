import {
  AUTORESPONDERS_PER_DAY,
  FORM_MESSAGES,
  formLocale,
  isNewAccount,
  NEW_ACCOUNT_LIMITS,
  readLiveSettings,
  renderAutoresponder,
} from '@formyx/shared';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import { isDemoForm } from '../demo/restrictions.js';
import type { EventBus } from '../lib/events.js';
import type { JobQueue } from '../jobs/queue.js';
import type { Encryption } from '../lib/encryption.js';
import type { Database } from '../lib/prisma.js';
import { parsePublishedSchema, parsePublishedTheme } from '../services/form-service.js';
import { respondentKey } from '../services/public-form-service.js';
import { queueEmails } from './email-jobs.js';
import { formAllows } from '../services/entitlement-service.js';

/** How many autoresponder emails one address gets from one form in a day, at most. */
export const AUTORESPONDER_DAILY_LIMIT = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const emailAddress = z.email().max(254);

/** The text of `[label](url)` links, and bare addresses removed: for new accounts' emails. */
export function withoutLinks(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\bhttps?:\/\/\S+/gi, '')
    .replace(/[ \t]{2,}/g, ' ');
}

interface AutoresponderDependencies {
  env: Pick<Env, 'APP_URL' | 'ENTITLEMENTS_MODE' | 'NEW_ACCOUNT_LIMITS'>;
  logger: Logger;
  prisma: Database;
  jobs: JobQueue;
  encryption: Encryption;
  events: EventBus;
}

/**
 * Sends respondents the form's autoresponder email after each new response: to the address
 * they gave before the questions, or their answer to the email question the form names.
 * Anyone can type any address into a form, so an address gets at most a few a day from one
 * form, and the email says why it came. Demo forms never send one.
 */
export function registerAutoresponder({
  env,
  logger,
  prisma,
  jobs,
  encryption,
  events,
}: AutoresponderDependencies): () => void {
  return events.on(
    'submission.created',
    async ({ formId, submission, respondentEmail, editToken }) => {
      const context = { formId, submissionId: submission.id };
      try {
        const form = await prisma.form.findUnique({
          where: { id: formId },
          select: {
            slug: true,
            title: true,
            publishedTitle: true,
            publishedSchema: true,
            publishedTheme: true,
            theme: true,
            liveSettings: true,
            workspaceId: true,
            createdBy: { select: { createdAt: true } },
          },
        });
        if (!form) return;
        // A new account's forms send none yet, and then without links (NEW_ACCOUNT_LIMITS).
        const newAccount =
          env.NEW_ACCOUNT_LIMITS && form.createdBy ? isNewAccount(form.createdBy.createdAt) : false;
        if (newAccount && !NEW_ACCOUNT_LIMITS.autoresponders) {
          logger.info(context, 'Skipped an autoresponder email: the account is new');
          return;
        }
        const settings = readLiveSettings(form.liveSettings);
        const { autoresponder } = settings;
        if (!autoresponder.enabled) return;
        // Paused, with its settings kept, while the plan lacks it.
        if (!(await formAllows(prisma, env.ENTITLEMENTS_MODE, formId, 'autoresponder'))) return;

        const answer =
          autoresponder.recipientFieldId === null
            ? respondentEmail
            : submission.answers[autoresponder.recipientFieldId];
        const to = emailAddress.safeParse(answer);
        if (!to.success) return;
        if (await isDemoForm(prisma, formId)) return;

        const emailHash = respondentKey(to.data);
        const recent = await prisma.autoresponderSend.count({
          where: { formId, emailHash, createdAt: { gt: new Date(Date.now() - DAY_MS) } },
        });
        if (recent >= AUTORESPONDER_DAILY_LIMIT) {
          logger.warn(context, 'Skipped an autoresponder email: the address had enough today');
          return;
        }
        // However many people respond, a workspace sends only so many a day.
        const today = await prisma.autoresponderSend.count({
          where: {
            form: { workspaceId: form.workspaceId },
            createdAt: { gt: new Date(Date.now() - DAY_MS) },
          },
        });
        if (today >= AUTORESPONDERS_PER_DAY) {
          logger.warn(context, 'Skipped an autoresponder email: the workspace had enough today');
          return;
        }
        const links = !newAccount || NEW_ACCOUNT_LIMITS.autoresponderLinks;

        const schema = parsePublishedSchema(form.publishedSchema);
        const theme = parsePublishedTheme(form.publishedTheme ?? form.theme);
        if (!schema || !theme) return;
        const rendered = renderAutoresponder({
          formTitle: form.publishedTitle ?? form.title,
          schema,
          theme,
          settings: links
            ? autoresponder
            : { ...autoresponder, body: withoutLinks(autoresponder.body) },
          answers: submission.answers,
          outcome: submission.outcome,
          editUrl:
            links && editToken && settings.access.allowEdits
              ? `${env.APP_URL}/f/${encodeURIComponent(form.slug)}#edit=${editToken}`
              : null,
          locale: formLocale(schema.settings, FORM_MESSAGES[schema.settings.language]),
        });
        await prisma.autoresponderSend.create({ data: { formId, emailHash } });
        await queueEmails(jobs, encryption, {
          formId,
          kind: 'autoresponder',
          messages: [{ to: to.data, ...rendered, replyTo: autoresponder.replyTo }],
          idempotencyKey: `autoresponder/${submission.id}`,
        });
        logger.info(context, 'Queued an autoresponder email');
      } catch (error) {
        logger.error({ ...context, err: error }, 'Could not queue an autoresponder email');
      }
    },
  );
}
