import { QueryClientProvider } from '@tanstack/react-query';
import { LucideProvider } from 'lucide-react';
import { MotionConfig } from 'motion/react';
import { lazy, Suspense, useState } from 'react';
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

export function App() {
  const [queryClient] = useState(createQueryClient);
  useThemeSync();
  const motion = useMotionStore((state) => state.preference);

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
            <Suspense fallback={null}>
              <Toaster />
            </Suspense>
            <OfflineNotice />
          </AppErrorBoundary>
        </LucideProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
