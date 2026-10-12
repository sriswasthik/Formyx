import { hasRole, type FormDetail } from '@formyx/shared';
import { FileQuestion, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/features/auth/session-context';
import { ApiRequestError } from '@/lib/api';
import { useFormDetailQuery } from '@/features/form-settings/use-settings';

/** Page padding of a form's full-screen pages, matched by their skeleton. */
export const FORM_PAGE_PADDING = 'px-4 sm:px-6 md:px-8 lg:px-10';

function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="flex min-h-dvh flex-col">
      <div className="flex h-14 items-center gap-3 border-b px-3">
        <Skeleton className="size-8" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="ml-auto h-8 w-56" />
      </div>
      <div
        className={`mx-auto grid w-full max-w-6xl gap-10 py-8 lg:grid-cols-[14rem_1fr] ${FORM_PAGE_PADDING}`}
      >
        <Skeleton className="h-64" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/**
 * The form in the URL, once loaded, for a page only editors and owners may use (Settings,
 * Integrations): a skeleton while it loads, and a plain explanation when it can't be shown.
 */
export function EditorFormPage({
  deniedTitle,
  children,
}: {
  /** "Settings are for editors". */
  deniedTitle: string;
  children: (form: FormDetail) => ReactNode;
}) {
  const { formId = '' } = useParams();
  const { workspaces } = useSession();
  const formQuery = useFormDetailQuery(formId);

  if (formQuery.isPending) return <PageSkeleton />;

  if (formQuery.isError) {
    const status = formQuery.error instanceof ApiRequestError ? formQuery.error.status : 0;
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        {status === 404 || status === 403 ? (
          <EmptyState
            className="w-full max-w-md border-none"
            icon={status === 404 ? FileQuestion : Lock}
            title={status === 404 ? 'Form not found' : "You don't have access to this form"}
            description={
              status === 404
                ? 'It may have been deleted, or the link is wrong.'
                : 'It belongs to a workspace you are not a member of.'
            }
            action={
              <Button asChild variant="secondary">
                <Link to="/app/forms">Back to forms</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState
            className="w-full max-w-md border-none"
            title="Could not load this form"
            description="Check your connection and try again."
            action={
              <Button disabled={formQuery.isFetching} onClick={() => void formQuery.refetch()}>
                Try again
              </Button>
            }
          />
        )}
      </main>
    );
  }

  const form = formQuery.data;
  const role = workspaces.find((workspace) => workspace.id === form.workspaceId)?.role;
  if (!role || !hasRole(role, 'EDITOR')) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <EmptyState
          className="w-full max-w-md border-none"
          icon={Lock}
          title={deniedTitle}
          description="Ask an owner of the workspace to make you an editor."
          action={
            <Button asChild variant="secondary">
              <Link to="/app/forms">Back to forms</Link>
            </Button>
          }
        />
      </main>
    );
  }

  return children(form);
}
