import { useLocation } from 'react-router';
import { AuthLayout, AuthLink } from './auth-layout';
import { LoginForm } from './login-form';
import { ProviderSignIn } from './provider-sign-in';
import { getRedirectEmail } from './redirect';

export function LoginPage() {
  // Keep the "where were they going" state when switching between log in and sign up.
  const state: unknown = useLocation().state;

  return (
    <AuthLayout
      title="Log in to Formyx"
      description="Welcome back. Pick up where you left off."
      footer={
        <>
          New to Formyx?{' '}
          <AuthLink to="/signup" state={state}>
            Create an account
          </AuthLink>
        </>
      }
    >
      <ProviderSignIn page="login" />
      <LoginForm defaultEmail={getRedirectEmail(state)} />
    </AuthLayout>
  );
}
