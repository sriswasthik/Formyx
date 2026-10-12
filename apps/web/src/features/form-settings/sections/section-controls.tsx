import type { FormDetail, FormSettingsView } from '@formyx/shared';
import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** What every section is given: the form (its draft and look) and its live settings. */
export interface SectionProps {
  form: FormDetail;
  view: FormSettingsView;
}

export interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
  /** A Pro feature on a plan without it: still choosable, marked. */
  badge?: React.ReactNode;
}

/** A choice from a short list, as a select. */
export function OptionSelect<T extends string>({
  id,
  value,
  options,
  onChange,
  label,
}: {
  id?: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  /** For screen readers when the row's label is not tied to this control. */
  label?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next);
        if (option) onChange(option.value);
      }}
    >
      <SelectTrigger id={id} aria-label={label} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A choice with explanations, as radio buttons. */
export function OptionRadios<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  label: string;
}) {
  const id = useId();
  return (
    <RadioGroup
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next);
        if (option) onChange(option.value);
      }}
      className="flex flex-col gap-3"
    >
      {options.map((option) => (
        <div key={option.value} className="flex items-start gap-2.5">
          <RadioGroupItem id={`${id}-${option.value}`} value={option.value} className="mt-0.5" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <Label htmlFor={`${id}-${option.value}`} className="flex items-center gap-2 text-14">
              {option.label}
              {option.badge}
            </Label>
            {option.hint && <p className="text-13 text-muted-foreground">{option.hint}</p>}
          </div>
        </div>
      ))}
    </RadioGroup>
  );
}

/** A problem with what was typed, under the control. */
export function FieldError({ id, message }: { id: string; message: string | null }) {
  return (
    <p
      id={id}
      role={message ? 'alert' : undefined}
      className={cn('text-13 text-danger-text', !message && 'sr-only')}
    >
      {message ?? ''}
    </p>
  );
}
