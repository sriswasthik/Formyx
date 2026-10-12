import type { JobFailureView } from '@formyx/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleX, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { changeErrorMessage } from '@/lib/api';
import { formatDateTime, formatRelativeTime } from '@/lib/relative-time';
import { useNow } from '@/lib/use-now';
import { dismissFailedJob, integrationKeys, retryFailedJob } from './integrations-api';

/**
 * Background jobs that ran out of tries (an email, a webhook delivery, a row for a sheet),
 * with what went wrong. Retry sends one again; Dismiss takes it off the list.
 */
export function FailedJobs({ formId, failures }: { formId: string; failures: JobFailureView[] }) {
  const queryClient = useQueryClient();
  const now = useNow(30_000);
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'retry' | 'dismiss' }) =>
      action === 'retry' ? retryFailedJob(formId, id) : dismissFailedJob(formId, id),
    onSuccess: (_result, { action }) => {
      void queryClient.invalidateQueries({ queryKey: integrationKeys.overview(formId) });
      toast.success(action === 'retry' ? 'Trying it again' : 'Dismissed');
    },
    onError: (error) => {
      toast.error('Could not do that', { description: changeErrorMessage(error) });
    },
  });

  if (failures.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border bg-card px-5 py-4 text-13 text-muted-foreground sm:px-6">
        <CircleCheck aria-hidden className="text-success" />
        Nothing has failed. Jobs that still fail after their last try show up here.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-xl border bg-card" aria-label="Failed jobs">
      {failures.map((failure) => (
        <li
          key={failure.id}
          className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6"
        >
          <div className="flex min-w-0 gap-2.5">
            <CircleX aria-hidden className="mt-0.5 shrink-0 text-danger" />
            <div className="min-w-0">
              <p className="text-14 font-medium">{failure.summary}</p>
              <p className="text-13 break-words text-danger-text">{failure.error}</p>
              <p className="text-12 text-muted-foreground tabular-nums">
                {failure.attempts === 1 ? 'Tried once' : `Tried ${failure.attempts} times`}, last{' '}
                <time dateTime={failure.createdAt} title={formatDateTime(failure.createdAt)}>
                  {formatRelativeTime(failure.createdAt, now)}
                </time>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2 pl-6.5 sm:pl-0">
            <Button
              variant="secondary"
              size="sm"
              disabled={act.isPending}
              onClick={() => {
                act.mutate({ id: failure.id, action: 'retry' });
              }}
            >
              <RotateCw aria-hidden />
              Retry
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={act.isPending}
              onClick={() => {
                act.mutate({ id: failure.id, action: 'dismiss' });
              }}
            >
              Dismiss
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
