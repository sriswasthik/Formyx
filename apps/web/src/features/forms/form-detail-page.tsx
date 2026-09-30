import { FIELD_TYPE_LABELS, isAnswerableFieldType, type FormDetail } from '@formyx/shared';
import { ArrowLeft, FileQuestion, Lock, PencilRuler, RotateCw } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { usePageTitle } from '@/app/page-title';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError } from '@/lib/api';
import { useNow } from '@/lib/use-now';
import { EditedAt } from './form-card';
import { FormStatusBadge } from './form-status-badge';
import { questionCountLabel, responseCountLabel } from './format';
import { useFormDetail } from './use-forms';

function BackToForms() {
  return (
    <Link
      to="/app/forms"
      className="inline-flex w-fit items-center gap-1.5 rounded-md text-13 text-muted-foreground transition-colors duration-150 ease-standard hover:text-foreground"
    >
      <ArrowLeft aria-hidden />
      All forms
    </Link>
  );
}

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
                    </span>
                    <span className="sr-only"> (required)</span>
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
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-5 w-64 max-w-full" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

/**
 * Where "Open" leads. For now it summarises the form; the builder takes this page over in
 * the next sprint.
 */
export function FormDetailPage() {
  const { formId = '' } = useParams();
  const formQuery = useFormDetail(formId);
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
  const questionCount = form.draftSchema.fields.filter((field) =>
    isAnswerableFieldType(field.type),
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackToForms />
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-13 text-muted-foreground">
          <FormStatusBadge status={form.status} />
          <span className="tabular-nums">{questionCountLabel(questionCount)}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{responseCountLabel(form.responseCount)}</span>
          <span aria-hidden>·</span>
          <EditedAt updatedAt={form.updatedAt} now={now} />
        </p>
      </div>

      <EmptyState
        icon={PencilRuler}
        title="The form builder is coming next"
        description="Soon you will add and arrange questions, set up logic and publish right here."
      />

      {form.draftSchema.fields.length > 0 && <QuestionList form={form} />}
    </div>
  );
}
