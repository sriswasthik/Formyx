import type * as SentryBrowser from '@sentry/browser';
import type { ErrorEvent } from '@sentry/browser';

/*
 * Error monitoring with Sentry, when VITE_SENTRY_DSN is set. Sentry loads after the page has
 * settled, in a chunk of its own, so it never slows a form's first paint or counts against
 * its bundle budget; errors before then wait for it. Only errors are sent: no tracing, no
 * session replay, no breadcrumbs, and nothing that could identify a person. A public form's
 * URL can hold prefilled answers and a private edit link's token, so URLs go without their
 * query and hash.
 */

type SentryModule = typeof SentryBrowser;
interface Pending {
  error: unknown;
  context: Record<string, string>;
}

/** Errors waiting for Sentry to load: a few are enough to see what went wrong. */
const MAX_PENDING = 10;
const pending: Pending[] = [];
let sentry: SentryModule | null = null;
let started = false;

const dsn = () => import.meta.env.VITE_SENTRY_DSN;

function withoutQuery(url: string | undefined): string | undefined {
  return url?.split(/[?#]/)[0];
}

/** Strips an event down to what debugging needs. Exported for tests. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const { request, user: _user, breadcrumbs: _breadcrumbs, ...rest } = event;
  const userAgent = request?.headers?.['User-Agent'];
  return {
    ...rest,
    ...(request && {
      request: {
        url: withoutQuery(request.url),
        ...(userAgent && { headers: { 'User-Agent': userAgent } }),
      },
    }),
  };
}

function capture(module: SentryModule, { error, context }: Pending) {
  module.withScope((scope) => {
    scope.setContext('formyx', context);
    module.captureException(error);
  });
}

/** Reports an unexpected error. Does nothing without a DSN, so callers need not check. */
export function reportError(error: unknown, context: Record<string, string> = {}): void {
  if (!dsn()) return;
  if (sentry) {
    capture(sentry, { error, context });
  } else if (pending.length < MAX_PENDING) {
    pending.push({ error, context });
  }
}

async function load(): Promise<void> {
  const module = await import('@sentry/browser');
  module.init({
    dsn: dsn(),
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    // Errors only, through the listeners below: no automatic tracing, replay or breadcrumbs.
    defaultIntegrations: false,
    integrations: [
      module.linkedErrorsIntegration(),
      module.dedupeIntegration(),
      module.functionToStringIntegration(),
      module.eventFiltersIntegration(),
      module.httpContextIntegration(),
    ],
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    beforeSend: scrubEvent,
    maxBreadcrumbs: 0,
  });
  sentry = module;
  for (const item of pending.splice(0)) capture(module, item);
}

/**
 * Starts listening for uncaught errors at once, and loads Sentry once the page is idle. Call
 * once, when the app starts.
 */
export function startMonitoring(): void {
  if (!dsn() || started) return;
  started = true;
  window.addEventListener('error', (event) => {
    reportError(event.error ?? event.message, { source: 'window' });
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason, { source: 'promise' });
  });
  const begin = () => {
    load().catch(() => {
      // Blocked by an extension or offline: the app works the same without it.
    });
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(begin, { timeout: 5000 });
  } else {
    setTimeout(begin, 2000);
  }
}
