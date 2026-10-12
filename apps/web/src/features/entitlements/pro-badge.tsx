import { FEATURES, type FeatureId } from '@formyx/shared';
import { Badge, badgeVariants } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useUpgradeStore } from './upgrade-store';

/**
 * Marks a Pro font, texture, preset or feature. Its text is read with the option it sits in
 * ("Fraunces Pro"), so it needs no label of its own. Given the `feature` it marks, and when it
 * stands on its own (not inside another control), it is a button that opens the upgrade dialog.
 */
export function ProBadge({ className, feature }: { className?: string; feature?: FeatureId }) {
  const openUpgrade = useUpgradeStore((state) => state.openUpgrade);
  if (!feature) {
    return (
      <Badge variant="accent" className={cn('h-4.5 px-1.5', className)}>
        Pro
      </Badge>
    );
  }
  return (
    <button
      type="button"
      aria-label={`${FEATURES[feature].name} is a Pro feature: see plans`}
      onClick={() => {
        openUpgrade([feature]);
      }}
      className={cn(
        badgeVariants({ variant: 'accent' }),
        'h-4.5 cursor-pointer px-1.5 transition-colors duration-150 ease-standard hover:bg-accent/20',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
        className,
      )}
    >
      Pro
    </button>
  );
}
