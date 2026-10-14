import { usagePeriod, type Entitlements, type Usage, type UsagePeriod } from '@formyx/shared';
import type { Database } from '../lib/prisma.js';

/*
 * What a workspace has used: responses in the current usage period (its paid billing period,
 * or the calendar month), counted from the responses themselves so the count can't drift, and
 * the bytes of files respondents uploaded.
 */

/** The billing period of the workspace's subscription, if one is running. */
export async function currentBillingPeriod(
  prisma: Database,
  workspaceId: string,
): Promise<{ start: Date | null; end: Date | null } | null> {
  const subscription = await prisma.subscription.findFirst({
    where: { workspaceId, status: { in: ['ACTIVE', 'PENDING', 'HALTED'] } },
    orderBy: { createdAt: 'desc' },
    select: { currentPeriodStart: true, currentPeriodEnd: true },
  });
  return subscription
    ? { start: subscription.currentPeriodStart, end: subscription.currentPeriodEnd }
    : null;
}

export async function workspaceUsagePeriod(
  prisma: Database,
  workspaceId: string,
  now: Date = new Date(),
): Promise<UsagePeriod> {
  return usagePeriod(await currentBillingPeriod(prisma, workspaceId), now);
}

/** Responses the workspace's forms received in `period`. */
export function countResponses(
  prisma: Database,
  workspaceId: string,
  period: UsagePeriod,
): Promise<number> {
  return prisma.submission.count({
    where: { form: { workspaceId }, createdAt: { gte: period.start, lt: period.end } },
  });
}

/** Bytes of every file respondents uploaded to the workspace's forms, as their answers record. */
export async function storageBytes(prisma: Database, workspaceId: string): Promise<number> {
  // Strict mode, so arrays of files are not walked twice; objects without the keys don't match.
  const [row] = await prisma.$queryRaw<{ bytes: bigint | null }[]>`
    SELECT SUM((file ->> 'size')::bigint) AS bytes
    FROM submissions s
    JOIN forms f ON f.id = s.form_id
    CROSS JOIN LATERAL jsonb_path_query(
      s.answers,
      'strict $.** ? (exists(@.publicId) && exists(@.size))'
    ) AS file
    WHERE f.workspace_id = ${workspaceId}`;
  return Number(row?.bytes ?? 0);
}

export async function workspaceUsage(
  prisma: Database,
  workspaceId: string,
  entitlements: Pick<Entitlements, 'limits'>,
  now: Date = new Date(),
): Promise<Usage> {
  const period = await workspaceUsagePeriod(prisma, workspaceId, now);
  const [responses, bytes] = await Promise.all([
    countResponses(prisma, workspaceId, period),
    storageBytes(prisma, workspaceId),
  ]);
  return {
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    responses: { used: responses, limit: entitlements.limits.responses_per_month },
    storageBytes: { used: bytes, limit: null },
  };
}
