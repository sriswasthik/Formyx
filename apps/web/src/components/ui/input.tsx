import * as React from 'react';
import { cn } from '@/lib/utils';
import { fieldBase } from './styles';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = 'text', ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      fieldBase,
      'flex h-9 px-3',
      'file:mr-3 file:border-0 file:bg-transparent file:text-14 file:font-medium file:text-foreground',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
