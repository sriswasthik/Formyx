import * as Sentry from '@sentry/node';
import type { ErrorEvent } from '@sentry/node';
import type { Env } from '../config/env.js';

/*
 * Error monitoring with Sentry, when SENTRY_DSN is set. Only errors are sent (no tracing, no
 * profiling), and nothing that could identify a person: no IPs, cookies, headers, query
 * strings or bodies, which can hold answers, emails, passwords and private edit tokens.
 */

/** Request headers worth keeping: they say what made the request, not who. */
const KEPT_HEADERS = new Set(['user-agent', 'content-type', 'accept']);

/** Strips an event down to what debugging needs. Exported for tests. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const { request, user: _user, ...rest } = event;
  if (!request) return rest;
  const headers = Object.fromEntries(
    Object.entries(request.headers ?? {}).filter(([name]) => KEPT_HEADERS.has(name.toLowerCase())),
  );
  return {
    ...rest,
    request: {
      method: request.method,
      // Without its query string, which can carry tokens.
      url: request.url?.split('?')[0],
      headers,
    },
  };
}

let started = false;

/** Starts Sentry if SENTRY_DSN is set; returns whether it did. Call once, at startup. */
export function startMonitoring(
  env: Pick<Env, 'SENTRY_DSN' | 'NODE_ENV' | 'RENDER_GIT_COMMIT'>,
): boolean {
  if (!env.SENTRY_DSN || started) return started;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: env.RENDER_GIT_COMMIT,
    // Nothing about people or requests: the scrubber below is a second line of defence.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    // Errors only: no OpenTelemetry, tracing or automatic instrumentation.
    enableOpenTelemetrySetup: false,
    enableRuntimeChannelInjection: false,
    defaultIntegrations: false,
    integrations: [
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
      Sentry.functionToStringIntegration(),
      Sentry.eventFiltersIntegration(),
      Sentry.contextLinesIntegration(),
      Sentry.nodeContextIntegration(),
    ],
    beforeSend: scrubEvent,
    // Breadcrumbs could repeat log lines or URLs; errors carry their own context.
    maxBreadcrumbs: 0,
  });
  started = true;
  return true;
}

/**
 * Reports an unexpected error with a little context (never personal data). Does nothing
 * when monitoring is off, so callers need not check.
 */
export function reportError(error: unknown, context: Record<string, string | number> = {}) {
  if (!started) return;
  Sentry.withScope((scope) => {
    scope.setContext('formyx', context);
    Sentry.captureException(error);
  });
}

/** Sends what is waiting, for a clean shutdown. */
export async function stopMonitoring(): Promise<void> {
  if (!started) return;
  await Sentry.close(2000);
}

/**
 * Errors that mean a bug in our code rather than something outside it failing (a receiver
 * down, a revoked token), for reporting failed background jobs without the noise.
 */
export function isProgrammingError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    error instanceof ReferenceError ||
    error instanceof RangeError ||
    error instanceof SyntaxError
  );
}
