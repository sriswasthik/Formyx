import { motion } from 'motion/react';
import type * as React from 'react';
import { Link } from 'react-router';
import { Logo } from '@/components/logo';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ThemeToggle } from '@/features/theme/theme-toggle';
import { DURATION, EASE_STANDARD } from '@/lib/motion';

interface AuthLayoutProps {
  title: string;
  description: string;
  /** Shown under the card, e.g. the link to the other auth page. */
  footer: React.ReactNode;
  children: React.ReactNode;
}

/** Centered card layout shared by the log-in and sign-up pages. */
export function AuthLayout({ title, description, footer, children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 shrink-0 items-center justify-end px-6 md:px-10">
        <ThemeToggle />
      </header>
      <main className="flex flex-1 justify-center px-6 pb-16 sm:items-center sm:pb-24">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.slow, ease: EASE_STANDARD }}
          className="w-full max-w-sm"
        >
          <Link to="/" className="mx-auto mb-8 flex w-fit rounded-md p-1" aria-label="Formyx home">
            <Logo />
          </Link>
          <Card>
            <CardHeader className="gap-1.5">
              <h1 className="text-20 font-semibold tracking-tight">{title}</h1>
              <p className="text-14 text-muted-foreground">{description}</p>
            </CardHeader>
            <CardContent>{children}</CardContent>
          </Card>
          <p className="mt-6 text-center text-14 text-muted-foreground">{footer}</p>
        </motion.div>
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
