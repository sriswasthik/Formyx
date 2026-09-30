import {
  meResponseSchema,
  type LoginInput,
  type MeResponse,
  type RegisterInput,
} from '@formyx/shared';
import { z } from 'zod';
import { apiRequest, ApiRequestError } from '@/lib/api';
import { hasSessionHint, setSessionHint } from './session-cache';

function postJson(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/** The signed-in user, or `null` when there is no valid session. */
export async function fetchMe(): Promise<MeResponse | null> {
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
  return apiRequest('/auth/login', meResponseSchema, postJson(input));
}

export function signUp(input: RegisterInput): Promise<MeResponse> {
  return apiRequest('/auth/register', meResponseSchema, postJson(input));
}

export async function logOut(): Promise<void> {
  // 204 No Content: there is no body to validate.
  await apiRequest('/auth/logout', z.undefined(), { method: 'POST' });
}
