import { formResponsesPath, readAccountPreferences, readOnboardingState } from '@formyx/shared';
import type { Logger } from 'pino';
import type { Env } from '../config/env.js';
import type { JobPayloads, LifecycleKind } from '../jobs/job-types.js';
import type { JobQueue } from '../jobs/queue.js';
import type { EventBus } from '../lib/events.js';
import type { EmailMessage, Mailer } from '../lib/mailer.js';
import type { Database } from '../lib/prisma.js';
import { createUnsubscribeToken } from '../lib/unsubscribe-token.js';
import type { RenderedEmail } from '../notifications/email-layout.js';
import {
  renderFirstFormPublishedEmail,
  renderFirstResponseEmail,
  renderInactiveEmail,
  renderWelcomeEmail,
  type LifecycleEmailContext,
} from '../notifications/lifecycle-email.js';

/*
 * Lifecycle emails, sent through the job queue: a welcome at sign-up, a note when the first
 * form goes live and when its first response arrives, and a nudge after two weeks away. The
 * trial reminders are billing notices (billing/upkeep.ts) that follow the same preference.
 *
 * - "First" emails go only to accounts created since onboarding shipped (they have
 *   `onboarding.startedAt`), so nobody gets "your first form is live" for their tenth.
 * - Each kind goes once per account and period (`lifecycle_emails`), and the email service
 *   drops a retried send with the same key.
 * - Nobody who turned off "Tips and reminders" gets one, nor the demo account.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Away this long, they get the nudge... */
export const INACTIVE_AFTER_DAYS = 14;
/** ...unless the hourly job missed them for a week: then it is too late to say "two weeks". */
const INACTIVE_UNTIL_DAYS = 21;

export interface LifecycleDependencies {
  prisma: Database;
  jobs: JobQueue;
  mailer: Mailer;
  env: Pick<Env, 'APP_URL' | 'JWT_SECRET'>;
  logger: Logger;
}

/** Where a lifecycle email's links turn them off: a page, and a one-click endpoint. */
export function unsubscribeLinks(
  env: Pick<Env, 'APP_URL' | 'JWT_SECRET'>,
  userId: string,
): { page: string; oneClick: string } {
  const token = createUnsubscribeToken(userId, env.JWT_SECRET);
  return {
    page: `${env.APP_URL}/unsubscribe/${token}`,
    oneClick: `${env.APP_URL}/api/public/unsubscribe?token=${token}`,
  };
}

/** RFC 8058 one-click unsubscribe, which mail apps show as their own button. */
export function unsubscribeHeaders(oneClick: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${oneClick}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

export async function queueLifecycleEmail(
  jobs: JobQueue,
  job: JobPayloads['lifecycle.send'],
): Promise<void> {
  await jobs.send('lifecycle.send', job);
}

async function alreadySent(
  prisma: Database,
  { userId, kind, periodKey }: { userId: string; kind: LifecycleKind; periodKey: string },
): Promise<boolean> {
  const sent = await prisma.lifecycleEmail.findUnique({
    where: { userId_kind_periodKey: { userId, kind, periodKey } },
    select: { id: true },
  });
  return sent !== null;
}

/** Sends one lifecycle email, if the person still wants it and has not had it. */
export async function sendLifecycleEmail(
  { prisma, mailer, env }: Pick<LifecycleDependencies, 'prisma' | 'mailer' | 'env'>,
  { userId, kind, periodKey, formId }: JobPayloads['lifecycle.send'],
  now: Date = new Date(),
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      isDemo: true,
      preferences: true,
      onboarding: true,
      lastActiveAt: true,
    },
  });
  if (!user || user.isDemo || !readAccountPreferences(user.preferences).productEmails) {
    return false;
  }
  if (kind !== 'inactive' && readOnboardingState(user.onboarding).startedAt === undefined) {
    return false;
  }
  if (await alreadySent(prisma, { userId, kind, periodKey })) return false;

  const links = unsubscribeLinks(env, userId);
  const context: LifecycleEmailContext = {
    name: user.name,
    appUrl: env.APP_URL,
    unsubscribeUrl: links.page,
  };
  const email = await render(prisma, env, { userId, kind, formId, context, user, now });
  if (!email) return false;

  const message: EmailMessage = {
    to: user.email,
    ...email,
    headers: unsubscribeHeaders(links.oneClick),
  };
  await mailer.send([message], { idempotencyKey: `lifecycle:${userId}:${kind}:${periodKey}` });
  await prisma.lifecycleEmail.createMany({
    data: [{ userId, kind, periodKey }],
    skipDuplicates: true,
  });
  return true;
}

