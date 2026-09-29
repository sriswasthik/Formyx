import { Check, Minus } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'group peer inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-control bg-background text-primary-foreground',
      'transition-[background-color,border-color] duration-150 ease-standard',
      'hover:not-disabled:border-muted-foreground',
      'data-[state=checked]:border-primary data-[state=checked]:bg-primary',
      'data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary',
      'hover:not-disabled:data-[state=checked]:bg-primary-hover hover:not-disabled:data-[state=indeterminate]:bg-primary-hover',
      'disabled:opacity-50 aria-invalid:border-danger',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center">
      <Check
        className="size-3 group-data-[state=indeterminate]:hidden"
        strokeWidth={2.5}
        aria-hidden
      />
      <Minus
        className="hidden size-3 group-data-[state=indeterminate]:block"
        strokeWidth={2.5}
        aria-hidden
      />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = 'Checkbox';
