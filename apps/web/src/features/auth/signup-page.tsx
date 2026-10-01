import { useLocation } from 'react-router';
import { AuthLayout, AuthLink } from './auth-layout';
import { getRedirectEmail } from './redirect';
import { SignupForm } from './signup-form';

export function SignupPage() {
  // Keep the "where were they going" state when switching between log in and sign up.
  const state: unknown = useLocation().state;

  return (
    <AuthLayout
      title="Create your account"
      description="Start building forms in minutes. It's free."
      footer={
        <>
          Already have an account?{' '}
          <AuthLink to="/login" state={state}>
            Log in
          </AuthLink>
        </>
      }
    >
      <SignupForm defaultEmail={getRedirectEmail(state)} />
    </AuthLayout>
  );
}
