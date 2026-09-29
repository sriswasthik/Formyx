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

/**
 * Calls the API (`/api${path}`), validates the JSON response with `schema`
 * and throws an `ApiRequestError` for anything unexpected.
 */
export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');

  let response: Response;
  try {
    response = await fetch(`/api${path}`, { credentials: 'include', ...init, headers });
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
