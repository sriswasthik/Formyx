import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The app's page container: at most 1200px wide, left-aligned, with 24px of side padding on
 * phones and 32px from tablets up. The shell puts every page in it, so headers, toolbars and
 * content share one left edge.
 */
export const PAGE_CONTAINER = 'w-full max-w-[1200px] px-6 md:px-8';

interface PageHeaderProps {
  title: string;
  /** One muted line under the title. */
  description?: React.ReactNode;
  /** Buttons on the right of the title row (below it on phones). */
  actions?: React.ReactNode;
  className?: string;
}

/** A page's one heading, its line underneath and its main actions. */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate text-24 font-semibold tracking-tight">{title}</h1>
        {description && (
          // A div, as the line can hold a skeleton or badges while it loads.
          <div className="mt-1 text-14 text-muted-foreground tabular-nums">{description}</div>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** The row under a page header: search, filters and view options, on one line when they fit. */
export function PageToolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>;
}
