/*
 * What can go wrong talking to an integration's service, and whether trying again can help.
 */

/** The account's access is gone (revoked, expired, its owner left): it must be connected again. */
export class IntegrationAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationAuthError';
  }
}

/** A request the service refused; `status` tells whether trying again can help. */
export class IntegrationApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'IntegrationApiError';
    this.status = status;
  }
  /** Rate limits and the service's own trouble pass; the rest won't. */
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}
