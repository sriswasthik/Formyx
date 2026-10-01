import { QueryClientProvider } from '@tanstack/react-query';
import { LucideProvider } from 'lucide-react';
import { MotionConfig } from 'motion/react';
import { lazy, Suspense, useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { useThemeSync } from '@/features/theme/theme-store';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
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

  return (
    <QueryClientProvider client={queryClient}>
      {/* reducedMotion="user" drops transform animations when the OS asks for less motion. */}
      <MotionConfig
        reducedMotion="user"
        transition={{ duration: DURATION.base, ease: EASE_STANDARD }}
      >
        <LucideProvider size={16} strokeWidth={1.75}>
          <RouterProvider router={router} />
          <Suspense fallback={null}>
            <Toaster />
          </Suspense>
        </LucideProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
