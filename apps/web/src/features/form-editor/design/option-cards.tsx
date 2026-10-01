import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export interface OptionCard<T extends string> {
  value: T;
  label: string;
  /** A small picture of the option. */
  preview: React.ReactNode;
}

interface OptionCardsProps<T extends string> {
  label: string;
  value: T;
  options: readonly OptionCard<T>[];
  onChange: (value: T) => void;
}

/** A choice between a few options, each shown as a small card. Arrow keys move between them. */
export function OptionCards<T extends string>({
  label,
  value,
  options,
  onChange,
}: OptionCardsProps<T>) {
  return (
    <RadioGroupPrimitive.Root
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next);
        if (option) onChange(option.value);
      }}
      className={cn('grid gap-2', options.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}
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
          {option.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
