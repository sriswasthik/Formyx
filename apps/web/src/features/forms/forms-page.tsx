import {
  hasRole,
  type FormSummary,
  type FormTemplateId,
  type WorkspaceSummary,
} from '@formyx/shared';
import { Building2, RotateCw, SearchX } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { useActiveWorkspace } from '@/features/workspaces/use-active-workspace';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import { DeleteFormDialog } from './delete-form-dialog';
import type { FormActionHandler } from './form-actions-menu';
import { FormsCollection } from './forms-collection';
import { FormsEmptyState } from './forms-empty-state';
import { FormsSkeleton } from './forms-skeleton';
import { FormsToolbar } from './forms-toolbar';
import { NewFormDialog } from './new-form-dialog';
import { RenameFormDialog } from './rename-form-dialog';
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

  if (!workspace) {
    return (
      <EmptyState
        icon={Building2}
        title="You are not in a workspace"
        description="Ask a workspace owner to invite you, then your forms will appear here."
      />
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
            void navigate(`/app/forms/${form.id}`);
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

interface FormDialog {
  kind: 'rename' | 'delete';
  form: FormSummary;
  open: boolean;
}

function FormsDashboard({ workspace }: { workspace: WorkspaceSummary }) {
  const canEdit = hasRole(workspace.role, 'EDITOR');
  const { filters, searchInput, setSearchInput, setStatus, hasFilters, clearFilters } =
    useFormsFilters();
  const view = useFormsViewStore((state) => state.view);
  const setView = useFormsViewStore((state) => state.setView);
  const now = useNow();

  const formsQuery = useFormsList(workspace.id, filters);
  const renameForm = useRenameForm(workspace.id);
  const duplicateForm = useDuplicateForm(workspace.id);
  const deleteForm = useDeleteForm(workspace.id);
  const { create, pendingTemplate } = useCreateAndOpen(workspace.id);

  const [newFormOpen, setNewFormOpen] = useState(false);
  const [dialog, setDialog] = useState<FormDialog | null>(null);
  // The actions menu that opened the dialog, to give focus back to when it closes.
  const dialogTrigger = useRef<HTMLElement | null>(null);

  const onAction: FormActionHandler = (action, form, trigger) => {
    if (action === 'duplicate') {
      duplicateForm.mutate(form);
      return;
    }
    dialogTrigger.current = trigger;
    setDialog({ kind: action, form, open: true });
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

  const forms = formsQuery.data;
  let content: ReactNode;

  if (formsQuery.isPending) {
    content = <FormsSkeleton view={view} />;
  } else if (!forms) {
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
  } else if (forms.length === 0 && hasFilters) {
    content = (
      <EmptyState
        icon={SearchX}
        title="No forms match your filters"
        description={
          filters.search
            ? `Nothing matches “${filters.search}”. Try a different search.`
            : 'Try a different status.'
        }
        action={
          <Button variant="secondary" onClick={clearFilters}>
            Clear filters
          </Button>
        }
      />
    );
  } else if (forms.length === 0) {
    content = (
      <FormsEmptyState canCreate={canEdit} onCreate={create} pendingTemplate={pendingTemplate} />
    );
  } else {
    content = (
      <div
        className={cn(
          'transition-opacity duration-150 ease-standard',
          // Results for the previous search stay visible, dimmed, while new ones load.
          formsQuery.isPlaceholderData && 'opacity-60',
        )}
      >
        <FormsCollection
          forms={forms}
          view={view}
          now={now}
          canEdit={canEdit}
          onAction={onAction}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <FormsToolbar
        search={searchInput}
        onSearchChange={setSearchInput}
        status={filters.status}
        onStatusChange={setStatus}
        view={view}
        onViewChange={setView}
        onNewForm={
          canEdit
            ? () => {
                setNewFormOpen(true);
              }
            : undefined
        }
      />

      {content}

      {canEdit && (
        <>
          <NewFormDialog
            open={newFormOpen}
            onOpenChange={setNewFormOpen}
            onCreate={create}
            pending={pendingTemplate !== null}
          />
          <RenameFormDialog
            form={dialog?.kind === 'rename' ? dialog.form : null}
            open={dialog?.kind === 'rename' && dialog.open}
            onOpenChange={closeDialog}
            onRename={(form, title) => {
              renameForm.mutate({ form, title });
            }}
            onCloseAutoFocus={returnFocus}
          />
          <DeleteFormDialog
            form={dialog?.kind === 'delete' ? dialog.form : null}
            open={dialog?.kind === 'delete' && dialog.open}
            onOpenChange={closeDialog}
            onDelete={(form) => {
              deleteForm.mutate(form);
            }}
            onCloseAutoFocus={returnFocus}
          />
        </>
      )}
    </div>
  );
}
