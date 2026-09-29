import { QueryClientProvider } from '@tanstack/react-query';
import { LucideProvider } from 'lucide-react';
import { MotionConfig } from 'motion/react';
import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useThemeSync } from '@/features/theme/theme-store';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { createQueryClient } from './query-client';
import { routes } from './routes';

const router = createBrowserRouter(routes);

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
          <TooltipProvider delayDuration={300}>
            <RouterProvider router={router} />
            <Toaster />
          </TooltipProvider>
        </LucideProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
