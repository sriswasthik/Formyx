import { PLAN_LABELS, ROLE_LABELS, type Entitlements, type Role } from '@formyx/shared';
import { daysLeft } from '@/features/billing/billing-format';

/** "21 days left", "1 day left" or "Ends today". */
export function daysLeftLabel(days: number): string {
  if (days <= 0) return 'Ends today';
  return `${String(days)} ${days === 1 ? 'day' : 'days'} left`;
}

/**
 * The line under the workspace's name: its plan where plans are enforced ("Pro trial · 21 days
 * left", "Free"), otherwise the member's role, which is what changes what they can do there.
 */
export function workspacePlanLabel(
  entitlements: Entitlements | undefined,
  role: Role,
  now: Date = new Date(),
): string {
  if (entitlements?.mode !== 'enforced') return ROLE_LABELS[role];
  if (entitlements.planStatus === 'TRIALING' && entitlements.trialEndsAt) {
    const label = `${PLAN_LABELS[entitlements.plan]} trial`;
    return `${label} · ${daysLeftLabel(daysLeft(entitlements.trialEndsAt, now))}`;
  }
  return PLAN_LABELS[entitlements.effectivePlan];
}
