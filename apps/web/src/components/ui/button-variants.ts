import { cva } from 'class-variance-authority';

/**
 * The button styles. Kept apart from Button (which merges classes with tailwind-merge) so the
 * pages in the app's first download (the 404 and crash screens) can style a link or button
 * without it.
 */
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
