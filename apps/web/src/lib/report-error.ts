/*
 * What the app calls to start monitoring and report errors. The monitoring module loads in a
 * chunk of its own, and only in builds with VITE_SENTRY_DSN, so it costs a public form nothing
 * otherwise (see lib/monitoring.ts).
 */

const loadMonitoring = () => import('./monitoring');

/** Starts error monitoring, if this build has a DSN. Call once, when the app starts. */
export function startErrorMonitoring(): void {
  if (!import.meta.env.VITE_SENTRY_DSN) return;
  loadMonitoring()
    .then(({ startMonitoring }) => {
      startMonitoring();
    })
    .catch(() => {
      // Offline or blocked: the app works the same without it.
    });
}

/** Reports an unexpected error, if this build has a DSN. Never throws. */
export function reportError(error: unknown, context: Record<string, string> = {}): void {
  if (!import.meta.env.VITE_SENTRY_DSN) return;
  loadMonitoring()
    .then((monitoring) => {
      monitoring.reportError(error, context);
    })
    .catch(() => {
      // As above.
    });
}
