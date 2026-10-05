import { Slider as SliderPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

/** A single-thumb slider. Arrow keys step, Page Up/Down take bigger steps, Home/End jump. */
export const Slider = React.forwardRef<
  React.ComponentRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & { thumbLabel?: string }
>(({ className, thumbLabel, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      'relative flex h-5 w-full touch-none items-center select-none data-disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-muted">
      <SliderPrimitive.Range className="absolute h-full bg-foreground/70" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      aria-label={thumbLabel}
      className={cn(
        'block size-4 cursor-grab rounded-full border border-border-strong bg-background shadow-[0_1px_2px_rgb(0_0_0/0.12)]',
        'transition-[border-color,box-shadow] duration-150 ease-standard',
        'hover:border-control active:cursor-grabbing',
      )}
    />
  </SliderPrimitive.Root>
));
Slider.displayName = 'Slider';
