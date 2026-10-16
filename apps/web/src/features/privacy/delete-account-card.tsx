import {
  ACCOUNT_DELETION_DAYS,
  validationIssueSchema,
  type OwnedWorkspace,
  type WorkspaceDeletionChoice,
} from '@formyx/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ErrorState } from '@/components/error-state';
import { FormField } from '@/components/form-field';
import { PasswordInput } from '@/components/password-input';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { replaceSession } from '@/features/auth/session-cache';
import { useSession } from '@/features/auth/session-context';
import { formatBillingDate } from '@/features/billing/billing-format';
import { useWorkspaceStore } from '@/features/workspaces/workspace-store';
import { ApiRequestError, changeErrorMessage } from '@/lib/api';
import { getAccountDeletion, privacyKeys, requestAccountDeletion } from './privacy-api';

const DELETE = 'delete';

/** A shared workspace's fate in the deletion dialog, as one line. */
function fateLine(workspace: OwnedWorkspace): string {
  if (workspace.fate === 'alone') {
    return workspace.paidPlan
      ? 'Deleted with its forms and responses. Its plan is cancelled.'
      : 'Deleted with its forms and responses.';
  }
  return 'Stays with its other owners. Forms you made pass to one of them.';
}

/** One shared workspace only they own: give it to a member, or delete it. */
function WorkspaceChoice({
  workspace,
  value,
  error,
  onChange,
}: {
  workspace: OwnedWorkspace;
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <FormField
      id={id}
      label={workspace.name}
      hint={
        value === DELETE && workspace.paidPlan
          ? 'Its plan is cancelled when it is deleted.'
          : value && value !== DELETE && workspace.paidPlan
            ? 'Its plan runs to the end of what is paid for, then stops: the new owner can take it on.'
            : 'Others are in it. Give it to one of them, or delete it for everyone.'
      }
      error={error}
    >
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Choose what happens to it" />
        </SelectTrigger>
        <SelectContent>
          {workspace.members.map((member) => (
            <SelectItem key={member.userId} value={member.userId}>
              Give it to {member.name} ({member.email})
            </SelectItem>
          ))}
          <SelectItem value={DELETE}>Delete it, with its forms and responses</SelectItem>
        </SelectContent>
      </Select>
    </FormField>
  );
}

/**
 * Deleting the account, a week later: what happens to each workspace it owns, the password
 * (or email) to confirm, and then it is signed out until it signs in to keep itself.
 */
export function DeleteAccountCard() {
  const { user } = useSession();
  // Accounts made through Google or Zoho have no password to confirm with.
  const byEmail = user.hasPassword === false;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const confirmId = useId();
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState('');
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const plan = useQuery({
    queryKey: privacyKeys.deletion,
    queryFn: getAccountDeletion,
    enabled: open,
  });
  const mutation = useMutation({ mutationFn: requestAccountDeletion });

  if (user.isDemo) return null;
  const toChoose = plan.data?.workspaces.filter(({ fate }) => fate === 'choose') ?? [];
  const others = plan.data?.workspaces.filter(({ fate }) => fate !== 'choose') ?? [];
  const ready = secret !== '' && toChoose.every(({ id }) => choices[id]);

  const remove = () => {
    setConfirmError(null);
    setErrors({});
    const workspaces: WorkspaceDeletionChoice[] = toChoose.map(({ id }) =>
      choices[id] === DELETE
        ? { workspaceId: id, action: 'delete' }
        : { workspaceId: id, action: 'transfer', toUserId: choices[id] ?? '' },
    );
    mutation.mutate(byEmail ? { email: secret, workspaces } : { password: secret, workspaces }, {
      onSuccess: (scheduledFor) => {
        setOpen(false);
        useWorkspaceStore.getState().setActiveWorkspaceId(null);
        replaceSession(queryClient, null);
        void navigate('/', { replace: true });
        toast.success(`Your account will be deleted on ${formatBillingDate(scheduledFor)}`, {
          description: 'Sign in again before then to keep it.',
        });
      },
      onError: (caught) => {
        if (caught instanceof ApiRequestError && caught.code === 'WRONG_CODE') {
          setConfirmError(
            byEmail ? 'That is not your account’s email' : 'That password is not right',
          );
          return;
        }
        if (caught instanceof ApiRequestError && caught.code === 'VALIDATION_ERROR') {
          const issues = validationIssueSchema.array().safeParse(caught.details).data ?? [];
          setErrors(
            Object.fromEntries(
              issues.map((issue) => [issue.path.replace(/^workspaces\./, ''), issue.message]),
            ),
          );
          void plan.refetch();
          return;
        }
        setConfirmError(changeErrorMessage(caught));
      },
    });
  };

  return (
    <Card className="border-danger/40">
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
        <CardDescription>
          Your account and personal data go, with the workspaces only you are in. It happens{' '}
          {ACCOUNT_DELETION_DAYS} days after you ask, and you can change your mind until then.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="secondary"
          className="text-danger-text"
          onClick={() => {
            setSecret('');
            setChoices({});
            setErrors({});
            setConfirmError(null);
            setOpen(true);
          }}
        >
          Delete account
        </Button>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
            <form
              noValidate
              className="contents"
              onSubmit={(event) => {
                event.preventDefault();
                if (ready && !mutation.isPending) remove();
              }}
            >
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  You’ll be signed out everywhere. In {ACCOUNT_DELETION_DAYS} days your account is
                  deleted; sign in before then, or use the link we email you, to keep it.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {plan.isPending ? (
                <div aria-busy="true" aria-label="Loading your workspaces">
                  <Skeleton className="h-16 rounded-lg" />
                </div>
              ) : plan.isError ? (
                <ErrorState
                  title="Could not load your workspaces"
                  action={
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        void plan.refetch();
                      }}
                    >
                      Try again
                    </Button>
                  }
                />
              ) : (
                <div className="flex flex-col gap-4">
                  {toChoose.map((workspace) => (
                    <WorkspaceChoice
                      key={workspace.id}
                      workspace={workspace}
                      value={choices[workspace.id] ?? ''}
                      error={errors[workspace.id]}
                      onChange={(value) => {
                        setChoices((current) => ({ ...current, [workspace.id]: value }));
                      }}
                    />
                  ))}
                  {others.length > 0 && (
                    <ul className="flex flex-col gap-2 text-13">
                      {others.map((workspace) => (
                        <li key={workspace.id} className="flex flex-col">
                          <span className="font-medium break-words">{workspace.name}</span>
                          <span className="text-muted-foreground">{fateLine(workspace)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <FormField
                    id={confirmId}
                    label={byEmail ? 'Type your email to confirm' : 'Your password'}
                    hint={byEmail ? user.email : undefined}
                    error={confirmError ?? undefined}
                  >
                    {byEmail ? (
                      <Input
                        type="email"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={secret}
                        onChange={(event) => {
                          setSecret(event.target.value);
                        }}
                      />
                    ) : (
                      <PasswordInput
                        autoComplete="current-password"
                        value={secret}
                        onChange={(event) => {
                          setSecret(event.target.value);
                        }}
                      />
                    )}
                  </FormField>
                </div>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={!ready || mutation.isPending || !plan.data}
                >
                  {mutation.isPending ? 'Scheduling…' : 'Delete account'}
                </Button>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
