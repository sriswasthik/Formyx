import { PASSWORD_MIN_LENGTH, registerInputSchema } from '@formyx/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormAlert } from '@/components/form-alert';
import { FormField } from '@/components/form-field';
import { clearAttribution, readAttribution } from '@/lib/attribution';
import { PasswordInput } from '@/components/password-input';
import { Input } from '@/components/ui/input';
import { applyServerError } from './server-errors';
import { SubmitButton } from './submit-button';
import { useSignUp } from './use-session';

export function SignupForm({ defaultEmail = '' }: { defaultEmail?: string }) {
  const signUp = useSignUp();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registerInputSchema),
    mode: 'onTouched',
    defaultValues: { name: '', email: defaultEmail, password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      // On success GuestRoute moves the user on, as soon as the session is stored.
      const attribution = readAttribution();
      await signUp.mutateAsync({
        ...values,
        ...(attribution?.referralCode && { referralCode: attribution.referralCode }),
        ...(attribution?.source && { source: attribution.source }),
      });
      clearAttribution();
    } catch (error) {
      setFormError(applyServerError(error, ['name', 'email', 'password'], setError));
    }
  });

  return (
    <form
      noValidate
      aria-label="Sign up"
      onSubmit={(event) => void onSubmit(event)}
      className="flex flex-col gap-4"
    >
      {formError && <FormAlert>{formError}</FormAlert>}
      <FormField id="signup-name" label="Name" error={errors.name?.message}>
        <Input autoComplete="name" {...register('name')} />
      </FormField>
      <FormField id="signup-email" label="Email" error={errors.email?.message}>
        <Input
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          {...register('email')}
        />
      </FormField>
      <FormField
        id="signup-password"
        label="Password"
        error={errors.password?.message}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
      >
        <PasswordInput autoComplete="new-password" {...register('password')} />
      </FormField>
      <SubmitButton pending={isSubmitting} pendingLabel="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