async function render(
  prisma: Database,
  env: Pick<Env, 'APP_URL'>,
  {
    userId,
    kind,
    formId,
    context,
    user,
    now,
  }: {
    userId: string;
    kind: LifecycleKind;
    formId: string | undefined;
    context: LifecycleEmailContext;
    user: { lastActiveAt: Date | null };
    now: Date;
  },
): Promise<RenderedEmail | null> {
  switch (kind) {
    case 'welcome':
      return renderWelcomeEmail(context);
    case 'first_form_published':
    case 'first_response': {
      const form = formId
        ? await prisma.form.findUnique({
            where: { id: formId },
            select: { id: true, title: true, slug: true, publishedTitle: true },
          })
        : null;
      if (!form) return null;
      const formTitle = form.publishedTitle ?? form.title;
      return kind === 'first_form_published'
        ? renderFirstFormPublishedEmail(context, {
            formTitle,
            formUrl: `${env.APP_URL}/app/forms/${form.id}`,
            shareUrl: `${env.APP_URL}/f/${form.slug}`,
          })
        : renderFirstResponseEmail(context, {
            formTitle,
            responsesUrl: `${env.APP_URL}${formResponsesPath(form.id)}`,
          });
    }
    case 'inactive': {
      // Back since it was queued: no nudge.
      const since = user.lastActiveAt;
      if (!since || now.getTime() - since.getTime() < INACTIVE_AFTER_DAYS * DAY_MS) return null;
      const newResponses = await prisma.submission.count({
        where: { form: { createdById: userId }, createdAt: { gt: since } },
      });
      return renderInactiveEmail(context, { newResponses });
    }
  }
}

/**
 * The hourly job's part: queues the nudge for everyone last seen two to three weeks ago. The
 * day they were last active is the period, so each stretch away gets one nudge at most.
 */
export async function queueInactiveEmails(
  { prisma, jobs }: Pick<LifecycleDependencies, 'prisma' | 'jobs'>,
  now: Date = new Date(),
): Promise<number> {
  const away = await prisma.user.findMany({
    where: {
      isDemo: false,
      lastActiveAt: {
        lte: new Date(now.getTime() - INACTIVE_AFTER_DAYS * DAY_MS),
        gt: new Date(now.getTime() - INACTIVE_UNTIL_DAYS * DAY_MS),
      },
    },
    select: {
      id: true,
      lastActiveAt: true,
      preferences: true,
      lifecycleEmails: { where: { kind: 'inactive' }, select: { periodKey: true } },
    },
  });
  let queued = 0;
  for (const user of away) {
    // Turned off: not queued at all, or it would be queued again every hour.
    if (!user.lastActiveAt || !readAccountPreferences(user.preferences).productEmails) continue;
    const periodKey = user.lastActiveAt.toISOString().slice(0, 10);
    if (user.lifecycleEmails.some((sent) => sent.periodKey === periodKey)) continue;
    await queueLifecycleEmail(jobs, { userId: user.id, kind: 'inactive', periodKey });
    queued += 1;
  }
  return queued;
}

/** Queues lifecycle emails as things happen, and sends them from the queue. */
export function registerLifecycle(deps: LifecycleDependencies & { events: EventBus }): void {
  const { prisma, jobs, events } = deps;

  jobs.handle('lifecycle.send', async (job) => {
    await sendLifecycleEmail(deps, job);
  });

  events.on('account.created', async ({ userId }) => {
    await queueLifecycleEmail(jobs, { userId, kind: 'welcome', periodKey: '' });
  });

  events.on('form.published', async ({ formId, userId }) => {
    if (await alreadySent(prisma, { userId, kind: 'first_form_published', periodKey: '' })) return;
    await queueLifecycleEmail(jobs, {
      userId,
      kind: 'first_form_published',
      periodKey: '',
      formId,
    });
  });

  events.on('submission.created', async ({ formId }) => {
    const form = await prisma.form.findUnique({
      where: { id: formId },
      select: { createdById: true },
    });
    const userId = form?.createdById;
    if (!userId) return;
    if (await alreadySent(prisma, { userId, kind: 'first_response', periodKey: '' })) return;
    await queueLifecycleEmail(jobs, { userId, kind: 'first_response', periodKey: '', formId });
  });
}
