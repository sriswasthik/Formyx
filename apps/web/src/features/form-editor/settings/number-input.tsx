import * as React from 'react';
import { Input } from '@/components/ui/input';

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

interface NumberInputProps extends Omit<InputProps, 'value' | 'onChange' | 'type'> {
  value: number | undefined;
  onValueChange: (value: number | undefined) => void;
  /** Only whole numbers count as a value. */
  integer?: boolean;
}

function parse(text: string, integer: boolean): number | undefined | null {
  if (text.trim() === '') return undefined;
  const value = Number(text);
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value))) return null;
  return value;
}

/**
 * A number field that keeps what is typed (e.g. "-" or "1.") while it is not a number yet,
 * reports only real numbers, and follows outside changes such as undo.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onValueChange, integer = false, ...props }, ref) => {
    const [text, setText] = React.useState(value === undefined ? '' : String(value));
    const [previousValue, setPreviousValue] = React.useState(value);

    if (value !== previousValue) {
      setPreviousValue(value);
      if (parse(text, integer) !== value) setText(value === undefined ? '' : String(value));
    }

    return (
      <Input
        ref={ref}
        type="text"
        inputMode={integer ? 'numeric' : 'decimal'}
        autoComplete="off"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          const parsed = parse(event.target.value, integer);
          if (parsed !== null) onValueChange(parsed);
        }}
        {...props}
      />
    );
  },
);
NumberInput.displayName = 'NumberInput';
