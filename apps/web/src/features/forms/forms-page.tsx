import {
  formTemplateIdSchema,
  hasRole,
  type FormListItem,
  type FormTemplateId,
  type WorkspaceSummary,
} from '@formyx/shared';
import { Building2, Plus, RotateCw, SearchX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardOnboarding } from '@/features/onboarding/dashboard-onboarding';
import { CreateWorkspaceDialog } from '@/features/workspaces/create-workspace-dialog';
import { useActiveWorkspace } from '@/features/workspaces/use-active-workspace';
import { useNow } from '@/lib/use-now';
import { DeleteFormDialog } from './delete-form-dialog';
import type { FormActionHandler } from './form-actions-menu';
import { formOpenPath } from './form-paths';
import { FormsCollection } from './forms-collection';
import { FormsEmptyState } from './forms-empty-state';
import { FormsSkeleton, ToolbarSkeleton } from './forms-skeleton';
import { FormsToolbar } from './forms-toolbar';
import { countByStatus, filterForms, formsSummary, sortFormsBy } from './forms-view';
import { NewFormButton } from './new-form-button';
import { NewFormDialog } from './new-form-dialog';
import { RenameFormDialog } from './rename-form-dialog';
import { StartFaster } from './start-faster';
import { useFormsFilters } from './use-forms-filters';
import {
  describeError,
  useCreateForm,
  useDeleteForm,
  useDuplicateForm,
  useFormsList,
  useRenameForm,
} from './use-forms';
import { useFormsViewStore } from './view-store';

export function FormsPage() {
  const workspace = useActiveWorkspace();
  const [creating, setCreating] = useState(false);

  if (!workspace) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Forms" />
        <EmptyState
          icon={Building2}
          title="You are not in a workspace"
          description="Create one for your forms, or ask a workspace owner to invite you."
          action={
            <Button
              onClick={() => {
                setCreating(true);
              }}
            >
              <Plus aria-hidden />
              Create workspace
            </Button>
          }
        />
        <CreateWorkspaceDialog open={creating} onOpenChange={setCreating} />
      </div>
    );
  }
  // Remount per workspace so dialogs and pending state never carry over.
  return <FormsDashboard key={workspace.id} workspace={workspace} />;
}

/** Creates a form and opens it, for both the New form dialog and the empty state. */
function useCreateAndOpen(workspaceId: string) {
  const navigate = useNavigate();
  const createForm = useCreateForm(workspaceId);

  return {
    create: (templateId: FormTemplateId) => {
      createForm.mutate(
        { templateId },
        {
          onSuccess: (form) => {
            void navigate(formOpenPath(form.id, true));
          },
          onError: (error) => {
            const { title, description } = describeError(error);
            toast.error(title ?? 'Could not create the form', { description });
          },
        },
      );
    },
    pendingTemplate: createForm.isPending ? (createForm.variables.templateId ?? 'blank') : null,
  };
}

/**
 * `?template=<id>`, where "Use this template" in the gallery leads (through sign-up if need
 * be): creates the form from it once and opens it. Only editors can; others just stay here.
 */
function useTemplateFromLink(
  canEdit: boolean,
  create: (templateId: FormTemplateId) => void,
): boolean {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('template');
  const handled = useRef(false);
  const [arrivedWithTemplate] = useState(requested !== null);

  useEffect(() => {
    if (requested === null || handled.current) return;
    handled.current = true;
    setSearchParams(
      (current) => {
        current.delete('template');
        return current;
      },
      { replace: true },
    );
    const templateId = formTemplateIdSchema.safeParse(requested);
    if (!templateId.success) return;
    if (canEdit) create(templateId.data);
    else toast.error('Only editors can create forms in this workspace');
  }, [requested, canEdit, create, setSearchParams]);

  return arrivedWithTemplate;
}

/**
 * `?new=1`, where the command palette's "Create a form" leads: opens the New form dialog once,
 * and takes the parameter out of the address.
 */
function useNewFormFromLink(canEdit: boolean, open: () => void) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('new') !== null;
  useEffect(() => {
    if (!requested) return;
    setSearchParams(
      (current) => {
        current.delete('new');
        return current;
      },
      { replace: true },
    );
    if (canEdit) open();
  }, [requested, canEdit, open, setSearchParams]);
}

interface FormDialog {
  kind: 'rename' | 'delete';
  form: FormListItem;
  open: boolean;
}

/** With this many forms or fewer (but some), "Start faster" offers templates under them. */
const FEW_FORMS = 2;

