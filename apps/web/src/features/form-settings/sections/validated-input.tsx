import { useState } from 'react';
import type { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FieldError } from './section-controls';

interface ValidatedInputProps<T> {
  id: string;
  /** What is saved now. */
  value: string;
  /** Checks what is typed; only what passes is saved. */
  schema: z.ZodType<T, string>;
  onValid: (value: T) => void;
  multiline?: boolean;
  placeholder?: string;
  maxLength?: number;
  type?: 'text' | 'email' | 'url' | 'number';
  inputMode?: 'numeric' | 'email' | 'url' | 'text';
  rows?: number;
}

/**
 * A text box that saves what is typed once it is valid, and says what is wrong when it is
 * not (without saving it). Typing is kept here, so a half-typed value never leaves the box.
 */
export function ValidatedInput<T>({
  id,
  value,
  schema,
  onValid,
  multiline = false,
  type = 'text',
  rows = 4,
  ...rest
}: ValidatedInputProps<T>) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const describedBy = `${id}-error`;

  const change = (next: string) => {
    setDraft(next);
    const checked = schema.safeParse(next);
    if (checked.success) {
      setError(null);
      onValid(checked.data);
    } else {
      setError(checked.error.issues[0]?.message ?? 'Check this');
    }
  };

  const common = {
    id,
    value: draft,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    ...rest,
  };
  return (
    <div className="flex flex-col gap-1.5">
      {multiline ? (
        <Textarea
          {...common}
          rows={rows}
          onChange={(event) => {
            change(event.target.value);
          }}
        />
      ) : (
        <Input
          {...common}
          type={type}
          onChange={(event) => {
            change(event.target.value);
          }}
        />
      )}
      <FieldError id={describedBy} message={error} />
    </div>
  );
}
