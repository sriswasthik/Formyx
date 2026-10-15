import {
  FIELD_TYPE_LABELS,
  formResponsesPath,
  hasRole,
  isAnswerableFieldType,
  type FormDetail,
} from '@formyx/shared';
import { Eye, FileQuestion, Inbox, Lock, RotateCw } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router';
import { usePageTitle } from '@/app/page-title';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/features/auth/session-context';
import { ApiRequestError } from '@/lib/api';
import { useNow } from '@/lib/use-now';
import { EditedAt } from './form-card';
import { FormStatusBadge } from './form-status-badge';
import { questionCountLabel, responseCountLabel } from './format';
import { useFormDetail } from './use-forms';

function BackButton() {
  return (
    <Button asChild variant="secondary">
      <Link to="/app/forms">Back to forms</Link>
    </Button>
  );
}

function QuestionList({ form }: { form: FormDetail }) {
  const { fields } = form.draftSchema;

  return (
    <Card>
      <CardHeader>
        <CardTitle id="questions-title">Questions</CardTitle>
      </CardHeader>
      <CardContent>
        <ol aria-labelledby="questions-title" className="flex flex-col divide-y">
          {fields.map((field, index) => (
            <li key={field.id} className="flex items-baseline gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="w-5 shrink-0 text-right text-13 text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 text-14 break-words">
                {field.label || <span className="text-muted-foreground">Untitled question</span>}
                {field.required && (
                  <>
                    <span className="text-danger-text" aria-hidden>
                      {' '}
                      *
                    </span>{' '}
                    <span className="sr-only">(required)</span>
                  </>
                )}
              </span>
              <span className="shrink-0 text-12 text-muted-foreground">
                {FIELD_TYPE_LABELS[field.type]}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function FormDetailSkeleton() {
  return (
    <div role="status" aria-label="Loading form" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-7 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

/** The read-only view of a form, for viewers. Editors are sent on to the editor. */
export function FormDetailPage() {
  const { formId = '' } = useParams();
  const formQuery = useFormDetail(formId);
  const { workspaces } = useSession();
  const now = useNow();
  usePageTitle(formQuery.data?.title);

  if (formQuery.isPending) return <FormDetailSkeleton />;

  if (formQuery.isError) {
    const status = formQuery.error instanceof ApiRequestError ? formQuery.error.status : 0;
    if (status === 404) {
      return (
        <EmptyState
          icon={FileQuestion}
          title="Form not found"
          description="It may have been deleted, or the link is wrong."
          action={<BackButton />}
        />
      );
    }
    if (status === 403) {
      return (
        <EmptyState
          icon={Lock}
          title="You don't have access to this form"
          description="It belongs to a workspace you are not a member of."
          action={<BackButton />}
        />
      );
    }
    return (
      <ErrorState
        title="Could not load this form"
        description="Check your connection and try again."
        action={
          <Button
            disabled={formQuery.isFetching}
            onClick={() => {
              void formQuery.refetch();
            }}
          >
            <RotateCw aria-hidden />
            Try again
          </Button>
        }
      />
    );
  }

  const form = formQuery.data;
  const role = workspaces.find((workspace) => workspace.id === form.workspaceId)?.role;
  // Editors work on forms in the editor; this page is the read-only view.
  if (role && hasRole(role, 'EDITOR')) {
    return <Navigate to={`/app/forms/${form.id}/edit`} replace />;
  }

  const questionCount = form.draftSchema.fields.filter((field) =>
    isAnswerableFieldType(field.type),
  ).length;

  return (
    <div className="flex flex-col gap-6">
      {/* The breadcrumbs above lead back to Forms. */}
      <PageHeader
        title={form.title}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <FormStatusBadge status={form.status} />
            <span>{questionCountLabel(questionCount)}</span>
            <span aria-hidden>·</span>
            <span>{responseCountLabel(form.responseCount)}</span>
            <span aria-hidden>·</span>
            <EditedAt updatedAt={form.updatedAt} now={now} />
          </span>
        }
      />

      <div className="flex flex-col gap-3 rounded-lg border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-14 text-muted-foreground">
          <Eye aria-hidden className="shrink-0" />
          You can view this form. Editors of the workspace can change it.
        </p>
        <Button asChild variant="secondary" size="sm" className="w-fit shrink-0">
          <Link to={formResponsesPath(form.id)}>
            <Inbox aria-hidden />
            View responses
          </Link>
        </Button>
      </div>

      {form.draftSchema.fields.length > 0 && <QuestionList form={form} />}
    </div>
  );
}
