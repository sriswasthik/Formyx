import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Marks a Pro font, texture, preset or feature. Its text is read with the option it sits in
 * ("Fraunces Pro"), so it needs no label of its own.
 */
export function ProBadge({ className }: { className?: string }) {
  return (
    <Badge variant="accent" className={cn('h-4.5 px-1.5', className)}>
      Pro
    </Badge>
  );
}
