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

/** Whole numbers from `from` to `to`, for scales. */
function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index);
}

/** The points of a scale (rating, NPS, opinion scale) a condition can compare with. */
function scalePoints(source: Field): number[] | null {
  switch (source.type) {
    case 'rating':
      return range(1, source.ratingScale);
    case 'nps':
      return range(0, 10);
    case 'opinion_scale':
      return range(source.start, source.end);
    default:
      return null;
  }
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

  if (source.type === 'yes_no') {
    return (
      <Select
        value={typeof value === 'string' ? value : ''}
        onValueChange={(next) => {
          onChange(next);
        }}
      >
        <SelectTrigger {...shared} className="w-full">
          <SelectValue placeholder="Yes or no" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="yes">Yes</SelectItem>
          <SelectItem value="no">No</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  const points = scalePoints(source);
  if (points) {
    return (
      <Select
        value={typeof value === 'number' ? String(value) : ''}
        onValueChange={(next) => {
          onChange(Number(next));
        }}
      >
        <SelectTrigger {...shared} className="w-full">
          <SelectValue placeholder={source.type === 'rating' ? 'Rating' : 'Score'} />
        </SelectTrigger>
        <SelectContent>
          {points.map((point) => (
            <SelectItem key={point} value={String(point)}>
              {point}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (source.type === 'number' || source.type === 'slider' || source.type === 'currency') {
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

  if (source.type === 'date' || source.type === 'time') {
    return (
      <Input
        {...shared}
        type={source.type}
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
