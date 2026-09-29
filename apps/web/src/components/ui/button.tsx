import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap select-none',
    'transition-[color,background-color,border-color,opacity] duration-150 ease-standard',
    'disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground hover:not-disabled:bg-primary-hover active:not-disabled:bg-primary-active',
        secondary:
          'border border-border-strong bg-background text-foreground hover:not-disabled:bg-hover active:not-disabled:bg-pressed',
        ghost: 'text-foreground hover:not-disabled:bg-hover active:not-disabled:bg-pressed',
        destructive:
          'bg-destructive text-destructive-foreground hover:not-disabled:bg-destructive-hover active:not-disabled:bg-destructive-active',
      },
      size: {
        sm: 'h-8 px-3 text-13',
        md: 'h-9 px-4 text-14',
        lg: 'h-10 px-5 text-14',
        icon: 'size-9',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a router Link) with button styles instead of a <button>. */
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        // Default to "button" so buttons inside forms never submit by accident.
        type={asChild ? type : (type ?? 'button')}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
