import { m } from 'motion/react';
import { Slot } from 'radix-ui';
import type * as React from 'react';
import { Label } from '@/components/ui/label';
import { DURATION, EASE_STANDARD } from '@/lib/motion';

interface FormFieldProps {
  /** Id for the control; the label, hint and error are linked to it. */
  id: string;
  label: string;
  /** Replaces the hint while present. */
  error?: string;
  hint?: string;
  /** A single form control. It receives `id`, `aria-invalid` and `aria-describedby`. */
  children: React.ReactElement;
}

/** Label, control and message, wired together for assistive technology. */
export function FormField({ id, label, error, hint, children }: FormFieldProps) {
  const messageId = `${id}-message`;
  const message = error ?? hint;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Slot.Root
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
      >
        {children}
      </Slot.Root>
      {error ? (
        <m.p
          key="error"
          id={messageId}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.fast, ease: EASE_STANDARD }}
          className="text-13 text-danger-text"
        >
          {error}
        </m.p>
      ) : (
        hint && (
          <p id={messageId} className="text-13 text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
