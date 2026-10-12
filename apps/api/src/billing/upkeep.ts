import { TRIAL_REMINDER_DAYS } from '@formyx/shared';
import type { Logger } from 'pino';
import {
  renderPlanEndedEmail,
  renderTrialEndedEmail,
  renderTrialReminderEmail,
} from '../notifications/billing-email.js';
import { endPlan } from './events.js';
import { sendBillingNotice, type NoticeDependencies } from './notices.js';
import { downgradeToFree } from './plan-changes.js';

/*
 * Billing's part of the hourly upkeep: reminders before a trial ends, and moving workspaces to
 * Free when a trial, a grace period or a complimentary plan runs out. What a workspace may use
 * never waits for this (see `effectivePlan`); the job makes it official and tells the owners.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface BillingUpkeepDependencies extends NoticeDependencies {
  logger: Logger;
  now?: () => Date;
}

/** Days left in a trial, rounded up: 2.5 days left is "3 days". */
export function trialDaysLeft(trialEndsAt: Date, now: Date): number {
  return Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS);
}

/**
 * The reminder due when `daysLeft` remain: the nearest of 7, 3 and 1 days at or above it.
 * A reminder missed while the job was down is replaced by the next one, never sent late.
 */
export function dueReminder(daysLeft: number): number | null {
  if (daysLeft < 1) return null;
  const due = [...TRIAL_REMINDER_DAYS].sort((a, b) => a - b).find((days) => daysLeft <= days);
  return due ?? null;
}

export async function runBillingUpkeep(deps: BillingUpkeepDependencies) {
  const { prisma } = deps;
  const now = deps.now?.() ?? new Date();
  const counts = { reminders: 0, trialsEnded: 0, graceEnded: 0, complimentaryEnded: 0 };

  // Reminders for trials ending within the week.
  const ending = await prisma.workspace.findMany({
    where: {
      planStatus: 'TRIALING',
      trialEndsAt: {
        gt: now,
        lte: new Date(now.getTime() + Math.max(...TRIAL_REMINDER_DAYS) * DAY_MS),
      },
    },
    select: { id: true, plan: true, trialEndsAt: true },
  });
  for (const workspace of ending) {
    if (!workspace.trialEndsAt) continue;
    const daysLeft = trialDaysLeft(workspace.trialEndsAt, now);
    const due = dueReminder(daysLeft);
    if (due === null) continue;
    const trialEndsAt = workspace.trialEndsAt;
    const sent = await sendBillingNotice(deps, {
      workspaceId: workspace.id,
      kind: `trial_reminder_${String(due)}`,
      periodKey: trialEndsAt.toISOString(),
      render: (context) =>
        renderTrialReminderEmail(context, { daysLeft, trialEndsAt, plan: workspace.plan }),
    });
    if (sent) counts.reminders += 1;
  }

  // Trials over without a subscription. One bought during the trial starts when it ends, and
  // waits authenticated until Razorpay activates it: that trial is not over, it is paid for.
  const trialsOver = await prisma.workspace.findMany({
    where: {
      planStatus: 'TRIALING',
      trialEndsAt: { lte: now },
      subscriptions: { none: { status: 'AUTHENTICATED' } },
    },
    select: { id: true, trialEndsAt: true },
  });
  for (const workspace of trialsOver) {
    const from = await downgradeToFree(prisma, workspace.id, now);
    if (!from) continue;
    counts.trialsEnded += 1;
    await sendBillingNotice(deps, {
      workspaceId: workspace.id,
      kind: 'trial_ended',
      periodKey: (workspace.trialEndsAt ?? now).toISOString(),
      render: (context) => renderTrialEndedEmail(context, { plan: from }),
    });
  }

  // Grace periods over without a payment.
  const unpaid = await prisma.workspace.findMany({
    where: { planStatus: 'PAST_DUE', graceEndsAt: { lte: now } },
    select: { id: true },
  });
  for (const workspace of unpaid) {
    await endPlan(deps, workspace.id, 'unpaid', now);
    counts.graceEnded += 1;
  }

  // Complimentary plans over: Free, unless the workspace pays for a plan of its own.
  const giftsOver = await prisma.workspace.findMany({
    where: { complimentaryPlan: { not: null }, complimentaryUntil: { lte: now } },
    select: {
      id: true,
      plan: true,
      planStatus: true,
      complimentaryPlan: true,
      complimentaryUntil: true,
    },
  });
  for (const workspace of giftsOver) {
    const gift = workspace.complimentaryPlan;
    if (!gift) continue;
    const paysForOwn = workspace.plan !== 'FREE' && workspace.planStatus !== 'CANCELED';
    await prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        complimentaryPlan: null,
        complimentaryUntil: null,
        ...(!paysForOwn && { downgradedFrom: gift, downgradedAt: now }),
      },
    });
    counts.complimentaryEnded += 1;
    if (paysForOwn) continue;
    await sendBillingNotice(deps, {
      workspaceId: workspace.id,
      kind: 'plan_ended_complimentary',
      periodKey: (workspace.complimentaryUntil ?? now).toISOString(),
      render: (context) => renderPlanEndedEmail(context, { plan: gift, reason: 'complimentary' }),
    });
  }

  return counts;
}
