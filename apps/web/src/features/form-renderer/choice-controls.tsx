import type { AnswerValue, FieldOfType } from '@formyx/shared';
import { Check, ChevronDown } from 'lucide-react';
import { cx } from '@/lib/cx';
import { choiceGroup, choiceOption, inputRadius, ratingOption, textControl } from './styles';
import { useFormTheme } from './theme/theme-context';
import type { ControlProps } from './types';
import { useFormMessages } from './i18n/form-locale';

/** The radio or checkbox drawn beside an option in the list and card styles. */
function ChoiceIndicator({ multiple, checked }: { multiple: boolean; checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        'flex size-4.5 shrink-0 items-center justify-center border border-(--form-border-strong) bg-(--form-bg) transition-colors duration-150',
        multiple ? 'rounded-[min(var(--form-radius),5px)]' : 'rounded-full',
        'peer-checked:border-(--form-accent) peer-checked:bg-(--form-accent) peer-checked:text-(--form-accent-fg)',
      )}
    >
      {checked &&
        (multiple ? (
          <Check className="size-3" strokeWidth={3} />
        ) : (
          <span className="size-1.5 rounded-full bg-(--form-accent-fg)" />
        ))}
    </span>
  );
}

interface ChoiceListProps {
  options: readonly { id: string; label: string }[];
  /** Checkboxes rather than radios. */
  multiple: boolean;
  controlId: string;
  describedBy: string | undefined;
  invalid: boolean;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
}

/**
 * Radios or checkboxes in the theme's choice style: rows, cards, pills or buttons. Native
 * inputs keep arrow keys and screen readers working; pills and buttons mark picked options
 * with a tick as well as colour.
 */
export function ChoiceList({
  options,
  multiple,
  controlId,
  describedBy,
  invalid,
  value,
  onChange,
}: ChoiceListProps) {
  const { choiceStyle } = useFormTheme().components;
  const indicator = choiceStyle === 'list' || choiceStyle === 'cards';
  const selected = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];

  if (options.length === 0) {
    return <p className="form-text-sm text-(--form-muted)">No options yet</p>;
  }

  return (
    <div className={choiceGroup[choiceStyle]} data-choice-style={choiceStyle}>
      {options.map((option, index) => {
        const checked = selected.includes(option.id);
        return (
          <label key={option.id} className={choiceOption[choiceStyle]}>
            <input
              id={index === 0 ? controlId : undefined}
              type={multiple ? 'checkbox' : 'radio'}
              name={controlId}
              value={option.id}
              checked={checked}
              aria-describedby={index === 0 ? describedBy : undefined}
              // Radios cannot be marked invalid; the error is announced through describedBy.
              aria-invalid={multiple && invalid ? true : undefined}
              className="peer sr-only"
              onChange={() => {
                if (!multiple) {
                  onChange(option.id);
                  return;
                }
                const next = checked
                  ? selected.filter((id) => id !== option.id)
                  : [...selected, option.id];
                onChange(next.length > 0 ? next : null);
              }}
            />
            {indicator ? (
              <ChoiceIndicator multiple={multiple} checked={checked} />
            ) : (
              checked && <Check aria-hidden className="-ml-1 size-4 shrink-0" strokeWidth={2.5} />
            )}
            <span className={cx('min-w-0 break-words', indicator && 'flex-1')}>
              {option.label || <span className="text-(--form-muted)">Untitled option</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** Single choice (radios) or multiple choice (checkboxes). */
export function ChoiceControl({
  field,
  ...props
}: ControlProps<FieldOfType<'single_choice' | 'multi_choice'>>) {
  return <ChoiceList {...props} options={field.options} multiple={field.type === 'multi_choice'} />;
}

/** A native select: dependable on phones and with screen readers. */
export function DropdownControl({
  field,
  controlId,
  describedBy,
  invalid,
  value,
  onChange,
}: ControlProps<FieldOfType<'dropdown'>>) {
  const messages = useFormMessages();
  const current = typeof value === 'string' ? value : '';

  return (
    <div className="relative">
      <select
        id={controlId}
        className={cx(
          textControl,
          inputRadius,
          'h-11 appearance-none pr-10',
          current === '' && 'text-(--form-muted)!',
        )}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-required={field.required || undefined}
        value={current}
        onChange={(event) => {
          onChange(event.target.value || null);
        }}
      >
        <option value="" disabled={field.required}>
          {field.placeholder || messages.controls.selectOption}
        </option>
        {field.options.map((option) => (
          <option key={option.id} value={option.id} className="text-(--form-fg)">
            {option.label || 'Untitled option'}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-(--form-muted)"
      />
    </div>
  );
}

/** Numbered buttons from 1 to the scale; native radios keep arrow-key navigation. */
interface ScaleButtonsProps {
  values: readonly number[];
  controlId: string;
  describedBy: string | undefined;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  /** Words under the ends (and middle) of the scale. */
  labels?: { low: string; middle?: string; high: string } | undefined;
  /** Buttons share the width (NPS, opinion scales); otherwise they keep their size. */
  stretch?: boolean;
}

/**
 * Numbered buttons, one per value; native radios keep arrow-key navigation. Labels under the
 * ends say what the numbers mean, and are part of the first and last buttons' names.
 */
export function ScaleButtons({
  values,
  controlId,
  describedBy,
  value,
  onChange,
  labels,
  stretch = false,
}: ScaleButtonsProps) {
  const first = values[0];
  const last = values.at(-1);
  const middleValue = values[Math.floor(values.length / 2)];
  const named = (rating: number) =>
    labels && rating === first && labels.low
      ? `${rating}, ${labels.low}`
      : labels && rating === last && labels.high
        ? `${rating}, ${labels.high}`
        : String(rating);

  return (
    <div className="flex flex-col gap-2">
      <div className={cx('flex gap-1.5 @sm:gap-2', stretch ? 'w-full' : 'flex-wrap')}>
        {values.map((rating) => (
          <label
            key={rating}
            className={cx(ratingOption, stretch ? 'h-11 min-w-0 flex-1 px-0' : 'size-11')}
          >
            <input
              id={rating === first ? controlId : undefined}
              type="radio"
              name={controlId}
              value={rating}
              checked={value === rating}
              aria-label={named(rating)}
              aria-describedby={rating === first ? describedBy : undefined}
              className="sr-only"
              onChange={() => {
                onChange(rating);
              }}
            />
            <span aria-hidden>{rating}</span>
          </label>
        ))}
      </div>
      {labels && (labels.low || labels.middle || labels.high) && (
        <div
          aria-hidden
          className="grid grid-cols-3 gap-2 form-text-sm text-(--form-muted)"
          data-scale-labels
        >
          <span>{labels.low}</span>
          <span className="text-center">{middleValue !== undefined && labels.middle}</span>
          <span className="text-right">{labels.high}</span>
        </div>
      )}
    </div>
  );
}

/** A rating drawn as numbers, from 1 to the scale. */
export function RatingControl({ field, ...props }: ControlProps<FieldOfType<'rating'>>) {
  const values = Array.from({ length: field.ratingScale }, (_, index) => index + 1);
  return <ScaleButtons {...props} values={values} />;
}
