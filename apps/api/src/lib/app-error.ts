import type { ErrorCode } from '@formyx/shared';

/**
 * An expected, client-facing error. Its code and message are sent to the client
 * as-is, so never put internal details in the message.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    options: { details?: unknown; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = options.details;
  }
}
