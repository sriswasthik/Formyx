import { useEffect } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { noteAttribution } from '@/lib/attribution';
import { isEmbedded } from '@/lib/embed';
import { AppMotion } from './app-motion';
import { useCurrentTitle } from './page-title';
import { formatDocumentTitle } from './route-handle';

export function RootLayout() {
  const title = useCurrentTitle();
  const { pathname, search } = useLocation();

  useEffect(() => {
    document.title = formatDocumentTitle(title);
  }, [title]);

  // `?ref=` from a referral link or the badge, kept for sign-up. Not on public forms: there a
  // `ref` belongs to the form's owner (a hidden field, say).
  useEffect(() => {
    if (!pathname.startsWith('/f/')) noteAttribution(search);
  }, [pathname, search]);

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
