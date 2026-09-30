import { hasRole, type FormDetail } from '@formyx/shared';
import { FileQuestion, Lock, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useStore } from 'zustand';
import { usePageTitle } from '@/app/page-title';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/features/auth/session-context';
import { useFormDetail } from '@/features/forms/use-forms';
import { ApiRequestError } from '@/lib/api';
import { EditorLayout } from './editor-layout';
import { createEditorStore } from './editor-store';
import { EditorStoreContext } from './editor-store-context';

function EditorSkeleton() {
  return (
    <div role="status" aria-label="Loading the editor" className="flex h-dvh flex-col bg-surface">
      <div className="flex h-14 items-center gap-3 border-b bg-background px-3">
        <Skeleton className="size-8" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="ml-auto h-8 w-40" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-60 flex-col gap-2 border-r bg-background p-4 lg:flex">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
        <div className="flex-1 p-8">
          <Skeleton className="mx-auto h-96 w-full max-w-2xl rounded-xl" />
        </div>
        <div className="hidden w-80 border-l bg-background lg:block" />
      </div>
    </div>
  );
}

function EditorProblem({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: typeof Lock;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <EmptyState
        className="w-full max-w-md border-none"
        icon={icon}
        title={title}
        description={description}
        action={
          <Button asChild variant="secondary">
            <Link to="/app/forms">Back to forms</Link>
          </Button>
        }
      />
    </main>
  );
}

/** One editor per form: its store is created from the form once and lives until it closes. */
function FormEditor({ form }: { form: FormDetail }) {
  const [store] = useState(() =>
    createEditorStore(
      { title: form.title, schema: form.draftSchema, version: form.version },
      {
        onConditionsRemoved: (count, undo) => {
          toast.info(count === 1 ? 'A condition was removed' : `${count} conditions were removed`, {
            description: 'It depended on a question that moved below it, changed or was deleted.',
            action: { label: 'Undo', onClick: undo },
          });
        },
      },
    ),
  );
  usePageTitle(useStore(store, (state) => state.title) || 'Untitled form');

  return (
    <EditorStoreContext.Provider value={store}>
      <h1 className="sr-only">Edit form</h1>
      <EditorLayout form={form} status={null} />
    </EditorStoreContext.Provider>
  );
}

export function EditorPage() {
  const { formId = '' } = useParams();
  const { workspaces } = useSession();
  const formQuery = useFormDetail(formId);

  if (formQuery.isPending) return <EditorSkeleton />;

  if (formQuery.isError) {
    const status = formQuery.error instanceof ApiRequestError ? formQuery.error.status : 0;
    if (status === 404) {
      return (
        <EditorProblem
          icon={FileQuestion}
          title="Form not found"
          description="It may have been deleted, or the link is wrong."
        />
      );
    }
    if (status === 403) {
      return (
        <EditorProblem
          icon={Lock}
          title="You don't have access to this form"
          description="It belongs to a workspace you are not a member of."
        />
      );
    }
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <ErrorState
          className="w-full max-w-md border-none"
          title="Could not load the editor"
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
      </main>
    );
  }

  const form = formQuery.data;
  const role = workspaces.find((workspace) => workspace.id === form.workspaceId)?.role;
  // Viewers get the read-only page instead.
  if (!role || !hasRole(role, 'EDITOR')) {
    return <Navigate to={`/app/forms/${form.id}`} replace />;
  }

  return <FormEditor key={form.id} form={form} />;
}
