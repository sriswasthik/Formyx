import {
  createApiError,
  toValidationIssues,
  type ApiErrorBody,
  type ErrorCode,
} from '@formyx/shared';
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/app-error.js';
import { reportError } from '../lib/monitoring.js';

export interface ErrorResponse {
  status: number;
  body: ApiErrorBody;
}

/** Shape of errors raised by body-parser and other http-errors based middleware. */
interface HttpError extends Error {
  status: number;
  expose?: boolean;
  type?: string;
}

function isHttpError(error: unknown): error is HttpError {
  return error instanceof Error && 'status' in error && typeof error.status === 'number';
}

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'RATE_LIMITED',
};

/** Maps any thrown value to a status code and our standard error body. */
export function toErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: createApiError(error.code, error.message, error.details),
    };
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      body: createApiError(
        'VALIDATION_ERROR',
        'Request validation failed',
        toValidationIssues(error),
      ),
    };
  }

  if (isHttpError(error)) {
    if (error.type === 'entity.parse.failed') {
      return { status: 400, body: createApiError('BAD_REQUEST', 'Request body is not valid JSON') };
    }
    if (error.status === 413) {
      return {
        status: 413,
        body: createApiError('PAYLOAD_TOO_LARGE', 'Request body is too large'),
      };
    }
    if (error.status >= 400 && error.status < 500 && error.expose === true) {
      return {
        status: error.status,
        body: createApiError(CODE_BY_STATUS[error.status] ?? 'BAD_REQUEST', error.message),
      };
    }
  }

  return { status: 500, body: createApiError('INTERNAL_ERROR', 'Something went wrong') };
}

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const { status, body } = toErrorResponse(error);
  if (status >= 500) {
    // pino-http attaches `res.err` to the request log line, including the stack.
    res.err = error instanceof Error ? error : new Error(String(error));
    // The route's pattern, not its URL, which can hold ids and tokens.
    const route = req.route as { path?: unknown } | undefined;
    reportError(error, {
      method: req.method,
      route: `${req.baseUrl}${typeof route?.path === 'string' ? route.path : ''}`,
    });
  }
  res.status(status).json(body);
};
