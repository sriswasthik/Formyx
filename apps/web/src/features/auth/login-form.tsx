import { loginInputSchema } from '@formyx/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormAlert } from '@/components/form-alert';
import { FormField } from '@/components/form-field';
import { PasswordInput } from '@/components/password-input';
import { Input } from '@/components/ui/input';
import { applyServerError } from './server-errors';
import { SubmitButton } from './submit-button';
import { useLogIn } from './use-session';

export function LoginForm({ defaultEmail = '' }: { defaultEmail?: string }) {
  const logIn = useLogIn();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginInputSchema),
    mode: 'onTouched',
    defaultValues: { email: defaultEmail, password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      // On success GuestRoute moves the user on, as soon as the session is stored.
      await logIn.mutateAsync(values);
    } catch (error) {
      setFormError(applyServerError(error, ['email', 'password'], setError));
    }
  });

  return (
    <form
      noValidate
      aria-label="Log in"
      onSubmit={(event) => void onSubmit(event)}
      className="flex flex-col gap-4"
    >
      {formError && <FormAlert>{formError}</FormAlert>}
      <FormField id="login-email" label="Email" error={errors.email?.message}>
        <Input
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          {...register('email')}
        />
      </FormField>
      <FormField id="login-password" label="Password" error={errors.password?.message}>
        <PasswordInput autoComplete="current-password" {...register('password')} />
      </FormField>
      <SubmitButton pending={isSubmitting} pendingLabel="Logging in…">
        Log in
      </SubmitButton>
    </form>
  );
}
