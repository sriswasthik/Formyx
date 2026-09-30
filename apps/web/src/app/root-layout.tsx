import { useEffect } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import { useCurrentTitle } from './page-title';
import { formatDocumentTitle } from './route-handle';

export function RootLayout() {
  const title = useCurrentTitle();

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
