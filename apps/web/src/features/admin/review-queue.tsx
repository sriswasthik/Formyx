import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FormStatusBadge } from '@/features/forms/form-status-badge';
import { cn } from '@/lib/utils';
import { getReviewQueue } from './admin-api';
import { FormReviewPanel } from './form-review-panel';
import { reviewKeys } from './review-keys';

/** Forms held when published or reported by visitors, and the one being looked at. */
export function ReviewQueue() {
  const queue = useQuery({ queryKey: reviewKeys.queue, queryFn: getReviewQueue });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (queue.isPending) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading the review queue">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
    );
  }
  if (queue.isError) {
    return (
      <ErrorState
        title="Could not load the review queue"
        action={
          <Button variant="secondary" onClick={() => void queue.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }
  if (queue.data.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Nothing to review"
        description="Held and reported forms show up here."
      />
    );
  }

  const selected = queue.data.find((item) => item.formId === selectedId) ?? queue.data[0];
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_28rem]">
      <section aria-label="Forms to review">
        <ul className="flex flex-col divide-y rounded-xl border">
          {queue.data.map((item) => (
            <li key={item.formId}>
              <button
                type="button"
                aria-pressed={item.formId === selected?.formId}
                onClick={() => {
                  setSelectedId(item.formId);
                }}
                className={cn(
                  'flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors duration-150 ease-standard',
                  'hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
                  item.formId === selected?.formId && 'bg-pressed',
                )}
              >
                <span className="flex items-center gap-2 text-14 font-medium">
                  <span className="truncate">{item.title}</span>
                  <FormStatusBadge status={item.status} />
                  {item.openReports > 0 && (
                    <Badge variant="outline" className="tabular-nums">
                      {item.openReports} {item.openReports === 1 ? 'report' : 'reports'}
                    </Badge>
                  )}
                </span>
                <span className="text-13 text-muted-foreground">
                  {item.creator?.email ?? 'Creator left'} · {item.workspace.name}
                </span>
                {item.reasons.length > 0 && (
                  <span className="text-13 text-muted-foreground">{item.reasons.join(', ')}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Selected form">
        {selected && <FormReviewPanel key={selected.formId} formId={selected.formId} />}
      </section>
    </div>
  );
}
