import { QueryClientProvider } from '@tanstack/react-query';
import { LucideProvider } from 'lucide-react';
import { MotionConfig } from 'motion/react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { MOTION_CONFIG, useMotionStore } from '@/features/motion/motion-preference';
import { useThemeSync } from '@/features/theme/theme-store';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { AppErrorBoundary } from './app-error-boundary';
import { OfflineNotice } from './offline-notice';
import { createQueryClient } from './query-client';
import { routes } from './routes';

const router = createBrowserRouter(routes);

// Toasts load after the page: public forms never show one, so they never pay for them.
const Toaster = lazy(() =>
  import('@/components/ui/sonner').then((module) => ({ default: module.Toaster })),
);

/**
 * On a public form the toaster waits for the page to finish loading, so its code never
 * competes with the form's for a slow connection. Elsewhere it mounts at once: a toast sent
 * before it mounts would be lost.
 */
function useToasterReady(): boolean {
  const [ready, setReady] = useState(
    () => !window.location.pathname.startsWith('/f/') || document.readyState === 'complete',
  );
  useEffect(() => {
    if (ready) return;
    const done = () => {
      setReady(true);
    };
    window.addEventListener('load', done, { once: true });
    return () => {
      window.removeEventListener('load', done);
    };
  }, [ready]);
  return ready;
}

export function App() {
  const [queryClient] = useState(createQueryClient);
  useThemeSync();
  const motion = useMotionStore((state) => state.preference);
  const toasterReady = useToasterReady();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Drops transform animations when the OS (or the person's preference) asks for less. */}
      <MotionConfig
        reducedMotion={MOTION_CONFIG[motion]}
        transition={{ duration: DURATION.base, ease: EASE_STANDARD }}
      >
        <LucideProvider size={16} strokeWidth={1.75}>
          <AppErrorBoundary>
            <RouterProvider router={router} />
            {toasterReady && (
              <Suspense fallback={null}>
                <Toaster />
              </Suspense>
            )}
            <OfflineNotice />
          </AppErrorBoundary>
        </LucideProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
