import * as React from 'react';
import { cn } from '@/lib/utils';
import { fieldBase } from './styles';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(fieldBase, 'flex min-h-20 resize-y px-3 py-2', className)}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
