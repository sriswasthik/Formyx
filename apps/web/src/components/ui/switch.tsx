import { Switch as SwitchPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5',
      'transition-colors duration-150 ease-standard',
      'bg-input hover:not-disabled:bg-control',
      'data-[state=checked]:bg-primary hover:not-disabled:data-[state=checked]:bg-primary-hover',
      'disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'pointer-events-none block size-4 rounded-full bg-background shadow-[0_1px_2px_rgb(0_0_0/0.2)]',
        'transition-transform duration-150 ease-standard',
        'data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0',
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';
