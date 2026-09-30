import type { Field } from '@formyx/shared';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NumberInput } from '../settings/number-input';

interface ConditionValueInputProps {
  id: string;
  label: string;
  source: Field;
  value: string | number | undefined;
  invalid: boolean;
  /** `typing` is set while text is being typed, so it can merge into one undo step. */
  onChange: (value: string | number | undefined, typing?: boolean) => void;
}

/** The value to compare with, in a control that fits the source question's answers. */
export function ConditionValueInput({
  id,
  label,
  source,
  value,
  invalid,
  onChange,
}: ConditionValueInputProps) {
  const shared = { id, 'aria-label': label, 'aria-invalid': invalid || undefined };

  if ('options' in source) {
    return (
      <Select
        value={typeof value === 'string' ? value : ''}
        onValueChange={(next) => {
          onChange(next);
        }}
      >
        <SelectTrigger {...shared} className="w-full">
          <SelectValue placeholder="Choose an option" />
        </SelectTrigger>
        <SelectContent>
          {source.options.map((option, index) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label.trim() || `Option ${index + 1}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (source.type === 'rating') {
    const ratings = Array.from({ length: source.ratingScale }, (_, index) => index + 1);
    return (
      <Select
        value={typeof value === 'number' ? String(value) : ''}
        onValueChange={(next) => {
          onChange(Number(next));
        }}
      >
        <SelectTrigger {...shared} className="w-full">
          <SelectValue placeholder="Rating" />
        </SelectTrigger>
        <SelectContent>
          {ratings.map((rating) => (
            <SelectItem key={rating} value={String(rating)}>
              {rating}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (source.type === 'number') {
    return (
      <NumberInput
        {...shared}
        value={typeof value === 'number' ? value : undefined}
        placeholder="Number"
        onValueChange={(next) => {
          onChange(next, true);
        }}
      />
    );
  }

  if (source.type === 'date') {
    return (
      <Input
        {...shared}
        type="date"
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => {
          onChange(event.target.value || undefined);
        }}
      />
    );
  }

  return (
    <Input
      {...shared}
      value={typeof value === 'string' ? value : ''}
      placeholder="Text"
      autoComplete="off"
      onChange={(event) => {
        onChange(event.target.value === '' ? undefined : event.target.value, true);
      }}
    />
  );
}
