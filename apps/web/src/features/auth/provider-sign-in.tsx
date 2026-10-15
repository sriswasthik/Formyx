import {
  SIGN_IN_ERROR_PARAM,
  SIGN_IN_PROVIDER_LABELS,
  SIGN_IN_PROVIDER_PARAM,
  signInErrorMessage,
  signInErrorSchema,
  signInProviderSchema,
  type SignInProvider,
} from '@formyx/shared';
import { useQuery } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { FormAlert } from '@/components/form-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { readAttribution } from '@/lib/attribution';
import { signInProvidersQuery, signInStartUrl } from './auth-api';
import { ProviderMark } from './provider-mark';
import { getRedirectTarget } from './redirect';
import { noteProviderSignIn } from './session-cache';

/** Why the last provider sign-in came back without signing in, from the page's address. */
function useSignInError(): string | null {
  const [params] = useSearchParams();
  const error = signInErrorSchema.safeParse(params.get(SIGN_IN_ERROR_PARAM));
  if (!error.success) return null;
  const provider = signInProviderSchema.safeParse(params.get(SIGN_IN_PROVIDER_PARAM));
  return signInErrorMessage(error.data, provider.success ? provider.data : undefined);
}

/**
 * "Continue with Google" and "Continue with Zoho" above the email form, for whichever this
 * server is set up for; nothing at all when it is set up for neither. Both sign in, and make
 * the account the first time, so log-in and sign-up show the same buttons.
 */
export function ProviderSignIn({ page }: { page: 'login' | 'signup' }) {
  const { data: providers, isPending } = useQuery(signInProvidersQuery);
  const error = useSignInError();
  const state: unknown = useLocation().state;
  const [leaving, setLeaving] = useState<SignInProvider | null>(null);

  // Back from the provider without finishing: the browser may restore this page as it was.
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) setLeaving(null);
    };
    window.addEventListener('pageshow', restored);
    return () => {
      window.removeEventListener('pageshow', restored);
    };
  }, []);

  const start = (provider: SignInProvider) => {
    const attribution = readAttribution();
    return signInStartUrl(provider, {
      page,
      next: getRedirectTarget(state),
      ...(attribution?.referralCode && { ref: attribution.referralCode }),
      ...(attribution?.source && { source: attribution.source }),
    });
  };

  const buttons = isPending ? (
    <div className="flex flex-col gap-3" aria-hidden>
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
  ) : providers && providers.length > 0 ? (
    // Side by side when there are two, named for the provider alone: the page stays short.
    <div className={providers.length > 1 ? 'grid grid-cols-2 gap-3' : 'flex flex-col'}>
      {providers.map((provider) => (
        <Button key={provider} asChild variant="secondary" size="lg" className="w-full">
          <a
            href={start(provider)}
            aria-label={`Continue with ${SIGN_IN_PROVIDER_LABELS[provider]}`}
            aria-disabled={leaving !== null || undefined}
            onClick={() => {
              noteProviderSignIn();
              setLeaving(provider);
            }}
          >
            {leaving === provider ? (
              <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden />
            ) : (
              <ProviderMark provider={provider} />
            )}
            {providers.length > 1
              ? SIGN_IN_PROVIDER_LABELS[provider]
              : `Continue with ${SIGN_IN_PROVIDER_LABELS[provider]}`}
          </a>
        </Button>
      ))}
    </div>
  ) : null;

  if (!error && !buttons) return null;

  return (
    <div className="mb-4 flex flex-col gap-4">
      {error && <FormAlert>{error}</FormAlert>}
      {buttons && (
        <>
          {buttons}
          <div className="flex items-center gap-3 text-12 text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
    </div>
  );
}
