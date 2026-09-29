import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const RadioGroup = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root ref={ref} className={cn('grid gap-3', className)} {...props} />
));
RadioGroup.displayName = 'RadioGroup';

export const RadioGroupItem = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      'peer inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-control bg-background',
      'transition-[border-color] duration-150 ease-standard',
      'hover:not-disabled:border-muted-foreground data-[state=checked]:border-primary',
      'disabled:opacity-50 aria-invalid:border-danger',
      className,
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="size-2 rounded-full bg-primary" />
  </RadioGroupPrimitive.Item>
));
RadioGroupItem.displayName = 'RadioGroupItem';
