import { cn } from '@/lib/utils';

/** A 2px accent line showing where a dragged question will land. */
export function DropIndicator({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      data-testid="drop-indicator"
      className={cn(
        'pointer-events-none absolute inset-x-0 z-20 h-0.5 rounded-full bg-accent',
        'before:absolute before:top-1/2 before:-left-1 before:size-2 before:-translate-y-1/2 before:rounded-full before:border-2 before:border-accent before:bg-background',
        'after:absolute after:top-1/2 after:-right-1 after:size-2 after:-translate-y-1/2 after:rounded-full after:border-2 after:border-accent after:bg-background',
        className,
      )}
    />
  );
}
