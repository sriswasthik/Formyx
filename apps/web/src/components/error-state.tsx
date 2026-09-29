import { CircleAlert } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'Please try again. If the problem persists, reload the page.',
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border px-6 py-16 text-center',
        className,
      )}
    >
      <div className="mb-4 flex size-10 items-center justify-center rounded-lg border bg-background text-danger">
        <CircleAlert aria-hidden />
      </div>
      <p className="text-14 font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-14 text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
