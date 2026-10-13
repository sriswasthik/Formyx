import { PLAN_LABELS, type EnforcementMode, type Plan } from '@formyx/shared';
import {
  button,
  COLOR,
  emailPage,
  escapeHtml,
  heading,
  paragraph as p,
  singleLine,
  type RenderedEmail,
} from './email-layout.js';
import { lifecycleFooter } from './lifecycle-email.js';

/*
 * Emails to a workspace's owners about its plan: the trial ending, a payment that failed, a
 * plan that ended and usage nearing its limit. Each points to the billing settings.
 */

export interface BillingEmailContext {
  workspaceName: string;
  /** The workspace's billing settings page. */
  billingUrl: string;
  /** For dates; the workspace's own time zone. */
  timeZone: string;
  /** For reminders people may turn off (see `sendBillingNotice`): their own link to do so. */
  unsubscribeUrl?: string | undefined;
}

function formatDate(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
  }
}

function render(
  context: BillingEmailContext,
  {
    subject,
    title,
    lines,
    action,
  }: { subject: string; title: string; lines: string[]; action: string },
): RenderedEmail {
  const workspace = singleLine(context.workspaceName);
  const reason = `You get this email because you own ${workspace} on Formyx.`;
  const footer = context.unsubscribeUrl
    ? lifecycleFooter(context.unsubscribeUrl, reason)
    : { text: reason, html: escapeHtml(reason) };
  const text = [
    title,
    '',
    ...lines.flatMap((line) => [line, '']),
    `${action}: ${context.billingUrl}`,
    '',
    footer.text,
  ].join('\n');
  const html = emailPage({
    subject,
    preheader: lines[0] ?? title,
    card: `${p(`font-size:13px;line-height:20px;color:${COLOR.muted};`, escapeHtml(workspace))}
        ${heading(title)}
        ${lines
          .map((line) =>
            p(
              `font-size:14px;line-height:21px;color:${COLOR.text};margin-top:12px;`,
              escapeHtml(line),
            ),
          )
          .join('\n        ')}
        ${button(action, context.billingUrl)}`,
    footer: footer.html,
  });
  return { subject, html, text };
}

/** Days before a trial ends. */
export function renderTrialReminderEmail(
  context: BillingEmailContext,
  { daysLeft, trialEndsAt, plan }: { daysLeft: number; trialEndsAt: Date; plan: Plan },
): RenderedEmail {
  const days = daysLeft === 1 ? '1 day' : `${String(daysLeft)} days`;
  const label = PLAN_LABELS[plan];
  return render(context, {
    subject: `Your ${label} trial ends in ${days}`,
    title: `${days} left of your ${label} trial`,
    lines: [
      `Your free trial of Formyx ${label} ends on ${formatDate(trialEndsAt, context.timeZone)}.`,
      `Upgrade before then to keep everything as it is. Otherwise the workspace moves to the Free plan: your forms keep working and nothing is deleted, but ${label} features like premium fonts and integrations switch off.`,
    ],
    action: 'Choose a plan',
  });
}

/** A trial ended without a subscription. */
export function renderTrialEndedEmail(
  context: BillingEmailContext,
  { plan }: { plan: Plan },
): RenderedEmail {
  const label = PLAN_LABELS[plan];
  return render(context, {
    subject: `Your ${label} trial has ended`,
    title: 'Your workspace is on the Free plan',
    lines: [
      `Your free trial of Formyx ${label} has ended, so the workspace moved to the Free plan.`,
      `Your forms keep working and nothing was deleted. Forms that used ${label} features now show the closest free options. The billing page lists what changed, and upgrading brings it all back.`,
    ],
    action: 'See what changed',
  });
}

/** A renewal failed; the plan keeps working until `graceEndsAt`. */
export function renderPaymentFailedEmail(
  context: BillingEmailContext,
  { plan, graceEndsAt }: { plan: Plan; graceEndsAt: Date },
): RenderedEmail {
  const label = PLAN_LABELS[plan];
  return render(context, {
    subject: `We couldn't renew your ${label} plan`,
    title: 'Your payment didn’t go through',
    lines: [
      `We couldn't charge your payment method for Formyx ${label}. Razorpay will try again over the next few days.`,
      `${label} keeps working until ${formatDate(graceEndsAt, context.timeZone)}. Check or change your payment method before then to keep it.`,
    ],
    action: 'Check your payment',
  });
}

/** A paid plan ended: cancelled, completed, or its grace period ran out. */
export function renderPlanEndedEmail(
  context: BillingEmailContext,
  { plan, reason }: { plan: Plan; reason: 'cancelled' | 'unpaid' | 'complimentary' },
): RenderedEmail {
  const label = PLAN_LABELS[plan];
  const why =
    reason === 'unpaid'
      ? `We couldn't collect the payment for Formyx ${label}, so the workspace moved to the Free plan.`
      : reason === 'complimentary'
        ? `The complimentary Formyx ${label} plan you were given has ended, so the workspace moved to the Free plan.`
        : `Your Formyx ${label} plan has ended, so the workspace moved to the Free plan.`;
  return render(context, {
    subject: `Your workspace is now on the Free plan`,
    title: `${label} has ended`,
    lines: [
      why,
      `Your forms keep working and nothing was deleted. Forms that used ${label} features now show the closest free options, and the billing page lists what changed. Upgrading brings it all back.`,
    ],
    action: 'See what changed',
  });
}

/** Responses this period crossed 80% or 100% of the plan's limit. */
export function renderUsageWarningEmail(
  context: BillingEmailContext,
  {
    used,
    limit,
    threshold,
    enforcement,
    periodEnd,
  }: {
    used: number;
    limit: number;
    threshold: number;
    enforcement: EnforcementMode;
    periodEnd: Date;
  },
): RenderedEmail {
  const count = new Intl.NumberFormat('en-IN');
  const resets = `The count starts again on ${formatDate(periodEnd, context.timeZone)}.`;
  const full = threshold >= 1;
  const after =
    enforcement === 'hard'
      ? 'Your forms now tell new visitors they aren’t taking responses. Anyone already filling one in can still send it.'
      : 'Your forms still accept responses and none are lost, but please upgrade to stay within your plan.';
  return render(context, {
    subject: full
      ? 'Your forms have reached this month’s response limit'
      : `Your forms have used ${String(Math.round(threshold * 100))}% of this month’s responses`,
    title: full ? 'Response limit reached' : 'Nearing your response limit',
    lines: [
      `Your workspace has received ${count.format(used)} of the ${count.format(limit)} responses your plan includes this period.`,
      full ? after : 'Upgrade for more responses before you reach the limit.',
      resets,
    ],
    action: 'See plans',
  });
}
