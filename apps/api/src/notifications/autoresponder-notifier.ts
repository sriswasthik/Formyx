import { FORM_MESSAGES, formLocale, readLiveSettings, renderAutoresponder } from '@formyx/shared';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import { isDemoForm } from '../demo/restrictions.js';
import type { EventBus } from '../lib/events.js';
import type { Mailer } from '../lib/mailer.js';
import type { Database } from '../lib/prisma.js';
import { parsePublishedSchema, parsePublishedTheme } from '../services/form-service.js';
import { respondentKey } from '../services/public-form-service.js';

/** How many autoresponder emails one address gets from one form in a day, at most. */
export const AUTORESPONDER_DAILY_LIMIT = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const emailAddress = z.email().max(254);

interface AutoresponderDependencies {
  env: Pick<Env, 'APP_URL'>;
  logger: Logger;
  prisma: Database;
  mailer: Mailer;
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
  mailer,
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
          },
        });
        if (!form) return;
        const settings = readLiveSettings(form.liveSettings);
        const { autoresponder } = settings;
        if (!autoresponder.enabled) return;

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

        const schema = parsePublishedSchema(form.publishedSchema);
        const theme = parsePublishedTheme(form.publishedTheme ?? form.theme);
        if (!schema || !theme) return;
        const rendered = renderAutoresponder({
          formTitle: form.publishedTitle ?? form.title,
          schema,
          theme,
          settings: autoresponder,
          answers: submission.answers,
          outcome: submission.outcome,
          editUrl:
            editToken && settings.access.allowEdits
              ? `${env.APP_URL}/f/${encodeURIComponent(form.slug)}#edit=${editToken}`
              : null,
          locale: formLocale(schema.settings, FORM_MESSAGES[schema.settings.language]),
        });
        await prisma.autoresponderSend.create({ data: { formId, emailHash } });
        await mailer.send([{ to: to.data, ...rendered, replyTo: autoresponder.replyTo }], {
          idempotencyKey: `autoresponder/${submission.id}`,
        });
        logger.info(context, 'Sent an autoresponder email');
      } catch (error) {
        logger.error({ ...context, err: error }, 'Could not send an autoresponder email');
      }
    },
  );
}
