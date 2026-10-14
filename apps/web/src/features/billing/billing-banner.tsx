import { PLAN_LABELS } from '@formyx/shared';
import { AlertTriangle, Info } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useWorkspaceEntitlements } from '@/features/entitlements/use-entitlements';
import { useActiveWorkspace } from '@/features/workspaces/use-active-workspace';
import { cn } from '@/lib/utils';
import { daysLeft, formatBillingDate } from './billing-format';
import { useBilling } from './use-billing';

interface Notice {
  tone: 'info' | 'warning';
  message: string;
  action?: { label: string; to: string };
}

/**
 * One line about the workspace's plan when something needs doing: a payment that failed, the
 * response limit, a downgrade, a trial running out. Only where plans are enforced. Owners get
 * the way to fix it; other members are told who can.
 */
export function BillingBanner() {
  const workspace = useActiveWorkspace();
  const { entitlements } = useWorkspaceEntitlements(workspace?.id);
  const owner = workspace?.role === 'OWNER';
  const billing = useBilling(workspace?.id, {
    enabled: owner && entitlements?.mode === 'enforced',
  });
  if (!workspace || entitlements?.mode !== 'enforced') return null;

  const plan = PLAN_LABELS[entitlements.plan];
  const toBilling = (label: string) => (owner ? { label, to: '/app/settings/billing' } : undefined);
  const askOwner = owner ? '' : ' Ask a workspace owner to sort it out.';
  const usage = billing.data?.usage.responses;
  const usedShare = usage?.limit ? usage.used / usage.limit : 0;

  let notice: Notice | null = null;
  if (entitlements.planStatus === 'PAST_DUE' && entitlements.graceEndsAt) {
    notice = {
      tone: 'warning',
      message: `The last payment didn’t go through. ${plan} keeps working until ${formatBillingDate(entitlements.graceEndsAt)}.${askOwner}`,
      action: toBilling('Check payment'),
    };
  } else if (usage?.limit && usedShare >= 1) {
    notice = {
      tone: 'warning',
      message:
        billing.data?.enforcement === 'hard'
          ? 'Your forms have had all the responses your plan includes this period, so new visitors are being turned away.'
          : 'Your forms have had all the responses your plan includes this period. New ones are still saved.',
      action: toBilling('Upgrade'),
    };
  } else if (billing.data?.downgrade) {
    notice = {
      tone: 'info',
      message: `Your workspace moved to the Free plan. Some forms look or work differently until you upgrade.`,
      action: toBilling('See what changed'),
    };
  } else if (usage?.limit && usedShare >= 0.8) {
    notice = {
      tone: 'info',
      message: `Your forms have used ${String(usage.used)} of the ${String(usage.limit)} responses your plan includes this period.`,
      action: toBilling('See plans'),
    };
  } else if (entitlements.planStatus === 'TRIALING' && entitlements.trialEndsAt) {
    const days = daysLeft(entitlements.trialEndsAt);
    if (days > 0) {
      notice = {
        tone: 'info',
        message: `${days === 1 ? '1 day' : `${String(days)} days`} left in your ${plan} trial.${owner ? '' : ' Ask a workspace owner to upgrade.'}`,
        action: toBilling('Upgrade'),
      };
    }
  }
  if (!notice) return null;

  const Icon = notice.tone === 'warning' ? AlertTriangle : Info;
  return (
    <div
      role="region"
      aria-label="Plan"
      className={cn(
        'flex flex-col gap-2 border-b px-4 py-2.5 text-13 sm:flex-row sm:items-center sm:gap-4 md:px-8 lg:px-10',
        notice.tone === 'warning' ? 'bg-warning/10' : 'bg-accent-subtle',
      )}
    >
      <p className="flex min-w-0 flex-1 gap-2">
        <Icon
          className={cn(
            'mt-0.5 shrink-0',
            notice.tone === 'warning' ? 'text-warning-text' : 'text-accent',
          )}
          aria-hidden
        />
        <span>{notice.message}</span>
      </p>
      {notice.action && (
        <Button asChild size="sm" variant="secondary" className="self-start sm:self-auto">
          <Link to={notice.action.to}>{notice.action.label}</Link>
        </Button>
      )}
    </div>
  );
}
