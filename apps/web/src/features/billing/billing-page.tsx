import { CreditCard } from 'lucide-react';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspaceEntitlements } from '@/features/entitlements/use-entitlements';
import { useSession } from '@/features/auth/session-context';
import { useActiveWorkspace } from '@/features/workspaces/use-active-workspace';
import { useWorkspaceStore } from '@/features/workspaces/workspace-store';
import { CurrentPlanCard } from './current-plan-card';
import { DowngradeCard } from './downgrade-card';
import { PaymentsCard } from './payments-card';
import { PlansCard } from './plans-card';
import { UsageCard } from './usage-card';
import { useBilling } from './use-billing';

/** Links in billing emails name the workspace (`?workspace=`): open that one, if it is yours. */
function useWorkspaceFromLink() {
  const [searchParams] = useSearchParams();
  const { workspaces } = useSession();
  const setActive = useWorkspaceStore((state) => state.setActiveWorkspaceId);
  const linked = searchParams.get('workspace');
  useEffect(() => {
    if (linked && workspaces.some((workspace) => workspace.id === linked)) setActive(linked);
  }, [linked, workspaces, setActive]);
}

/** The active workspace's plan, usage, plans to choose from and payments. Owners only. */
export function BillingPage() {
  useWorkspaceFromLink();
  const workspace = useActiveWorkspace();
  const owner = workspace?.role === 'OWNER';
  const { entitlements } = useWorkspaceEntitlements(workspace?.id);
  const billing = useBilling(workspace?.id, { enabled: owner });

  if (!workspace || !owner) {
    return (
      <EmptyState
        icon={CreditCard}
        title="Billing is for workspace owners"
        description="Ask an owner of this workspace if you need to change its plan."
      />
    );
  }
  if (billing.isPending) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading billing">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }
  if (billing.isError) {
    return (
      <ErrorState
        title="Could not load billing"
        description="Check your connection and try again."
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void billing.refetch();
            }}
          >
            Try again
          </Button>
        }
      />
    );
  }

  const summary = billing.data;
  return (
    // Remounted per workspace, so a choice made for one never shows in another.
    <div key={workspace.id} className="flex flex-col gap-6">
      {entitlements?.mode === 'all_unlocked' && (
        <p className="rounded-xl border bg-surface px-5 py-4 text-14 text-muted-foreground">
          Every feature is unlocked on this server for now, whatever the plan.
        </p>
      )}
      <CurrentPlanCard workspaceId={workspace.id} summary={summary} />
      {summary.downgrade && (
        <DowngradeCard workspaceId={workspace.id} downgrade={summary.downgrade} />
      )}
      <UsageCard usage={summary.usage} />
      <PlansCard workspaceId={workspace.id} summary={summary} />
      <PaymentsCard workspaceId={workspace.id} />
    </div>
  );
}
