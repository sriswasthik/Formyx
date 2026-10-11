import type * as React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  hint?: string;
  error?: string | undefined;
  triggerClassName?: string;
  /** The `SelectItem`s. */
  children: React.ReactNode;
}

/**
 * A labelled select for settings. The label, hint and error go on the trigger itself, which
 * is the element that takes focus (FormField would give them to the Select's root, which
 * renders nothing).
 */
export function SelectField({
  id,
  label,
  value,
  onValueChange,
  hint,
  error,
  triggerClassName,
  children,
}: SelectFieldProps) {
  const messageId = `${id}-message`;
  const message = error ?? hint;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className={cn('w-full', triggerClassName)}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
      {message && (
        <p
          id={messageId}
          className={cn('text-13', error ? 'text-danger-text' : 'text-muted-foreground')}
        >
          {message}
        </p>
      )}
    </div>
  );
}
