import { workspaceInputSchema } from '@formyx/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { FormAlert } from '@/components/form-alert';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { applyServerError } from '@/features/auth/server-errors';
import { useCreateWorkspace } from './use-workspace-admin';

function CreateWorkspaceForm({
  onDone,
  onCreated,
}: {
  onDone: () => void;
  onCreated?: (() => void) | undefined;
}) {
  const create = useCreateWorkspace();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(workspaceInputSchema), defaultValues: { name: '' } });

  return (
    <form
      noValidate
      onSubmit={(event) =>
        void handleSubmit(async ({ name }) => {
          setFormError(null);
          // Awaited rather than per-call callbacks: switching to the new workspace can
          // unmount whatever opened this dialog (e.g. a "no workspace" page) first.
          try {
            const workspace = await create.mutateAsync(name);
            onDone();
            onCreated?.();
            toast.success(`${workspace.name} is ready`);
            void navigate('/app/forms');
          } catch (error) {
            setFormError(applyServerError(error, ['name'], setError));
          }
        })(event)
      }
      className="flex flex-col gap-4"
    >
      {formError && <FormAlert>{formError}</FormAlert>}
      <FormField id="new-workspace-name" label="Name" error={errors.name?.message}>
        <Input autoComplete="off" placeholder="e.g. Marketing" {...register('name')} />
      </FormField>
      <DialogFooter>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create workspace'}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After the workspace exists and is the active one (e.g. to close a mobile menu). */
  onCreated?: (() => void) | undefined;
}

/** Names a new workspace, which the user owns and switches to. */
export function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateWorkspaceDialogProps) {
  // A fresh, empty form each time the dialog opens; the old one stays while it animates out.
  const [formKey, setFormKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setFormKey((key) => key + 1);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a workspace</DialogTitle>
          <DialogDescription>
            A separate place for forms, with its own members. You’ll be its owner.
          </DialogDescription>
        </DialogHeader>
        <CreateWorkspaceForm
          key={formKey}
          onCreated={onCreated}
          onDone={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
