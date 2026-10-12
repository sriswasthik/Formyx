import { readWorkspacePreferences } from '@formyx/shared';
import type { Env } from '../config/env.js';
import type { JobQueue } from '../jobs/queue.js';
import type { Encryption } from '../lib/encryption.js';
import type { Database } from '../lib/prisma.js';
import type { BillingEmailContext } from '../notifications/billing-email.js';
import { queueEmails } from '../notifications/email-jobs.js';
import type { RenderedEmail } from '../notifications/email-layout.js';

/*
 * Billing emails go to a workspace's owners once per kind and period ("trial_reminder_7" for
 * the trial ending on a day, "usage_100" for a billing period), however often the hourly job
 * or a webhook asks. The email service also drops repeats of the same key, which covers two
 * senders racing.
 */

export interface NoticeDependencies {
  prisma: Database;
  jobs: JobQueue;
  encryption: Encryption;
  env: Pick<Env, 'APP_URL'>;
}

/** The billing settings page of a workspace. */
export function billingUrl(appUrl: string, workspaceId: string): string {
  return `${appUrl}/app/settings/billing?workspace=${encodeURIComponent(workspaceId)}`;
}

/** Emails the workspace's owners, unless this notice went out already. True if it was sent now. */
export async function sendBillingNotice(
  deps: NoticeDependencies,
  {
    workspaceId,
    kind,
    periodKey,
    render,
  }: {
    workspaceId: string;
    kind: string;
    periodKey: string;
    render: (context: BillingEmailContext) => RenderedEmail;
  },
): Promise<boolean> {
  const { prisma } = deps;
  const sent = await prisma.billingNotice.findUnique({
    where: { workspaceId_kind_periodKey: { workspaceId, kind, periodKey } },
    select: { id: true },
  });
  if (sent) return false;

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      name: true,
      preferences: true,
      memberships: {
        where: { role: 'OWNER' },
        select: { user: { select: { email: true, isDemo: true } } },
      },
    },
  });
  if (!workspace) return false;
  // The shared demo account never gets email.
  const owners = workspace.memberships
    .filter(({ user }) => !user.isDemo)
    .map(({ user }) => user.email);
  const email = render({
    workspaceName: workspace.name,
    billingUrl: billingUrl(deps.env.APP_URL, workspaceId),
    timeZone: readWorkspacePreferences(workspace.preferences).timeZone,
  });
  await queueEmails(deps.jobs, deps.encryption, {
    formId: null,
    kind: 'billing',
    messages: owners.map((to) => ({ to, ...email })),
    idempotencyKey: `billing:${workspaceId}:${kind}:${periodKey}`,
  });
  await prisma.billingNotice.createMany({
    data: [{ workspaceId, kind, periodKey }],
    skipDuplicates: true,
  });
  return true;
}
