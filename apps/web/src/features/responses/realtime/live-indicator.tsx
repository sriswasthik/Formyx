import { cn } from '@/lib/utils';
import type { LiveStatus } from './realtime-client';

const PRESENTATION: Record<LiveStatus, { label: string; dot: string; description: string }> = {
  live: {
    label: 'Live',
    dot: 'bg-success',
    description: 'New responses appear as they arrive.',
  },
  connecting: {
    label: 'Connecting…',
    dot: 'bg-control',
    description: 'Connecting to live updates.',
  },
  reconnecting: {
    label: 'Reconnecting…',
    dot: 'bg-warning',
    description: 'Live updates paused. Responses that arrive meanwhile appear once it reconnects.',
  },
  offline: {
    label: 'Offline',
    dot: 'bg-control',
    description: 'Live updates are off. Reload the page to see new responses.',
  },
};

/** Whether new responses show up by themselves: a plain dot and a word. */
export function LiveIndicator({ status, className }: { status: LiveStatus; className?: string }) {
  const { label, dot, description } = PRESENTATION[status];

  return (
    <span
      role="status"
      title={description}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 text-13 whitespace-nowrap text-muted-foreground',
        className,
      )}
    >
      <span aria-hidden className={cn('size-2 rounded-full transition-colors duration-150', dot)} />
      {label}
      <span className="sr-only">. {description}</span>
    </span>
  );
}
