import { m } from 'motion/react';
import type * as React from 'react';
import { Link } from 'react-router';
import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/features/theme/theme-toggle';
import { DURATION, EASE_STANDARD } from '@/lib/motion';

interface AuthLayoutProps {
  title: string;
  description: string;
  /** Under the form: the link to the other auth page. */
  footer: React.ReactNode;
  /** The smallest print, at the very end (the terms, on sign-up). */
  fineprint?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The log-in and sign-up pages: one narrow column, centred both ways at every size, with no
 * card or header around it. The theme toggle waits in the corner.
 */
export function AuthLayout({ title, description, footer, fineprint, children }: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-background">
      <div className="absolute top-4 right-4 md:top-6 md:right-6">
        <ThemeToggle />
      </div>
      {/* `my-auto` rather than centring the container: a column taller than the screen
          scrolls from its top instead of being cut off above it. */}
      <main className="flex flex-1 flex-col px-6 py-12">
        <m.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.slow, ease: EASE_STANDARD }}
          className="mx-auto my-auto w-full max-w-[22.5rem]"
        >
          <header className="mb-8 flex flex-col items-center text-center">
            <Link
              to="/"
              aria-label="Formyx home"
              className="mb-6 rounded-lg transition-opacity duration-150 ease-standard hover:opacity-80"
            >
              <Logo variant="icon" size={36} decorative />
            </Link>
            <h1 className="text-24 font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-14 text-muted-foreground">{description}</p>
          </header>
          {children}
          <p className="mt-6 text-center text-14 text-muted-foreground">{footer}</p>
          {fineprint && (
            <p className="mt-4 text-center text-12 text-muted-foreground">{fineprint}</p>
          )}
        </m.div>
      </main>
    </div>
  );
}

/** Accent-coloured inline link, per the design system. */
export function AuthLink(props: React.ComponentProps<typeof Link>) {
  return (
    <Link
      className="rounded-sm font-medium text-accent underline-offset-4 transition-colors duration-150 ease-standard hover:underline"
      {...props}
    />
  );
}

/** A quiet link in the fine print. */
export function FineprintLink(props: React.ComponentProps<typeof Link>) {
  return (
    <Link
      className="rounded-sm underline underline-offset-2 transition-colors duration-150 ease-standard hover:text-foreground"
      {...props}
    />
  );
}
