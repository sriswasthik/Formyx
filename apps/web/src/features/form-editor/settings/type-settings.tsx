import {
  FILE_CATEGORIES,
  FILE_MAX_SIZE_MB,
  RATING_SCALE_MAX,
  RATING_SCALE_MIN,
  type Field,
  type FieldOfType,
  type FileCategory,
} from '@formyx/shared';
import { FormField } from '@/components/form-field';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FILE_CATEGORY_LABELS } from '@/features/form-renderer/file-types';
import type { FieldPatch } from '../editor-store';
import { NumberInput } from './number-input';
import { OptionsEditor } from './options-editor';
import { SettingsSection } from './settings-section';

type Update = (patch: FieldPatch, mergeKey?: string) => void;

/** Drops unset limits, and the whole object once nothing is left. */
function compact<T extends Record<string, number | undefined>>(value: T): T | undefined {
  const entries = Object.entries(value).filter(([, limit]) => limit !== undefined);
  return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined;
}

function RangeInputs({
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

function TextLengthSettings({
  field,
  issues,
  update,
}: {
  field: FieldOfType<'short_text' | 'long_text'>;
  issues: Record<string, string>;
  update: Update;
}) {
  return (
    <SettingsSection title="Answer length">
      <RangeInputs
        id="setting-length"
        minLabel="Minimum characters"
        maxLabel="Maximum characters"
        integer
        min={field.validation?.minLength}
        max={field.validation?.maxLength}
        errors={{
          min: issues['validation.minLength'],
          max: issues['validation.maxLength'],
        }}
        onChange={({ min, max }, key) => {
          update({ validation: compact({ minLength: min, maxLength: max }) }, `length-${key}`);
        }}
      />
    </SettingsSection>
  );
}

function NumberRangeSettings({
  field,
  issues,
  update,
}: {
  field: FieldOfType<'number'>;
  issues: Record<string, string>;
  update: Update;
}) {
  return (
    <SettingsSection title="Allowed numbers">
      <RangeInputs
        id="setting-range"
        minLabel="Minimum"
        maxLabel="Maximum"
        integer={false}
        min={field.validation?.min}
        max={field.validation?.max}
        errors={{ min: issues['validation.min'], max: issues['validation.max'] }}
        onChange={(range, key) => {
          update({ validation: compact(range) }, `range-${key}`);
        }}
      />
    </SettingsSection>
  );
}

function RatingSettings({ field, update }: { field: FieldOfType<'rating'>; update: Update }) {
  const scales = Array.from(
    { length: RATING_SCALE_MAX - RATING_SCALE_MIN + 1 },
    (_, index) => RATING_SCALE_MIN + index,
  );
  return (
    <SettingsSection title="Scale">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="setting-scale">Rating from 1 to</Label>
        <Select
          value={String(field.ratingScale)}
          onValueChange={(value) => {
            update({ ratingScale: Number(value) });
          }}
        >
          <SelectTrigger id="setting-scale" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {scales.map((scale) => (
              <SelectItem key={scale} value={String(scale)}>
                {scale}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </SettingsSection>
  );
}

function FileSettings({
  field,
  issues,
  update,
}: {
  field: FieldOfType<'file'>;
  issues: Record<string, string>;
  update: Update;
}) {
  const { maxSizeMb, allowedTypes } = field.fileConfig;
  const toggle = (category: FileCategory, checked: boolean) => {
    const next = checked
      ? FILE_CATEGORIES.filter((item) => item === category || allowedTypes.includes(item))
      : allowedTypes.filter((item) => item !== category);
    update({ fileConfig: { maxSizeMb, allowedTypes: next } });
  };

  return (
    <SettingsSection title="Files">
      <FormField
        id="setting-max-size"
        label="Maximum size (MB)"
        hint={`1 to ${FILE_MAX_SIZE_MB} MB.`}
        error={issues['fileConfig.maxSizeMb']}
      >
        <NumberInput
          integer
          className="w-28"
          value={maxSizeMb}
          onValueChange={(value) => {
            update({ fileConfig: { allowedTypes, maxSizeMb: value ?? 0 } }, 'max-size');
          }}
        />
      </FormField>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-13 font-medium">Allowed types</legend>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {FILE_CATEGORIES.map((category) => (
            <div key={category} className="flex items-center gap-2">
              <Checkbox
                id={`setting-file-${category}`}
                checked={allowedTypes.includes(category)}
                onCheckedChange={(checked) => {
                  toggle(category, checked === true);
                }}
              />
              <Label htmlFor={`setting-file-${category}`} className="font-normal">
                {FILE_CATEGORY_LABELS[category]}
              </Label>
            </div>
          ))}
        </div>
        {issues['fileConfig.allowedTypes'] && (
          <p className="text-13 text-danger-text">{issues['fileConfig.allowedTypes']}</p>
        )}
      </fieldset>
    </SettingsSection>
  );
}

/** Settings that only some question types have. */
export function TypeSettings({
  field,
  issues,
  update,
}: {
  field: Field;
  issues: Record<string, string>;
  update: Update;
}) {
  switch (field.type) {
    case 'short_text':
    case 'long_text':
      return <TextLengthSettings field={field} issues={issues} update={update} />;
    case 'number':
      return <NumberRangeSettings field={field} issues={issues} update={update} />;
    case 'single_choice':
    case 'multi_choice':
    case 'dropdown':
      return (
        <SettingsSection title="Options">
          <OptionsEditor
            field={field}
            issues={issues}
            onChange={(options, mergeKey) => {
              update({ options }, mergeKey);
            }}
          />
        </SettingsSection>
      );
    case 'rating':
      return <RatingSettings field={field} update={update} />;
    case 'file':
      return <FileSettings field={field} issues={issues} update={update} />;
    default:
      return null;
  }
}
