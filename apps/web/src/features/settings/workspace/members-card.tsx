import { ROLE_LABELS, ROLES, type Member, type Role, type WorkspaceSummary } from '@formyx/shared';
import { MoreHorizontal, UserMinus, Users } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/features/auth/session-context';
import {
  useChangeRole,
  useMembers,
  useRemoveMember,
} from '@/features/workspaces/use-workspace-admin';
import { initial, roleWithArticle } from '@/features/workspaces/workspace-format';
import { changeErrorMessage } from '@/lib/api';

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-background text-13 font-medium"
    >
      {initial(name)}
    </span>
  );
}

function MembersSkeleton() {
  return (
    <ul aria-hidden className="flex flex-col divide-y">
      {[0, 1, 2].map((row) => (
        <li key={row} className="flex items-center gap-3 py-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-8 w-24" />
        </li>
      ))}
    </ul>
  );
}

interface MemberRowProps {
  member: Member;
  isSelf: boolean;
  canManage: boolean;
  onChangeRole: (role: Role) => void;
  onRemove: () => void;
  busy: boolean;
}

function MemberRow({ member, isSelf, canManage, onChangeRole, onRemove, busy }: MemberRowProps) {
  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={member.name} />
        <div className="min-w-0">
          <p className="truncate text-14 font-medium">
            {member.name}
            {isSelf && <span className="font-normal text-muted-foreground"> (you)</span>}
          </p>
          <p className="truncate text-13 text-muted-foreground">{member.email}</p>
        </div>
      </div>
      {canManage ? (
        <div className="flex items-center gap-1 pl-11 sm:pl-0">
          <Select
            value={member.role}
            disabled={busy}
            onValueChange={(role) => {
              onChangeRole(role as Role);
            }}
          >
            <SelectTrigger aria-label={`Role of ${member.name}`} className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isSelf && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`More actions for ${member.name}`}>
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onSelect={onRemove}>
                  <UserMinus aria-hidden />
                  Remove from workspace
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ) : (
        <p className="pl-11 text-13 text-muted-foreground sm:pl-0">{ROLE_LABELS[member.role]}</p>
      )}
    </li>
  );
}

/** Everyone in the workspace. Owners change roles and remove people here. */
export function MembersCard({ workspace }: { workspace: WorkspaceSummary }) {
  const { user } = useSession();
  const canManage = workspace.role === 'OWNER';
  const members = useMembers(workspace.id);
  const changeRole = useChangeRole(workspace.id, user.id);
  const removeMember = useRemoveMember(workspace.id, user.id);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Takes focus once a removed member's row (and the menu that removed them) is gone.
  const listRef = useRef<HTMLUListElement>(null);

  let content;
  if (members.isPending) {
    content = <MembersSkeleton />;
  } else if (members.isError) {
    content = (
      <ErrorState
        title="Members could not be loaded"
        description="Check your connection and try again."
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void members.refetch();
            }}
          >
            Try again
          </Button>
        }
      />
    );
  } else if (members.data.length === 0) {
    content = <EmptyState icon={Users} title="No members yet" />;
  } else {
    content = (
      <ul
        ref={listRef}
        tabIndex={-1}
        aria-label="Members"
        className="-my-3 flex flex-col divide-y outline-none"
      >
        {members.data.map((member) => (
          <MemberRow
            key={member.userId}
            member={member}
            isSelf={member.userId === user.id}
            canManage={canManage}
            busy={changeRole.isPending && changeRole.variables.userId === member.userId}
            onChangeRole={(role) => {
              changeRole.mutate(
                { userId: member.userId, role },
                {
                  onSuccess: (changed) => {
                    toast.success(`${changed.name} is now ${roleWithArticle(changed.role)}`);
                  },
                  onError: (error) => {
                    toast.error('Could not change the role', {
                      description: changeErrorMessage(error),
                    });
                  },
                },
              );
            }}
            onRemove={() => {
              setRemoving(member);
              setConfirmOpen(true);
            }}
          />
        ))}
      </ul>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>
          {canManage
            ? 'Owners manage members; editors build forms; viewers can look but not change.'
            : 'People in this workspace and what they can do.'}
        </CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to this workspace’s forms and responses. You can invite them again
              later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!removing) return;
                removeMember.mutate(removing.userId, {
                  onSuccess: () => {
                    listRef.current?.focus();
                    toast.success(`${removing.name} was removed`);
                  },
                  onError: (error) => {
                    toast.error('Could not remove them', {
                      description: changeErrorMessage(error),
                    });
                  },
                });
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
