import type * as React from 'react';
import { SiteHeader } from './site-header';

/**
 * The landing page's outline: the header, then its sections. Shared by the page and by the
 * build's copy of its top (see home-shell.tsx), so the two draw the same elements.
 */
export function LandingShell({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      {footer}
    </div>
  );
}
