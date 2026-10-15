import {
  meResponseSchema,
  signInProvidersResponseSchema,
  type LoginInput,
  type MeResponse,
  type RegisterInput,
  type SignInProvider,
  type SignInStartQuery,
} from '@formyx/shared';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { apiRequest, ApiRequestError, jsonRequest } from '@/lib/api';
import { hasSessionHint, providerSignInFailed, setSessionHint } from './session-cache';

/** The signed-in user, or `null` when there is no valid session. */
export async function fetchMe(): Promise<MeResponse | null> {
  if (providerSignInFailed()) setSessionHint(false);
  if (!hasSessionHint()) return null;
  try {
    return await apiRequest('/auth/me', meResponseSchema);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      setSessionHint(false);
      return null;
    }
    throw error;
  }
}

export function logIn(input: LoginInput): Promise<MeResponse> {
  return apiRequest('/auth/login', meResponseSchema, jsonRequest('POST', input));
}

export function signUp(input: RegisterInput): Promise<MeResponse> {
  return apiRequest('/auth/register', meResponseSchema, jsonRequest('POST', input));
}

/** The providers this server offers ("Continue with Google"), which may be none. */
export async function getSignInProviders(): Promise<SignInProvider[]> {
  return (await apiRequest('/auth/providers', signInProvidersResponseSchema)).providers;
}

/** The providers this server offers; they only change with a deploy. */
export const signInProvidersQuery = queryOptions({
  queryKey: ['auth', 'providers'] as const,
  queryFn: getSignInProviders,
  staleTime: Infinity,
});

/**
 * The link behind a provider's button: a page load that goes to the provider and comes back
 * signed in, to `next`. `page` is where a failed sign-in comes back to.
 */
export function signInStartUrl(
  provider: SignInProvider,
  { page, ...query }: SignInStartQuery & { page: 'login' | 'signup' },
): string {
  const params = new URLSearchParams({ page });
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string' && value !== '') params.set(key, value);
  }
  return `/api/auth/oauth/${provider}?${params.toString()}`;
}

export async function logOut(): Promise<void> {
  // 204 No Content: there is no body to validate.
  await apiRequest('/auth/logout', z.undefined(), { method: 'POST' });
}
