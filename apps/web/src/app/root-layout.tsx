import { useEffect } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import { isEmbedded } from '@/lib/embed';
import { AppMotion } from './app-motion';
import { useCurrentTitle } from './page-title';
import { formatDocumentTitle } from './route-handle';

export function RootLayout() {
  const title = useCurrentTitle();

  useEffect(() => {
    document.title = formatDocumentTitle(title);
  }, [title]);

  return (
    <AppMotion>
      <Outlet />
      <ScrollRestoration />
    </AppMotion>
  );
}

/** Shown while a lazy route loads on first visit. */
export function RouteFallback() {
  // Inside another site, an empty transparent box rather than a page-sized white one.
  return isEmbedded() ? null : <div className="min-h-dvh bg-background" />;
}
