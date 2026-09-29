import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert } from 'lucide-react';
import type * as React from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useThemeStore } from '@/features/theme/theme-store';

export function Toaster(props: ToasterProps) {
  const theme = useThemeStore((state) => state.preference);

  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      gap={8}
      icons={{
        success: <CircleCheck className="text-success" />,
        info: <Info className="text-accent" />,
        warning: <TriangleAlert className="text-warning" />,
        error: <CircleAlert className="text-danger" />,
        loading: <LoaderCircle className="animate-spin text-muted-foreground" />,
      }}
      toastOptions={{
        classNames: {
          toast: 'rounded-xl! border-border! shadow-popover! font-sans! text-14!',
          description: 'text-muted-foreground!',
        },
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': '12px',
        } as React.CSSProperties
      }
      {...props}
    />
  );
}
