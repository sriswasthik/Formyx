import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId } from 'react';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export interface OptionCard<T extends string> {
  value: T;
  label: string;
  /** A small picture of the option. */
  preview: React.ReactNode;
  /** Beside the label, such as a Pro badge. */
  badge?: React.ReactNode;
}

interface OptionCardsProps<T extends string> {
  label: string;
  /** `null` when the current setting is none of the options. */
  value: T | null;
  options: readonly OptionCard<T>[];
  onChange: (value: T) => void;
  /** Cards per row; by the number of options if not set. */
  columns?: 2 | 3 | 4;
  /** Shows the label above the cards, where a group holds several choices. */
  showLabel?: boolean;
}

// Four to a row only where the panel is wide enough for their labels.
const COLUMNS = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-2 @sm:grid-cols-4' } as const;

/** A choice between a few options, each shown as a small card. Arrow keys move between them. */
export function OptionCards<T extends string>({
  label,
  value,
  options,
  onChange,
  columns = options.length === 2 || options.length === 4 ? 2 : 3,
  showLabel = false,
}: OptionCardsProps<T>) {
  const labelId = useId();
  const group = (
    <RadioGroupPrimitive.Root
      aria-label={showLabel ? undefined : label}
      aria-labelledby={showLabel ? labelId : undefined}
      value={value ?? ''}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next);
        if (option) onChange(option.value);
      }}
      className={cn('grid gap-2', COLUMNS[columns])}
    >
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          className={cn(
            'flex flex-col items-center gap-2 rounded-lg border bg-background px-2 py-3 text-13',
            'transition-colors duration-150 ease-standard',
            'hover:border-border-strong active:bg-pressed',
            'data-[state=checked]:border-accent data-[state=checked]:bg-accent-subtle',
          )}
        >
          <span aria-hidden className="flex h-7 items-center justify-center">
            {option.preview}
          </span>
          <span className="flex items-center gap-1.5">
            {option.label}
            {option.badge}
          </span>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
  if (!showLabel) return group;
  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-13 font-medium">
        {label}
      </span>
      {group}
    </div>
  );
}
