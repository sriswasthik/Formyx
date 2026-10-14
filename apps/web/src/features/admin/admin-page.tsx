import { PLAN_LABELS, type AdminWorkspace } from '@formyx/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Building2, Search, ShieldAlert } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/features/auth/session-context';
import { formatBillingDate } from '@/features/billing/billing-format';
import { cn } from '@/lib/utils';
import { searchWorkspaces } from './admin-api';
import { WorkspaceActions } from './workspace-actions';

const adminKeys = {
  search: (query: string) => ['admin', 'workspaces', query] as const,
};

/** Where a workspace's billing stands, in a few words. */
function billingLine(workspace: AdminWorkspace): string {
  const parts = [
    `${PLAN_LABELS[workspace.plan]} (${workspace.planStatus.toLowerCase().replace('_', ' ')})`,
  ];
  if (workspace.trialEndsAt) parts.push(`trial until ${formatBillingDate(workspace.trialEndsAt)}`);
  if (workspace.graceEndsAt) parts.push(`grace until ${formatBillingDate(workspace.graceEndsAt)}`);
  if (workspace.complimentaryPlan && workspace.complimentaryUntil) {
    parts.push(
      `${PLAN_LABELS[workspace.complimentaryPlan]} given until ${formatBillingDate(workspace.complimentaryUntil)}`,
    );
  }
  if (workspace.subscription) {
    parts.push(
      `subscription ${workspace.subscription.status}${workspace.subscription.cancelAtPeriodEnd ? ', ending' : ''}`,
    );
  }
  return parts.join(' · ');
}

/** Formyx's own admin tools: find a workspace, see its billing, give a plan or more trial. */
export function AdminPage() {
  const { user } = useSession();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const results = useQuery({
    queryKey: adminKeys.search(deferredQuery),
    queryFn: () => searchWorkspaces(deferredQuery),
    enabled: user.isAdmin === true,
    placeholderData: keepPreviousData,
  });

  if (!user.isAdmin) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="This page is for Formyx admins"
        description="Your account doesn’t have access to it."
      />
    );
  }

  const selected = results.data?.find((workspace) => workspace.id === selectedId);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-md flex-col gap-1.5">
        <Label htmlFor="admin-search">Find a workspace</Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="admin-search"
            type="search"
            className="pl-9"
            placeholder="Name, slug or an owner’s email"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="Workspaces">
          {results.isPending ? (
            <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading workspaces">
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
            </div>
          ) : results.isError ? (
            <ErrorState
              title="Could not search workspaces"
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    void results.refetch();
                  }}
                >
                  Try again
                </Button>
              }
            />
          ) : results.data.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No workspaces found"
              description="Try part of a name or an email."
            />
          ) : (
            <ul className="flex flex-col divide-y rounded-xl border">
              {results.data.map((workspace) => (
                <li key={workspace.id}>
                  <button
                    type="button"
                    aria-pressed={workspace.id === selectedId}
                    onClick={() => {
                      setSelectedId(workspace.id);
                    }}
                    className={cn(
                      'flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors duration-150 ease-standard',
                      'hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
                      workspace.id === selectedId && 'bg-pressed',
                    )}
                  >
                    <span className="flex items-center gap-2 text-14 font-medium">
                      {workspace.name}
                      <Badge variant="outline">{PLAN_LABELS[workspace.effectivePlan]}</Badge>
                    </span>
                    <span className="text-13 text-muted-foreground">
                      {workspace.owners.map((owner) => owner.email).join(', ') || 'No owner'} ·{' '}
                      <span className="tabular-nums">{workspace.forms}</span> forms
                    </span>
                    <span className="text-13 text-muted-foreground">{billingLine(workspace)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="Selected workspace">
          {selected ? (
            <WorkspaceActions key={selected.id} workspace={selected} query={deferredQuery} />
          ) : (
            <p className="rounded-xl border px-5 py-4 text-14 text-muted-foreground">
              Choose a workspace to give it a plan or more trial.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
