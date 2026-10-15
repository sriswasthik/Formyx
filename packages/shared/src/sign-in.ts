import { z } from 'zod';
import { referralCodeSchema, signupSourceSchema } from './referrals.js';

/*
 * Signing in with Google or Zoho. The buttons are plain links to the API, which sends people
 * to the provider and, when they come back, signs them in (making the account the first time)
 * and sends them on into the app, or back to the log-in page with `?sign_in_error=<code>`.
 */

export const signInProviderSchema = z.enum(['google', 'zoho']);
export type SignInProvider = z.infer<typeof signInProviderSchema>;

export const SIGN_IN_PROVIDER_LABELS: Record<SignInProvider, string> = {
  google: 'Google',
  zoho: 'Zoho',
};

/** Body of `GET /api/auth/providers`: the providers this server is set up for. */
export const signInProvidersResponseSchema = z.object({
  providers: z.array(signInProviderSchema),
});
export type SignInProvidersResponse = z.infer<typeof signInProvidersResponseSchema>;

/**
 * Where people may be sent after signing in: paths inside the app, and invite links. Anything
 * else (another site, a public page) is refused, so a crafted link can't send anyone away.
 */
export function isAfterSignInPath(path: string): boolean {
  return path === '/app' || /^\/app[/?#]/.test(path) || /^\/invite\/[\w-]+$/.test(path);
}

/** Query of `GET /api/auth/oauth/:provider`, the link behind each button. */
export const signInStartQuerySchema = z.object({
  /** Where to go afterwards; ignored unless `isAfterSignInPath` accepts it. */
  next: z
    .string()
    .max(2000)
    .optional()
    .transform((path) => (path !== undefined && isAfterSignInPath(path) ? path : undefined)),
  /** For new accounts: a friend's referral code and what brought them, as on the sign-up form. */
  ref: referralCodeSchema.optional().catch(undefined),
  source: signupSourceSchema.optional().catch(undefined),
});
export type SignInStartQuery = z.input<typeof signInStartQuerySchema>;

export const SIGN_IN_ERROR_PARAM = 'sign_in_error';
/** Sent with the error: which provider it was. */
export const SIGN_IN_PROVIDER_PARAM = 'provider';

export const signInErrorSchema = z.enum([
  /** They said no at the provider, or closed it. */
  'cancelled',
  /** The round trip went stale: too slow, another tab, or a link from somewhere else. */
  'expired',
  /** The provider has not confirmed the email belongs to them, and an account already has it. */
  'unverified_email',
  /** This server is not set up for that provider. */
  'unavailable',
  /** The account is suspended. */
  'suspended',
  /** A new account at a throwaway inbox (see disposable-email.ts in the API). */
  'disposable_email',
  /** Anything else: the provider refused the code, or could not be reached. */
  'failed',
]);
export type SignInError = z.infer<typeof signInErrorSchema>;

export function signInErrorMessage(error: SignInError, provider?: SignInProvider): string {
  const name = provider ? SIGN_IN_PROVIDER_LABELS[provider] : 'that account';
  switch (error) {
    case 'cancelled':
      return `Signing in with ${name} was cancelled.`;
    case 'expired':
      return 'That sign-in took too long or was started elsewhere. Try again.';
    case 'unverified_email':
      return `An account with this email already exists, and ${name} has not confirmed the address is yours. Log in with your password instead.`;
    case 'unavailable':
      return `Signing in with ${name} is not available right now.`;
    case 'suspended':
      return 'This account is suspended. Write to us if you think this is a mistake.';
    case 'disposable_email':
      return 'Use an email address you keep: temporary inboxes can’t be used for an account.';
    case 'failed':
      return `We could not sign you in with ${name}. Try again.`;
  }
}
