import { REPORT_REASON_LABELS, type AdminFormAction, type AdminFormReview } from '@formyx/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/error-state';
import { FormStatusBadge } from '@/features/forms/form-status-badge';
import { publicFormPath } from '@/features/forms/form-paths';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBillingDate } from '@/features/billing/billing-format';
import { changeErrorMessage } from '@/lib/api';
import { actOnForm, getFormReview, setUserSuspended } from './admin-api';
import { reviewKeys } from './review-keys';
import { describePath } from './review-paths';

const ACTION_LABELS: Record<AdminFormAction, string> = {
  approve: 'Approve',
  dismiss_reports: 'Dismiss reports',
  unpublish: 'Unpublish',
  suspend: 'Suspend form',
  restore: 'Restore as draft',
};

const ACTION_DONE: Record<AdminFormAction, string> = {
  approve: 'Approved: the form is live',
  dismiss_reports: 'Reports dismissed',
  unpublish: 'Unpublished: back to a draft',
  suspend: 'Form suspended',
  restore: 'Restored as a draft',
};

/** Which actions make sense for the form as it is. */
function actionsFor(review: AdminFormReview): AdminFormAction[] {
  switch (review.status) {
    case 'UNDER_REVIEW':
      return ['approve', 'unpublish', 'suspend'];
    case 'PUBLISHED':
    case 'CLOSED':
      return [
        ...(review.openReports > 0 ? (['dismiss_reports'] as const) : []),
        'unpublish',
        'suspend',
      ];
    case 'SUSPENDED':
      return ['restore'];
    case 'DRAFT':
      return ['suspend'];
  }
}

/** One form's review: what was found and reported, and the decision. */
export function FormReviewPanel({ formId }: { formId: string }) {
  const queryClient = useQueryClient();
  const id = useId();
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState<'suspend' | 'suspend_user' | null>(null);
  const review = useQuery({
    queryKey: reviewKeys.form(formId),
    queryFn: () => getFormReview(formId),
  });

  const refresh = (next?: AdminFormReview) => {
    if (next) queryClient.setQueryData(reviewKeys.form(formId), next);
    void queryClient.invalidateQueries({ queryKey: reviewKeys.queue });
  };
  const act = useMutation({
    mutationFn: (action: AdminFormAction) => actOnForm(formId, action, note.trim() || undefined),
    onSuccess: (next, action) => {
      setNote('');
      refresh(next);
      toast.success(ACTION_DONE[action]);
    },
    onError: (error) => {
      toast.error('Could not do that', { description: changeErrorMessage(error) });
    },
  });
  const suspendUser = useMutation({
    mutationFn: ({ userId, suspended }: { userId: string; suspended: boolean }) =>
      setUserSuspended(userId, suspended, note.trim() || undefined),
    onSuccess: (_, { suspended }) => {
      setNote('');
      void queryClient.invalidateQueries({ queryKey: reviewKeys.form(formId) });
      refresh();
      toast.success(suspended ? 'Account suspended' : 'Account reinstated');
    },
    onError: (error) => {
      toast.error('Could not change the account', { description: changeErrorMessage(error) });
    },
  });

  if (review.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading the form">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }
  if (review.isError) {
    return (
      <ErrorState
        title="Could not load this form"
        action={
          <Button variant="secondary" onClick={() => void review.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  const form = review.data;
  const busy = act.isPending || suspendUser.isPending;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="truncate">{form.title}</CardTitle>
            <FormStatusBadge status={form.status} />
          </div>
          <CardDescription>
            {form.workspace.name}
            {form.creator && (
              <>
                {' · '}
                {form.creator.email}, joined {formatBillingDate(form.creator.createdAt)}
                {form.creator.suspended && (
                  <Badge variant="danger" className="ml-2">
                    Suspended
                  </Badge>
                )}
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-14">
          {form.reasons.length > 0 && (
            <p>
              <span className="font-medium">Held because it </span>
              {form.reasons.join(', ')}.
            </p>
          )}
          {form.matches.length > 0 && (
            <ul className="flex flex-col gap-2">
              {form.matches.map((match, index) => (
                <li key={`${match.path}-${String(index)}`} className="rounded-lg border px-3 py-2">
                  <span className="text-13 text-muted-foreground">
                    {describePath(match.path)} · {match.label}
                  </span>
                  <p className="mt-0.5 break-words">{match.excerpt}</p>
                </li>
              ))}
            </ul>
          )}
          {form.unsafeLinks.length > 0 && (
            <ul className="flex flex-col gap-1">
              {form.unsafeLinks.map((link) => (
                <li key={link.url} className="break-all">
                  <span className="font-medium">{link.url}</span>{' '}
                  <span className="text-muted-foreground">{link.reason}</span>
                </li>
              ))}
            </ul>
          )}
          <a
            href={publicFormPath(form.slug)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1.5 text-accent underline-offset-4 hover:underline"
          >
            Open its public link
            <ExternalLink aria-hidden />
          </a>
        </CardContent>
      </Card>

      {form.reports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Reports{' '}
              <span className="text-muted-foreground tabular-nums">{form.reports.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3 text-14">
              {form.reports.map((report) => (
                <li key={report.id}>
                  <span className="font-medium">{REPORT_REASON_LABELS[report.reason]}</span>{' '}
                  <span className="text-13 text-muted-foreground">
                    {formatBillingDate(report.createdAt)}
                  </span>
                  {report.details && (
                    <p className="mt-0.5 text-muted-foreground">{report.details}</p>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {form.questions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>What it asks</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-14">
              {form.questions.map((question, index) => (
                <li key={`${String(index)}-${question}`}>{question}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Decision</CardTitle>
          <CardDescription>Logged with your name and the note.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-note`}>Note (optional)</Label>
            <Input
              id={`${id}-note`}
              maxLength={500}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {actionsFor(form).map((action) => (
              <Button
                key={action}
                variant={action === 'approve' || action === 'restore' ? 'primary' : 'secondary'}
                disabled={busy}
                onClick={() => {
                  if (action === 'suspend') setConfirm('suspend');
                  else act.mutate(action);
                }}
              >
                {ACTION_LABELS[action]}
              </Button>
            ))}
            {form.creator && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  if (form.creator?.suspended) {
                    suspendUser.mutate({ userId: form.creator.id, suspended: false });
                  } else {
                    setConfirm('suspend_user');
                  }
                }}
              >
                {form.creator.suspended ? 'Reinstate creator' : 'Suspend creator'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {form.history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-14">
              {form.history.map((entry, index) => (
                <li key={`${entry.createdAt}-${String(index)}`}>
                  <span className="font-medium">{entry.action}</span>{' '}
                  <span className="text-13 text-muted-foreground">
                    {entry.adminName ?? 'An admin'}, {formatBillingDate(entry.createdAt)}
                  </span>
                  {entry.note && <p className="text-muted-foreground">{entry.note}</p>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === 'suspend_user' ? 'Suspend this account?' : 'Suspend this form?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'suspend_user'
                ? 'They are signed out and can’t sign in, and every form they made shows as unavailable. You can reinstate them later.'
                : 'Its link shows that it is unavailable, and its creator can’t publish it again. You can restore it later.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm === 'suspend_user' && form.creator) {
                  suspendUser.mutate({ userId: form.creator.id, suspended: true });
                } else if (confirm === 'suspend') {
                  act.mutate('suspend');
                }
                setConfirm(null);
              }}
            >
              Suspend
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
