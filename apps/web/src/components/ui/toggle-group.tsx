import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

/** A segmented control: a row of buttons where one (or several) can be on. */
export const ToggleGroup = React.forwardRef<
  React.ComponentRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    className={cn(
      'inline-flex h-9 items-center gap-0.5 rounded-lg border bg-background p-0.5',
      className,
    )}
    {...props}
  />
));
ToggleGroup.displayName = 'ToggleGroup';

export const ToggleGroupItem = React.forwardRef<
  React.ComponentRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Item
    ref={ref}
    className={cn(
      'inline-flex h-full min-w-8 items-center justify-center gap-1.5 rounded-md px-2 text-13 font-medium text-muted-foreground select-none',
      'transition-colors duration-150 ease-standard',
      'hover:not-disabled:bg-hover hover:not-disabled:text-foreground active:not-disabled:bg-pressed',
      'data-[state=on]:bg-pressed data-[state=on]:text-foreground',
      'disabled:opacity-50',
      '[&_svg]:shrink-0',
      className,
    )}
    {...props}
  />
));
ToggleGroupItem.displayName = 'ToggleGroupItem';
