import { workspaceInputSchema, type WorkspaceSummary } from '@formyx/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { changeErrorMessage, useRenameWorkspace } from '@/features/workspaces/use-workspace-admin';

function RenameForm({ workspace }: { workspace: WorkspaceSummary }) {
  const rename = useRenameWorkspace(workspace.id);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(workspaceInputSchema),
    defaultValues: { name: workspace.name },
  });

  return (
    <form
      noValidate
      onSubmit={(event) =>
        void handleSubmit(({ name }) => {
          rename.mutate(name, {
            onSuccess: (renamed) => {
              reset({ name: renamed.name });
              toast.success('Workspace renamed');
            },
            onError: (error) => {
              toast.error('Could not rename the workspace', {
                description: changeErrorMessage(error),
              });
            },
          });
        })(event)
      }
      className="flex flex-col gap-3 sm:flex-row sm:items-start"
    >
      <div className="flex-1">
        <FormField id="workspace-name" label="Name" error={errors.name?.message}>
          <Input autoComplete="off" {...register('name')} />
        </FormField>
      </div>
      <Button
        type="submit"
        variant="secondary"
        className="sm:mt-6"
        disabled={!isDirty || rename.isPending}
      >
        {rename.isPending ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}

/** The workspace's name: editable by owners, shown to everyone else. */
export function WorkspaceNameCard({ workspace }: { workspace: WorkspaceSummary }) {
  const isOwner = workspace.role === 'OWNER';
  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace</CardTitle>
        <CardDescription>
          {isOwner
            ? 'Everyone in the workspace sees this name.'
            : 'Only owners can rename the workspace.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isOwner ? (
          // A fresh form when the workspace changes, so its name is the starting value.
          <RenameForm key={workspace.id} workspace={workspace} />
        ) : (
          <p className="text-14 font-medium break-words">{workspace.name}</p>
        )}
      </CardContent>
    </Card>
  );
}
