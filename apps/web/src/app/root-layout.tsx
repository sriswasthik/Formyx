import { useEffect } from 'react';
import { Outlet, ScrollRestoration, useMatches } from 'react-router';
import { formatDocumentTitle, getRouteTitle } from './route-handle';

export function RootLayout() {
  const title = getRouteTitle(useMatches());

  useEffect(() => {
    document.title = formatDocumentTitle(title);
  }, [title]);

  return (
    <>
      <Outlet />
      <ScrollRestoration />
    </>
  );
}

/** Shown while a lazy route loads on first visit. */
export function RouteFallback() {
  return <div className="min-h-dvh bg-background" />;
}
