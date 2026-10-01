import { apiErrorSchema, type ErrorCode } from '@formyx/shared';
import type { z } from 'zod';

/** Server error codes plus failures that only happen on the client. */
export type ApiErrorCode = ErrorCode | 'NETWORK_ERROR' | 'INVALID_RESPONSE' | 'UNKNOWN_ERROR';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: unknown;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    options: { details?: unknown; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = options.details;
  }
}

/** Request options for sending `body` as JSON. */
export function jsonRequest(method: 'POST' | 'PATCH' | 'PUT', body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * Calls the API (`/api${path}`), validates the JSON response with `schema`
 * and throws an `ApiRequestError` for anything unexpected.
 */
export function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  return readApiResponse(
    fetch(`/api${path}`, { credentials: 'include', ...init, headers }),
    schema,
  );
}

/**
 * The checks of `apiRequest`, for a request already on its way (e.g. one index.html started
 * before the app loaded).
 */
export async function readApiResponse<T>(
  request: Promise<Response>,
  schema: z.ZodType<T>,
): Promise<T> {
  let response: Response;
  try {
    response = await request;
  } catch (cause) {
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Could not reach the server', { cause });
  }

  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiRequestError(response.status, code, message, { details });
    }
    throw new ApiRequestError(
      response.status,
      'UNKNOWN_ERROR',
      `Request failed with status ${response.status}`,
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiRequestError(
      response.status,
      'INVALID_RESPONSE',
      'Unexpected response from the server',
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

/** What to tell people when a change was refused, in the server's words where it has some. */
export function changeErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === 'NETWORK_ERROR') return 'Check your connection and try again.';
    if (error.status >= 400 && error.status < 500) return error.message;
  }
  return 'Something went wrong. Please try again.';
}
