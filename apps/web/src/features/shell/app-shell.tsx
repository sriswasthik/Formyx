import { Menu } from 'lucide-react';
import { m } from 'motion/react';
import { useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useCurrentTitle } from '@/app/page-title';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useSession } from '@/features/auth/session-context';
import { BillingBanner } from '@/features/billing/billing-banner';
import { DemoBanner } from '@/features/demo/demo-banner';
import { UpgradeDialogHost } from '@/features/entitlements/upgrade-dialog';
import { ThemeToggle } from '@/features/theme/theme-toggle';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { Sidebar } from './sidebar';

/** Layout for signed-in pages: sidebar (a sheet on mobile), top bar and content. */
export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();
  const title = useCurrentTitle();
  const { user } = useSession();

  const closeNav = () => {
    setNavOpen(false);
  };

  return (
    <Sheet open={navOpen} onOpenChange={setNavOpen}>
      <a
        href="#main-content"
        className="sr-only rounded-lg border bg-background px-3 py-2 text-14 font-medium shadow-popover focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>

      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r bg-surface md:block">
          <Sidebar id="desktop" />
        </aside>

        <SheetContent
          side="left"
          className="w-64 bg-surface"
          aria-describedby={undefined}
          showCloseButton={false}
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar id="mobile" onNavigate={closeNav} />
        </SheetContent>

        <div className="flex min-w-0 flex-1 flex-col">
          {user.isDemo ? <DemoBanner /> : <BillingBanner />}
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 md:px-8 lg:px-10">
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="-ml-1 md:hidden"
                aria-label="Open navigation"
              >
                <Menu aria-hidden />
              </Button>
            </SheetTrigger>
            {title && <h1 className="truncate text-16 font-semibold tracking-tight">{title}</h1>}
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
            </div>
          </header>

          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 px-6 py-6 outline-none md:px-8 md:py-8 lg:px-10"
          >
            <m.div
              key={pathname}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATION.base, ease: EASE_STANDARD }}
              className="mx-auto w-full max-w-5xl"
            >
              <Outlet />
            </m.div>
          </main>
        </div>
      </div>
      <UpgradeDialogHost />
    </Sheet>
  );
}
