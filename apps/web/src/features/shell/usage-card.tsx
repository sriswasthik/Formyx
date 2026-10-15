import { PLAN_LABELS, TRIAL_DAYS } from '@formyx/shared';
import { X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { daysLeft } from '@/features/billing/billing-format';
import { useBilling } from '@/features/billing/use-billing';
import { useWorkspaceEntitlements } from '@/features/entitlements/use-entitlements';
import { useActiveWorkspace } from '@/features/workspaces/use-active-workspace';
import { daysLeftLabel } from './plan-label';

const DISMISSED_KEY = 'formyx-usage-card-dismissed';

function readDismissed(workspaceId: string): boolean {
  try {
    return sessionStorage.getItem(`${DISMISSED_KEY}:${workspaceId}`) === '1';
  } catch {
    return false;
  }
}

function storeDismissed(workspaceId: string): void {
  try {
    sessionStorage.setItem(`${DISMISSED_KEY}:${workspaceId}`, '1');
  } catch {
    // Not remembering it is fine: it shows again on the next page load.
  }
}

interface Usage {
  title: string;
  detail: string;
  /** How far along, 0 to 1, if known. */
  share: number | null;
}

/**
 * A small card above the sidebar's footer on a trial or the free plan, where plans are
 * enforced: how much is used and the way to upgrade (for owners). Hidden for the rest of the
 * session once dismissed.
 */
export function UsageCard({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const workspace = useActiveWorkspace();
  const { entitlements, getLimit } = useWorkspaceEntitlements(workspace?.id);
  const owner = workspace?.role === 'OWNER';
  const enforced = entitlements?.mode === 'enforced';
  const trialing = entitlements?.planStatus === 'TRIALING' && entitlements.trialEndsAt !== null;
  const free = entitlements?.effectivePlan === 'FREE' && !trialing;
  const billing = useBilling(workspace?.id, { enabled: owner && enforced && free });
  const [dismissed, setDismissed] = useState(() =>
    workspace ? readDismissed(workspace.id) : false,
  );

  if (!workspace || !entitlements || !enforced || dismissed || !(trialing || free)) return null;

  let usage: Usage;
  if (trialing && entitlements.trialEndsAt) {
    const left = daysLeft(entitlements.trialEndsAt);
    const total = Math.max(TRIAL_DAYS, left);
    usage = {
      title: `${PLAN_LABELS[entitlements.plan]} trial`,
      detail: daysLeftLabel(left),
      share: (total - left) / total,
    };
  } else {
    const responses = billing.data?.usage.responses;
    const limit = responses?.limit ?? getLimit('responses_per_month');
    usage = {
      title: `${PLAN_LABELS.FREE} plan`,
      detail:
        responses && limit !== null
          ? `${String(responses.used)} of ${String(limit)} responses this month`
          : limit !== null
            ? `${String(limit)} responses a month`
            : 'Responses without a limit',
      share: responses && limit ? Math.min(1, responses.used / limit) : null,
    };
  }

  return (
    <section
      aria-label="Your plan"
      className="relative rounded-lg border bg-background p-3 text-13"
    >
      <button
        type="button"
        aria-label="Hide for now"
        onClick={() => {
          storeDismissed(workspace.id);
          setDismissed(true);
        }}
        className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-standard hover:bg-hover hover:text-foreground"
      >
        <X className="size-3.5" aria-hidden />
      </button>
      <p className="pr-6 font-medium">{usage.title}</p>
      <p className="mt-0.5 text-12 text-muted-foreground tabular-nums">{usage.detail}</p>
      {usage.share !== null && (
        <div
          role="progressbar"
          aria-label={usage.title}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(usage.share * 100)}
          className="mt-2.5 h-1 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-foreground/70"
            style={{ width: `${String(Math.round(usage.share * 100))}%` }}
          />
        </div>
      )}
      {owner && (
        <Link
          to="/app/settings/billing"
          onClick={onNavigate}
          className="mt-2.5 inline-block rounded-sm text-12 font-medium text-accent hover:underline"
        >
          Upgrade
        </Link>
      )}
    </section>
  );
}
