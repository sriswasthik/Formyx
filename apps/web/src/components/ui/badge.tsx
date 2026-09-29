import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-12 font-medium whitespace-nowrap tabular-nums [&_svg]:size-3',
  {
    variants: {
      variant: {
        neutral: 'bg-muted text-foreground',
        outline: 'border text-muted-foreground',
        accent: 'bg-accent-subtle text-accent',
        success: 'bg-success/12 text-success-text',
        warning: 'bg-warning/12 text-warning-text',
        danger: 'bg-danger/12 text-danger-text',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
