import {
  OPINION_SCALE_MAX,
  RATING_SCALE_MAX,
  RATING_SCALE_MIN,
  RATING_STYLES,
  type FieldOfType,
  type RatingStyle,
} from '@formyx/shared';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { SelectItem } from '@/components/ui/select';
import type { FieldPatch } from '../editor-store';
import { NumberInput } from './number-input';
import { SelectField } from './select-field';
import { SettingsSection } from './settings-section';

type Update = (patch: FieldPatch, mergeKey?: string) => void;

interface Props<T> {
  field: T;
  issues: Record<string, string>;
  update: Update;
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

/** A select of whole numbers, for a scale's ends. */
function NumberSelect({
  id,
  label,
  value,
  values,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  values: readonly number[];
  error?: string | undefined;
  onChange: (value: number) => void;
}) {
  return (
    <SelectField
      id={id}
      label={label}
      error={error}
      value={String(value)}
      triggerClassName="tabular-nums"
      onValueChange={(next) => {
        onChange(Number(next));
      }}
    >
      {values.map((item) => (
        <SelectItem key={item} value={String(item)} className="tabular-nums">
          {item}
        </SelectItem>
      ))}
    </SelectField>
  );
}

/** Short words under a scale's ends (and middle). */
function ScaleLabels({
  field,
  issues,
  update,
  keys,
}: {
  field: { lowLabel: string; highLabel: string; middleLabel?: string };
  issues: Record<string, string>;
  update: Update;
  keys: readonly ('lowLabel' | 'middleLabel' | 'highLabel')[];
}) {
  const names = { lowLabel: 'Low end', middleLabel: 'Middle', highLabel: 'High end' } as const;
  return (
    <div className="flex flex-col gap-3">
      {keys.map((key) => (
        <FormField
          key={key}
          id={`setting-${key}`}
          label={`${names[key]} label`}
          error={issues[key]}
        >
          <Input
            value={field[key] ?? ''}
            placeholder="None"
            maxLength={80}
            onChange={(event) => {
              update({ [key]: event.target.value }, key);
            }}
          />
        </FormField>
      ))}
    </div>
  );
}

export function NpsSettings({ field, issues, update }: Props<FieldOfType<'nps'>>) {
  return (
    <SettingsSection title="Labels">
      <p className="text-13 text-muted-foreground">
        Respondents pick 0 to 10. Analytics show the Net Promoter Score.
      </p>
      <ScaleLabels field={field} issues={issues} update={update} keys={['lowLabel', 'highLabel']} />
    </SettingsSection>
  );
}

export function OpinionScaleSettings({
  field,
  issues,
  update,
}: Props<FieldOfType<'opinion_scale'>>) {
  return (
    <>
      <SettingsSection title="Scale">
        <div className="grid grid-cols-2 gap-3">
          <NumberSelect
            id="setting-scale-start"
            label="From"
            value={field.start}
            values={[0, 1]}
            onChange={(start) => {
              update({ start: start === 0 ? 0 : 1 });
            }}
          />
          <NumberSelect
            id="setting-scale-end"
            label="To"
            value={field.end}
            values={range(2, OPINION_SCALE_MAX)}
            error={issues.end}
            onChange={(end) => {
              update({ end });
            }}
          />
        </div>
      </SettingsSection>
      <SettingsSection title="Labels">
        <ScaleLabels
          field={field}
          issues={issues}
          update={update}
          keys={['lowLabel', 'middleLabel', 'highLabel']}
        />
      </SettingsSection>
    </>
  );
}

export function SliderSettings({ field, issues, update }: Props<FieldOfType<'slider'>>) {
  const numbers = [
    { key: 'min', label: 'Minimum' },
    { key: 'max', label: 'Maximum' },
    { key: 'step', label: 'Step' },
  ] as const;
  return (
    <SettingsSection title="Range">
      <div className="grid grid-cols-3 gap-3">
        {numbers.map(({ key, label }) => (
          <FormField key={key} id={`setting-slider-${key}`} label={label} error={issues[key]}>
            <NumberInput
              value={field[key]}
              onValueChange={(value) => {
                if (value !== undefined) update({ [key]: value }, `slider-${key}`);
              }}
            />
          </FormField>
        ))}
      </div>
      <FormField
        id="setting-slider-unit"
        label="Unit"
        hint="Optional. Shown after the value, such as kg or %."
        error={issues.unit}
      >
        <Input
          className="w-28"
          value={field.unit}
          maxLength={12}
          onChange={(event) => {
            update({ unit: event.target.value }, 'slider-unit');
          }}
        />
      </FormField>
    </SettingsSection>
  );
}

const RATING_STYLE_LABELS: Record<RatingStyle, string> = {
  numbers: 'Numbers',
  stars: 'Stars',
  hearts: 'Hearts',
  faces: 'Faces',
};

/** Faces have a face for each point of a 3- or 5-point scale only. */
const FACE_SCALES = [3, 5] as const;

export function RatingSettings({ field, update }: Omit<Props<FieldOfType<'rating'>>, 'issues'>) {
  const faces = field.ratingStyle === 'faces';
  return (
    <SettingsSection title="Scale">
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          id="setting-rating-style"
          label="Style"
          value={field.ratingStyle}
          onValueChange={(value) => {
            const ratingStyle = RATING_STYLES.find((style) => style === value);
            if (!ratingStyle) return;
            const fits =
              ratingStyle !== 'faces' ||
              (FACE_SCALES as readonly number[]).includes(field.ratingScale);
            update({ ratingStyle, ...(fits ? {} : { ratingScale: 5 }) });
          }}
        >
          {RATING_STYLES.map((style) => (
            <SelectItem key={style} value={style}>
              {RATING_STYLE_LABELS[style]}
            </SelectItem>
          ))}
        </SelectField>
        <NumberSelect
          id="setting-scale"
          label="Rating from 1 to"
          value={field.ratingScale}
          values={faces ? FACE_SCALES : range(RATING_SCALE_MIN, RATING_SCALE_MAX)}
          onChange={(ratingScale) => {
            update({ ratingScale });
          }}
        />
      </div>
      {faces && <p className="text-13 text-muted-foreground">Faces come in 3 or 5 points.</p>}
    </SettingsSection>
  );
}
