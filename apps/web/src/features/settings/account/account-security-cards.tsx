import {
  changePasswordInputSchema,
  PASSWORD_MIN_LENGTH,
  setPasswordInputSchema,
} from '@formyx/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { PasswordInput } from '@/components/password-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { changePassword, setFirstPassword } from '@/features/account/account-api';
import { meQueryKey } from '@/features/auth/session-cache';
import { useSession } from '@/features/auth/session-context';
import { ApiRequestError, changeErrorMessage } from '@/lib/api';

/** Changing the password signs out every other device. */
export function PasswordCard() {
  const { user } = useSession();
  if (user.hasPassword === false) return <SetPasswordCard />;
  return <ChangePasswordCard />;
}

/**
 * For an account made through Google or Zoho: a password lets them log in with their email
 * too. It signs out other devices, as changing one does.
 */
function SetPasswordCard() {
  const queryClient = useQueryClient();
  const formId = useId();
  const mutation = useMutation({ mutationFn: setFirstPassword });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(setPasswordInputSchema),
    defaultValues: { newPassword: '' },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          You sign in with Google or Zoho. Set a password to log in with your email as well.
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
                  // The session now says there is a password: this card becomes "change it".
                  void queryClient.invalidateQueries({ queryKey: meQueryKey });
                  toast.success('Password set', {
                    description: 'You can now log in with your email and password.',
                  });
                },
                onError: (error) => {
                  toast.error('Could not set the password', {
                    description: changeErrorMessage(error),
                  });
                },
              });
            })(event)
          }
        >
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
              {mutation.isPending ? 'Setting…' : 'Set password'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard() {
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