function FormsDashboard({ workspace }: { workspace: WorkspaceSummary }) {
  const canEdit = hasRole(workspace.role, 'EDITOR');
  const { filters, searchInput, setSearchInput, setStatus, hasFilters, clearFilters } =
    useFormsFilters();
  const view = useFormsViewStore((state) => state.view);
  const setView = useFormsViewStore((state) => state.setView);
  const sort = useFormsViewStore((state) => state.sort);
  const setSort = useFormsViewStore((state) => state.setSort);
  const now = useNow();

  // Every form, once: searching, the status tabs and sorting happen here.
  const formsQuery = useFormsList(workspace.id);
  const renameForm = useRenameForm(workspace.id);
  const duplicateForm = useDuplicateForm(workspace.id);
  const deleteForm = useDeleteForm(workspace.id);
  const { create, pendingTemplate } = useCreateAndOpen(workspace.id);
  const arrivedWithTemplate = useTemplateFromLink(canEdit, create);

  const [newFormOpen, setNewFormOpen] = useState(false);
  const openNewForm = useCallback(() => {
    setNewFormOpen(true);
  }, []);
  useNewFormFromLink(canEdit, openNewForm);
  const [dialog, setDialog] = useState<FormDialog | null>(null);
  // The actions menu that opened the dialog, to give focus back to when it closes.
  const dialogTrigger = useRef<HTMLElement | null>(null);

  const all = formsQuery.data?.forms;

  const onAction: FormActionHandler = (action, form, trigger) => {
    const item = all?.find((candidate) => candidate.id === form.id);
    if (!item) return;
    if (action === 'duplicate') {
      duplicateForm.mutate(item);
      return;
    }
    dialogTrigger.current = trigger;
    setDialog({ kind: action, form: item, open: true });
  };

  const closeDialog = (open: boolean) => {
    if (!open) setDialog((current) => current && { ...current, open: false });
  };

  const returnFocus = (event: Event) => {
    const trigger = dialogTrigger.current;
    if (trigger?.isConnected) {
      event.preventDefault();
      trigger.focus();
    }
  };

  const counts = useMemo(() => countByStatus(all ?? []), [all]);
  const shown = useMemo(
    () => (all ? sortFormsBy(filterForms(all, filters), sort) : undefined),
    [all, filters, sort],
  );
  const creating = pendingTemplate !== null;
  const createBlank = () => {
    create('blank');
  };

  let content: ReactNode;
  if (formsQuery.isPending) {
    content = (
      <>
        <ToolbarSkeleton />
        <FormsSkeleton view={view} />
      </>
    );
  } else if (!all || !shown) {
    content = (
      <ErrorState
        title="Could not load forms"
        description="Check your connection and try again."
        action={
          <Button
            disabled={formsQuery.isFetching}
            onClick={() => {
              void formsQuery.refetch();
            }}
          >
            <RotateCw aria-hidden />
            Try again
          </Button>
        }
      />
    );
  } else if (all.length === 0) {
    content = (
      <FormsEmptyState
        canCreate={canEdit}
        onBlank={createBlank}
        onBrowse={openNewForm}
        pending={creating}
      />
    );
  } else {
    content = (
      <>
        <FormsToolbar
          search={searchInput}
          onSearchChange={setSearchInput}
          status={filters.status}
          onStatusChange={setStatus}
          counts={counts}
          sort={sort}
          onSortChange={setSort}
          view={view}
          onViewChange={setView}
        />
        {shown.length === 0 && hasFilters ? (
          <EmptyState
            icon={SearchX}
            title="No forms match"
            description={
              filters.search
                ? `Nothing matches “${filters.search}”. Try a different search.`
                : 'No forms have this status yet.'
            }
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <FormsCollection
            forms={shown}
            view={view}
            now={now}
            canEdit={canEdit}
            onAction={onAction}
          />
        )}
        {canEdit && all.length <= FEW_FORMS && !hasFilters && (
          <StartFaster onCreate={create} pendingTemplate={pendingTemplate} onBrowse={openNewForm} />
        )}
      </>
    );
  }

  return (
    // Layouts respond to the space next to the sidebar, not the viewport.
    <div className="@container flex flex-col gap-6">
      <PageHeader
        title="Forms"
        description={
          formsQuery.data ? (
            formsSummary(formsQuery.data.forms.length, formsQuery.data.responsesThisMonth)
          ) : formsQuery.isPending ? (
            <Skeleton className="inline-block h-4 w-56 align-middle" />
          ) : null
        }
        actions={
          canEdit && all && all.length > 0 ? (
            <NewFormButton onBlank={createBlank} onTemplates={openNewForm} pending={creating} />
          ) : undefined
        }
      />
      {canEdit && (
        <DashboardOnboarding
          arrivedWithTemplate={arrivedWithTemplate}
          forms={all}
          onNewForm={openNewForm}
          onCreate={create}
          pending={creating}
        />
      )}

      {content}

      {canEdit && (
        <>
          <NewFormDialog
            open={newFormOpen}
            onOpenChange={setNewFormOpen}
            onCreate={create}
            pending={creating}
          />
          <RenameFormDialog
            form={dialog?.kind === 'rename' ? dialog.form : null}
            open={dialog?.kind === 'rename' && dialog.open}
            onOpenChange={closeDialog}
            onRename={(_form, title) => {
              if (dialog) renameForm.mutate({ form: dialog.form, title });
            }}
            onCloseAutoFocus={returnFocus}
          />
          <DeleteFormDialog
            form={dialog?.kind === 'delete' ? dialog.form : null}
            open={dialog?.kind === 'delete' && dialog.open}
            onOpenChange={closeDialog}
            onDelete={() => {
              if (dialog) deleteForm.mutate(dialog.form);
            }}
            onCloseAutoFocus={returnFocus}
          />
        </>
      )}
    </div>
  );
}
