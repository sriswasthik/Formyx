import { hasRole, qrCodeColors, type FeatureId, type FormDetail } from '@formyx/shared';
import { FileQuestion, Lock, RotateCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useStore } from 'zustand';
import { usePageTitle } from '@/app/page-title';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/features/auth/session-context';
import { UpgradeDialog } from '@/features/entitlements/upgrade-dialog';
import { useWorkspaceEntitlements } from '@/features/entitlements/use-entitlements';
import { formKeys } from '@/features/forms/form-list-cache';
import { FormNav, INLINE_FORM_NAV_QUERY } from '@/features/forms/form-nav';
import { getForm } from '@/features/forms/forms-api';
import { ShareDialog } from '@/features/forms/share/share-dialog';
import { useFormDetail } from '@/features/forms/use-forms';
import { ApiRequestError } from '@/lib/api';
import { useMediaQuery } from '@/lib/use-media-query';
import { ConflictDialog } from './autosave/conflict-dialog';
import { LeaveGuard } from './autosave/leave-guard';
import { SaveStatus } from './autosave/save-status';
import { useAutosave } from './autosave/use-autosave';
import { focusQuestion } from './canvas/focus-question';
import { findDraftIssues, firstFieldWithIssue } from './draft-issues';
import { EditorEntitlementsContext } from './editor-entitlements';
import { EditorWorkspaceContext } from './editor-workspace';
import { EditorLayout } from './editor-layout';
import { preloadFieldControls } from '@/features/form-renderer/controls/registry';
import { createEditorStore } from './editor-store';
import { EditorStoreContext } from './editor-store-context';
import { PublishControls } from './publish/publish-controls';
import { findDraftPublishIssues, PublishIssuesContext } from './publish/publish-issues';
import { PublishIssuesDialog } from './publish/publish-issues-dialog';
import { usePublishing } from './publish/use-publishing';

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
  const queryClient = useQueryClient();
  const [store] = useState(() => {
    // The form's question types start loading with the editor, so the canvas draws them at once.
    void preloadFieldControls(form.draftSchema);
    return createEditorStore(
      { title: form.title, schema: form.draftSchema, version: form.version, theme: form.theme },
      {
        onConditionsRemoved: (count, undo) => {
          toast.info(count === 1 ? 'A condition was removed' : `${count} conditions were removed`, {
            description: 'It depended on a question that moved below it, changed or was deleted.',
            action: { label: 'Undo', onClick: undo },
          });
        },
      },
    );
  });
  const { state: saveState, autosaver } = useAutosave(form.id, store);
  const [conflictDismissed, setConflictDismissed] = useState(false);
  const [reloading, setReloading] = useState(false);
  usePageTitle(useStore(store, (state) => state.title) || 'Untitled form');

  // After a refused publish, what still needs doing is pointed out until it goes live.
  const [pointOutIssues, setPointOutIssues] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [upgrade, setUpgrade] = useState<{ open: boolean; features: FeatureId[] }>({
    open: false,
    features: [],
  });
  const entitlements = useWorkspaceEntitlements(form.workspaceId);
  const [share, setShare] = useState({ open: false, justPublished: false });
  const publishButton = useRef<HTMLButtonElement>(null);
  const shareButton = useRef<HTMLButtonElement>(null);
  // Share sits in the top bar on wider screens; on phones it is in a menu that has closed.
  const inlineNav = useMediaQuery(INLINE_FORM_NAV_QUERY);
  const schema = useStore(store, (state) => state.schema);
  const publishIssues = useMemo(
    () => (pointOutIssues ? findDraftPublishIssues(schema) : []),
    [pointOutIssues, schema],
  );
  const publishing = usePublishing({
    form,
    store,
    autosaver,
    onIncomplete: () => {
      setPointOutIssues(true);
      setIssuesOpen(true);
    },
    missingFeatures: entitlements.missing,
    onUpgradeRequired: (features) => {
      setUpgrade({ open: true, features });
    },
  });

  const publish = async () => {
    const firstTime = form.publishedSchema === null;
    if ((await publishing.publish()) !== 'published') return;
    setPointOutIssues(false);
    if (firstTime) {
      setShare({ open: true, justPublished: true });
    } else {
      toast.success('Changes published', {
        description: 'Respondents now see the latest version.',
      });
    }
  };

  const showQuestion = (index: number) => {
    setIssuesOpen(false);
    const field = store.getState().schema.fields[index];
    if (field) {
      store.getState().selectField(field.id);
      focusQuestion(field.id);
    }
  };

  const reloadLatest = async () => {
    setReloading(true);
    try {
      const latest = await getForm(form.id);
      queryClient.setQueryData(formKeys.detail(form.id), latest);
      autosaver.reload(latest);
      setConflictDismissed(false);
      toast.success('Loaded the latest version');
    } catch {
      toast.error('Could not load the latest version', {
        description: 'Check your connection and try again.',
      });
    } finally {
      setReloading(false);
    }
  };

  /** Takes the user to the first problem that stops saving. */
  const showIssues = () => {
    const state = store.getState();
    const issues = findDraftIssues(state);
    const index = firstFieldWithIssue(issues);
    const field = index === null ? undefined : state.schema.fields[index];
    if (field) {
      state.selectField(field.id);
      focusQuestion(field.id);
    } else if (issues.some((issue) => issue.path === 'title')) {
      document.querySelector<HTMLInputElement>('input[aria-label="Form title"]')?.focus();
    } else {
      state.selectField(null);
    }
  };

  return (
    <EditorStoreContext.Provider value={store}>
      <EditorEntitlementsContext.Provider value={entitlements}>
        <EditorWorkspaceContext.Provider value={form.workspaceId}>
          <PublishIssuesContext.Provider value={publishIssues}>
            <h1 className="sr-only">Edit form</h1>
            <EditorLayout
              form={form}
              navigation={
                <FormNav
                  formId={form.id}
                  current="edit"
                  canEdit
                  published={form.publishedSchema !== null}
                  shareRef={shareButton}
                  onShare={() => {
                    setShare({ open: true, justPublished: false });
                  }}
                />
              }
              actions={
                <PublishControls
                  form={form}
                  pending={publishing.pending}
                  primaryRef={publishButton}
                  onPublish={() => void publish()}
                  onClose={() => void publishing.close()}
                  onReopen={() => void publishing.reopen()}
                />
              }
              status={
                <SaveStatus
                  state={saveState}
                  onRetry={() => {
                    autosaver.retryNow();
                  }}
                  onReload={() => void reloadLatest()}
                  onShowIssues={showIssues}
                />
              }
            />
            <ConflictDialog
              open={saveState.kind === 'conflict' && !conflictDismissed}
              onOpenChange={(open) => {
                if (!open) setConflictDismissed(true);
              }}
              onReload={() => void reloadLatest()}
              reloading={reloading}
            />
            <PublishIssuesDialog
              open={issuesOpen}
              onOpenChange={setIssuesOpen}
              issues={publishIssues}
              onShow={showQuestion}
            />
            <UpgradeDialog
              open={upgrade.open}
              onOpenChange={(open) => {
                setUpgrade((current) => ({ ...current, open }));
              }}
              features={upgrade.features}
              returnFocusTo={publishButton}
            />
            <ShareDialog
              open={share.open}
              onOpenChange={(open) => {
                setShare((current) => ({ ...current, open }));
              }}
              slug={form.slug}
              closed={form.status === 'CLOSED'}
              justPublished={share.justPublished}
              qrColors={qrCodeColors((form.publishedTheme ?? form.theme).colors)}
              returnFocusTo={inlineNav ? shareButton : publishButton}
            />
            <LeaveGuard autosaver={autosaver} />
          </PublishIssuesContext.Provider>
        </EditorWorkspaceContext.Provider>
      </EditorEntitlementsContext.Provider>
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
