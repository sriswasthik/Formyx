import { Popover as PopoverPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { popoverMotion, popoverSurface } from './styles';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, sideOffset = 4, align = 'start', ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      align={align}
      className={cn(
        popoverSurface,
        popoverMotion,
        'max-h-(--radix-popover-content-available-height) origin-(--radix-popover-content-transform-origin) outline-none',
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = 'PopoverContent';
