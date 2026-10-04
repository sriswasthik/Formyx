import type { FieldOfType } from '@formyx/shared';
import type * as React from 'react';
import { inputRadius, textareaRadius, textControl } from './styles';
import type { ControlProps } from './types';

type SingleLineType = 'short_text' | 'email' | 'phone' | 'number' | 'date';

const INPUT_ATTRIBUTES: Record<
  SingleLineType,
  React.InputHTMLAttributes<HTMLInputElement> & { type: string }
> = {
  short_text: { type: 'text' },
  email: { type: 'email', inputMode: 'email', autoComplete: 'email', spellCheck: false },
  phone: { type: 'tel', inputMode: 'tel', autoComplete: 'tel' },
  // A text input: native number inputs change value on scroll and hide invalid input.
  number: { type: 'text', inputMode: 'decimal' },
  date: { type: 'date' },
};

function stringValue(value: ControlProps['value']): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export function SingleLineControl({
  field,
  controlId,
  describedBy,
  invalid,
  value,
  onChange,
}: ControlProps<FieldOfType<SingleLineType>>) {
  const placeholder = 'placeholder' in field ? field.placeholder : undefined;

  return (
    <input
      id={controlId}
      {...INPUT_ATTRIBUTES[field.type]}
      className={`${textControl} ${inputRadius} h-11`}
      placeholder={placeholder}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-required={field.required || undefined}
      value={stringValue(value)}
      onChange={(event) => {
        const next = event.target.value;
        onChange(next === '' ? null : next);
      }}
    />
  );
}

export function LongTextControl({
  field,
  controlId,
  describedBy,
  invalid,
  value,
  onChange,
}: ControlProps<FieldOfType<'long_text'>>) {
  return (
    <textarea
      id={controlId}
      rows={4}
      className={`${textControl} ${textareaRadius} min-h-28 resize-y py-2.5`}
      placeholder={field.placeholder}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-required={field.required || undefined}
      value={stringValue(value)}
      onChange={(event) => {
        const next = event.target.value;
        onChange(next === '' ? null : next);
      }}
    />
  );
}
