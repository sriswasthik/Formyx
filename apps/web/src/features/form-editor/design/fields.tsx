import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { parseHexInput } from './hex';

/** Live edits (dragging a slider, picking a colour) merge into one undo step per key. */
export type LiveChange<T> = (value: T, options?: { mergeKey: string }) => void;

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** How the value reads next to the label, e.g. `40%`. */
  format?: (value: number) => string;
  /** Names the undo step a drag merges into. */
  mergeKey: string;
  onChange: LiveChange<number>;
  disabled?: boolean;
}

export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  format = String,
  mergeKey,
  onChange,
  disabled,
}: SliderFieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label id={id}>{label}</Label>
        <span className="text-13 text-muted-foreground tabular-nums">{format(value)}</span>
      </div>
      <Slider
        aria-labelledby={id}
        thumbLabel={label}
        min={min}
        max={max}
        step={step}
        value={[value]}
        disabled={disabled}
        onValueChange={([next]) => {
          if (next !== undefined) onChange(next, { mergeKey });
        }}
      />
    </div>
  );
}

interface ColorFieldProps {
  label: string;
  value: string;
  mergeKey: string;
  onChange: LiveChange<string>;
  className?: string;
}

/** A colour by swatch (the system picker) or by hex. */
export function ColorField({ label, value, mergeKey, onChange, className }: ColorFieldProps) {
  const id = useId();
  // The hex box shows what is being typed; it follows the value when that changes elsewhere.
  const [text, setText] = useState(value);
  const [shown, setShown] = useState(value);
  const [touched, setTouched] = useState(false);
  if (value !== shown) {
    setShown(value);
    setText(value);
    setTouched(false);
  }
  const invalid = touched && parseHexInput(text) === null;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <label
          className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-input transition-colors duration-150 hover:border-control has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
          style={{ backgroundColor: value }}
        >
          <span className="sr-only">Pick {label.toLowerCase()}</span>
          <input
            type="color"
            value={value.toLowerCase()}
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(event) => {
              onChange(event.target.value.toUpperCase(), { mergeKey });
            }}
          />
        </label>
        <Input
          id={id}
          value={text}
          spellCheck={false}
          autoComplete="off"
          maxLength={7}
          aria-invalid={invalid || undefined}
          className="font-mono uppercase"
          onChange={(event) => {
            setText(event.target.value);
            const parsed = parseHexInput(event.target.value);
            if (parsed) onChange(parsed, { mergeKey });
          }}
          onBlur={() => {
            setTouched(true);
          }}
        />
      </div>
      {invalid && <p className="text-13 text-danger-text">Use six hex digits, such as 4370BD.</p>}
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  /** `''` shows the placeholder. */
  value: T | '';
  placeholder?: string;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function SelectField<T extends string>({
  label,
  value,
  placeholder,
  options,
  onChange,
}: SelectFieldProps<T>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value}
        onValueChange={(next) => {
          const option = options.find((candidate) => candidate.value === next);
          if (option) onChange(option.value);
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
