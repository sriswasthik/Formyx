import { DATA_REQUEST_LABELS, type AdminDataRequest } from '@formyx/shared';
import { useQuery } from '@tanstack/react-query';
import { FileLock } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBillingDate } from '@/features/billing/billing-format';
import { getAdminDataRequests, privacyKeys } from './privacy-api';

const STATUS_VARIANT: Record<AdminDataRequest['status'], 'neutral' | 'success' | 'danger'> = {
  OPEN: 'neutral',
  DONE: 'success',
  CANCELLED: 'neutral',
  FAILED: 'danger',
};

const STATUS_LABEL: Record<AdminDataRequest['status'], string> = {
  OPEN: 'Open',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
  FAILED: 'Failed',
};

/** `{ responses: 2, workspacesDeleted: 1 }` as "responses 2 · workspaces deleted 1". */
function detailsLine(details: AdminDataRequest['details']): string {
  return Object.entries(details)
    .filter(([key]) => key !== 'scheduledFor')
    .map(([key, value]) => `${key.replace(/([A-Z])/g, ' $1').toLowerCase()} ${String(value)}`)
    .join(' · ');
}

/** Formyx admins' log of requests about personal data (exports, deletions, respondents'). */
export function DataRequestsLog() {
  const requests = useQuery({ queryKey: privacyKeys.adminRequests, queryFn: getAdminDataRequests });

  if (requests.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading data requests" className="flex flex-col gap-2">
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
      </div>
    );
  }
  if (requests.isError) {
    return (
      <ErrorState
        title="Could not load data requests"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void requests.refetch();
            }}
          >
            Try again
          </Button>
        }
      />
    );
  }
  if (requests.data.length === 0) {
    return (
      <EmptyState
        icon={FileLock}
        title="No data requests yet"
        description="Exports, account deletions and respondents’ requests show up here."
      />
    );
  }
  return (
    <ul className="flex flex-col divide-y rounded-xl border">
      {requests.data.map((entry) => (
        <li
          key={entry.id}
          className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-14 font-medium">{DATA_REQUEST_LABELS[entry.kind]}</span>
            <span className="text-13 break-words text-muted-foreground tabular-nums">
              {entry.requester?.email ?? 'Deleted account'} · {formatBillingDate(entry.createdAt)}
              {detailsLine(entry.details) && ` · ${detailsLine(entry.details)}`}
            </span>
          </div>
          <Badge variant={STATUS_VARIANT[entry.status]} className="self-start sm:self-auto">
            {STATUS_LABEL[entry.status]}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
