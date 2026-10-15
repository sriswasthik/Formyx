import { m, useReducedMotionConfig } from 'motion/react';
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { PAGE_CONTAINER } from '@/components/page-header';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useSession } from '@/features/auth/session-context';
import { BillingBanner } from '@/features/billing/billing-banner';
import { CommandPalette } from '@/features/command-palette/command-palette';
import { usePaletteStore } from '@/features/command-palette/palette-store';
import { DemoBanner } from '@/features/demo/demo-banner';
import { UpgradeDialogHost } from '@/features/entitlements/upgrade-dialog';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { matchesShortcut } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';
import { APP_SHORTCUTS, isTypingTarget } from './app-shortcuts';
import { Sidebar } from './sidebar';
import { SIDEBAR_RAIL_WIDTH, SIDEBAR_WIDTH, useSidebarStore } from './sidebar-store';
import { TopBar } from './top-bar';

/** Ctrl/⌘ K for the command palette and "[" for the sidebar, wherever the app is. */
function useShellShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (matchesShortcut(event, APP_SHORTCUTS.search)) {
        event.preventDefault();
        const palette = usePaletteStore.getState();
        palette.setOpen(!palette.open);
        return;
      }
      if (
        matchesShortcut(event, APP_SHORTCUTS.sidebar) &&
        !event.altKey &&
        !isTypingTarget(event.target) &&
        !usePaletteStore.getState().open
      ) {
        event.preventDefault();
        useSidebarStore.getState().toggle();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}

/**
 * Layout for signed-in pages: the sidebar (a 64px rail when collapsed; a sheet on phones),
 * the breadcrumbs bar and the page, in the one page container.
 */
export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();
  const { user } = useSession();
  const collapsed = useSidebarStore((state) => state.collapsed);
  const reduceMotion = useReducedMotionConfig() ?? false;
  useShellShortcuts();

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
        <m.aside
          aria-label="Sidebar"
          data-collapsed={collapsed || undefined}
          initial={false}
          animate={{ width: collapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH }}
          transition={{ duration: reduceMotion ? 0 : DURATION.base, ease: EASE_STANDARD }}
          style={{ width: collapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH }}
          className="sticky top-0 hidden h-dvh shrink-0 overflow-hidden border-r bg-surface md:block"
        >
          <Sidebar collapsed={collapsed} collapsible />
        </m.aside>

        <SheetContent
          side="left"
          className="w-[248px] max-w-[85vw] bg-surface"
          aria-describedby={undefined}
          showCloseButton={false}
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar onNavigate={closeNav} />
        </SheetContent>

        <div className="flex min-w-0 flex-1 flex-col">
          {user.isDemo ? <DemoBanner /> : <BillingBanner />}
          <TopBar />
          <main
            id="main-content"
            tabIndex={-1}
            className={cn(PAGE_CONTAINER, 'flex-1 py-6 outline-none md:py-8')}
          >
            <m.div
              key={pathname}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATION.base, ease: EASE_STANDARD }}
            >
              <Outlet />
            </m.div>
          </main>
        </div>
      </div>
      <CommandPalette />
      <UpgradeDialogHost />
    </Sheet>
  );
}
