import { FormField } from '@/components/form-field';
import { NumberInput } from './number-input';

export function RangeInputs({
  id,
  minLabel,
  maxLabel,
  min,
  max,
  errors,
  integer,
  onChange,
}: {
  id: string;
  minLabel: string;
  maxLabel: string;
  min: number | undefined;
  max: number | undefined;
  errors: { min?: string | undefined; max?: string | undefined };
  integer: boolean;
  onChange: (range: { min: number | undefined; max: number | undefined }, key: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <FormField id={`${id}-min`} label={minLabel} error={errors.min}>
        <NumberInput
          integer={integer}
          value={min}
          placeholder="None"
          onValueChange={(value) => {
            onChange({ min: value, max }, 'min');
          }}
        />
      </FormField>
      <FormField id={`${id}-max`} label={maxLabel} error={errors.max}>
        <NumberInput
          integer={integer}
          value={max}
          placeholder="None"
          onValueChange={(value) => {
            onChange({ min, max: value }, 'max');
          }}
        />
      </FormField>
    </div>
  );
}
