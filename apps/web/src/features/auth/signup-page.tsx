import { useLocation } from 'react-router';
import { AuthLayout, AuthLink, FineprintLink } from './auth-layout';
import { ProviderSignIn } from './provider-sign-in';
import { getRedirectEmail } from './redirect';
import { ReferralInvite } from './referral-invite';
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
      fineprint={
        <>
          By continuing, you agree to our <FineprintLink to="/terms">Terms</FineprintLink> and{' '}
          <FineprintLink to="/privacy">Privacy Policy</FineprintLink>.
        </>
      }
    >
      <ReferralInvite />
      <ProviderSignIn page="signup" />
      <SignupForm defaultEmail={getRedirectEmail(state)} />
    </AuthLayout>
  );
}
