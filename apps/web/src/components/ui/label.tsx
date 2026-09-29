import { Label as LabelPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      'text-13 font-medium text-foreground select-none',
      'peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
      className,
    )}
    {...props}
  />
));
Label.displayName = 'Label';
