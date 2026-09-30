import { useLocation } from 'react-router';
import { AuthLayout, AuthLink } from './auth-layout';
import { LoginForm } from './login-form';

export function LoginPage() {
  // Keep the "where were they going" state when switching between log in and sign up.
  const state: unknown = useLocation().state;

  return (
    <AuthLayout
      title="Log in to Formyx"
      description="Welcome back. Enter your details to continue."
      footer={
        <>
          New to Formyx?{' '}
          <AuthLink to="/signup" state={state}>
            Create an account
          </AuthLink>
        </>
      }
    >
      <LoginForm />
    </AuthLayout>
  );
}
