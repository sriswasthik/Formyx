import type { Database } from '../lib/prisma.js';
import { claimTrial, trialPlan } from './trial.js';

/*
 * For switching a server to ENTITLEMENTS_MODE=enforced: workspaces made while everything was
 * unlocked never started a trial. This gives each one on Free a trial now, one per owner
 * account as for new workspaces (the oldest workspace first), skipping any that pays or was
 * given a plan. Safe to run twice: owners who have had their trial are skipped.
 */

export async function startTrialsForExistingWorkspaces(
  prisma: Database,
  { dryRun = false, now = new Date() }: { dryRun?: boolean; now?: Date } = {},
): Promise<{ started: number; skipped: number }> {
  const workspaces = await prisma.workspace.findMany({
    where: {
      plan: 'FREE',
      planStatus: 'ACTIVE',
      complimentaryPlan: null,
      subscriptions: { none: {} },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      memberships: {
        where: { role: 'OWNER', user: { isDemo: false } },
        orderBy: { createdAt: 'asc' },
        select: { user: { select: { id: true, trialUsedAt: true } } },
      },
    },
  });

  let started = 0;
  let skipped = 0;
  for (const workspace of workspaces) {
    const owner = workspace.memberships.find(({ user }) => user.trialUsedAt === null)?.user;
    if (!owner) {
      skipped += 1;
      continue;
    }
    if (dryRun) {
      started += 1;
      continue;
    }
    const began = await prisma.$transaction(async (tx) => {
      if (!(await claimTrial(tx, owner.id, now))) return false;
      await tx.workspace.update({ where: { id: workspace.id }, data: trialPlan(now) });
      return true;
    });
    if (began) started += 1;
    else skipped += 1;
  }
  return { started, skipped };
}
