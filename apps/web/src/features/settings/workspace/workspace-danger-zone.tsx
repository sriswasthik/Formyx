import type { WorkspaceSummary } from '@formyx/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession } from '@/features/auth/session-context';
import {
  useDeleteWorkspace,
  useMembers,
  useRemoveMember,
} from '@/features/workspaces/use-workspace-admin';
import { changeErrorMessage } from '@/lib/api';

function Row({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h3 className="text-14 font-medium">{title}</h3>
        <p className="text-13 text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function LeaveWorkspace({ workspace }: { workspace: WorkspaceSummary }) {
  const { user } = useSession();
  const navigate = useNavigate();
  const members = useMembers(workspace.id);
  const leave = useRemoveMember(workspace.id, user.id);
  const [open, setOpen] = useState(false);
  const owners = members.data?.filter((member) => member.role === 'OWNER').length ?? 0;
  const onlyOwner = workspace.role === 'OWNER' && owners <= 1;

  return (
    <Row
      title="Leave workspace"
      description={
        onlyOwner
          ? 'You’re the only owner. Make someone else an owner first, or delete the workspace.'
          : 'You’ll lose access to its forms and responses until someone invites you again.'
      }
      action={
        <>
          <Button
            variant="secondary"
            disabled={onlyOwner || members.isPending}
            onClick={() => {
              setOpen(true);
            }}
          >
            Leave
          </Button>
          <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="break-words">Leave {workspace.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  You’ll lose access to its forms and responses. Forms you made stay in the
                  workspace, looked after by one of its owners.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => {
                    // Awaited rather than per-call callbacks: leaving switches workspace,
                    // which unmounts this page before those callbacks would run.
                    leave.mutateAsync(user.id).then(
                      () => {
                        toast.success(`You left ${workspace.name}`);
                        void navigate('/app/forms');
                      },
                      (error: unknown) => {
                        toast.error('Could not leave the workspace', {
                          description: changeErrorMessage(error),
                        });
                      },
                    );
                  }}
                >
                  Leave workspace
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      }
    />
  );
}

function DeleteWorkspace({ workspace }: { workspace: WorkspaceSummary }) {
  const navigate = useNavigate();
  const remove = useDeleteWorkspace(workspace.id);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const confirmed = typed.trim() === workspace.name.trim();

  return (
    <Row
      title="Delete workspace"
      description="Deletes every form and response in it, for everyone. This can’t be undone."
      action={
        <>
          <Button
            variant="destructive"
            onClick={() => {
              setTyped('');
              setOpen(true);
            }}
          >
            Delete workspace
          </Button>
          <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogContent>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!confirmed) return;
                  // Awaited for the same reason as leaving: this page unmounts on success.
                  remove.mutateAsync().then(
                    () => {
                      setOpen(false);
                      toast.success(`${workspace.name} was deleted`);
                      void navigate('/app/forms');
                    },
                    (error: unknown) => {
                      toast.error('Could not delete the workspace', {
                        description: changeErrorMessage(error),
                      });
                    },
                  );
                }}
                className="flex flex-col gap-4"
              >
                <AlertDialogHeader>
                  <AlertDialogTitle className="break-words">
                    Delete {workspace.name}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Every form and response in it is deleted for everyone, and its members lose
                    access. A paid plan is cancelled first, so it isn’t charged again. This can’t be
                    undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirm-workspace-name">
                    Type <span className="font-semibold break-all">{workspace.name}</span> to
                    confirm
                  </Label>
                  <Input
                    id="confirm-workspace-name"
                    autoComplete="off"
                    value={typed}
                    onChange={(event) => {
                      setTyped(event.target.value);
                    }}
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={!confirmed || remove.isPending}
                  >
                    {remove.isPending ? 'Deleting…' : 'Delete workspace'}
                  </Button>
                </AlertDialogFooter>
              </form>
            </AlertDialogContent>
          </AlertDialog>
        </>
      }
    />
  );
}

/** Leaving, and for owners deleting, kept apart from everyday settings. */
export function WorkspaceDangerZone({ workspace }: { workspace: WorkspaceSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Leave or delete</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        <LeaveWorkspace workspace={workspace} />
        {workspace.role === 'OWNER' && <DeleteWorkspace workspace={workspace} />}
      </CardContent>
    </Card>
  );
}
