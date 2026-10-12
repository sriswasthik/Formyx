import {
  changePasswordInputSchema,
  PASSWORD_MIN_LENGTH,
  soleOwnerDetailsSchema,
  type SoleOwnerDetails,
} from '@formyx/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
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
import { changePassword, deleteAccount } from '@/features/account/account-api';
import { replaceSession } from '@/features/auth/session-cache';
import { useSession } from '@/features/auth/session-context';
import { useWorkspaceStore } from '@/features/workspaces/workspace-store';
import { ApiRequestError, changeErrorMessage } from '@/lib/api';

/** Changing the password signs out every other device. */
export function PasswordCard() {
  const { user } = useSession();
  const formId = useId();
  const mutation = useMutation({ mutationFn: changePassword });
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(changePasswordInputSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  if (user.isDemo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>The demo account&apos;s password can&apos;t be changed.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          Changing it signs you out everywhere else. You stay signed in here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="flex flex-col gap-4 sm:max-w-80"
          onSubmit={(event) =>
            void handleSubmit((input) => {
              mutation.mutate(input, {
                onSuccess: () => {
                  reset();
                  toast.success('Password changed', {
                    description: 'Other devices have been signed out.',
                  });
                },
                onError: (error) => {
                  if (error instanceof ApiRequestError && error.code === 'WRONG_CODE') {
                    setError('currentPassword', { message: 'That password is not right' });
                    return;
                  }
                  toast.error('Could not change the password', {
                    description: changeErrorMessage(error),
                  });
                },
              });
            })(event)
          }
        >
          <FormField
            id={`${formId}-current`}
            label="Current password"
            error={errors.currentPassword?.message}
          >
            <PasswordInput autoComplete="current-password" {...register('currentPassword')} />
          </FormField>
          <FormField
            id={`${formId}-new`}
            label="New password"
            hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
            error={errors.newPassword?.message}
          >
            <PasswordInput autoComplete="new-password" {...register('newPassword')} />
          </FormField>
          <div>
            <Button type="submit" variant="secondary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Changing…' : 'Change password'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** Deletes the account for good, once the password confirms it. */
export function DeleteAccountCard() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [soleOwner, setSoleOwner] = useState<SoleOwnerDetails | null>(null);
  const mutation = useMutation({ mutationFn: deleteAccount });

  const remove = () => {
    setError(null);
    mutation.mutate(password, {
      onSuccess: () => {
        setOpen(false);
        useWorkspaceStore.getState().setActiveWorkspaceId(null);
        replaceSession(queryClient, null);
        void navigate('/', { replace: true });
        toast.success('Your account has been deleted');
      },
      onError: (caught) => {
        const owner =
          caught instanceof ApiRequestError && caught.status === 409
            ? soleOwnerDetailsSchema.safeParse(caught.details)
            : null;
        if (owner?.success) {
          setSoleOwner(owner.data);
          return;
        }
        setError(
          caught instanceof ApiRequestError && caught.code === 'WRONG_CODE'
            ? 'That password is not right'
            : changeErrorMessage(caught),
        );
      },
    });
  };

  if (user.isDemo) return null;

  return (
    <Card className="border-danger/40">
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
        <CardDescription>
          Your account goes for good, with the workspaces only you are in and their forms. Shared
          workspaces stay with their other members.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="secondary"
          className="text-danger-text"
          onClick={() => {
            setPassword('');
            setError(null);
            setSoleOwner(null);
            setOpen(true);
          }}
        >
          Delete account
        </Button>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent>
            <form
              noValidate
              className="contents"
              onSubmit={(event) => {
                event.preventDefault();
                if (password && !mutation.isPending) remove();
              }}
            >
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  You will be signed out, and this can&apos;t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {soleOwner ? (
                <div role="alert" className="flex flex-col gap-2 text-14">
                  <p>
                    You are the only owner of{' '}
                    {soleOwner.workspaces.length === 1
                      ? 'this shared workspace'
                      : 'these shared workspaces'}
                    . Make someone else an owner, or delete{' '}
                    {soleOwner.workspaces.length === 1 ? 'it' : 'them'}, first:
                  </p>
                  <ul className="list-disc pl-5">
                    {soleOwner.workspaces.map((workspace) => (
                      <li key={workspace.id} className="font-medium break-words">
                        {workspace.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <FormField id={id} label="Your password" error={error ?? undefined}>
                  <PasswordInput
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                    }}
                  />
                </FormField>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel type="button">
                  {soleOwner ? 'Close' : 'Cancel'}
                </AlertDialogCancel>
                {!soleOwner && (
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={!password || mutation.isPending}
                  >
                    {mutation.isPending ? 'Deleting…' : 'Delete account'}
                  </Button>
                )}
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
