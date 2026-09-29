import type { LucideIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center',
        className,
      )}
    >
      <div className="mb-4 flex size-10 items-center justify-center rounded-lg border bg-background text-muted-foreground">
        <Icon aria-hidden />
      </div>
      <p className="text-14 font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-14 text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
