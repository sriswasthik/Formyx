import type { FieldOfType } from '@formyx/shared';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { choiceGroup, choiceOption, inputRadius, ratingOption, textControl } from './styles';
import { useFormTheme } from './theme/theme-context';
import type { ControlProps } from './types';

/** The radio or checkbox drawn beside an option in the list and card styles. */
function ChoiceIndicator({ multiple, checked }: { multiple: boolean; checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
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

/**
 * Radios (single choice) or checkboxes (multiple choice) in the theme's choice style: rows,
 * cards, pills or buttons. Native inputs keep arrow keys and screen readers working; pills
 * and buttons mark picked options with a tick as well as colour.
 */
export function ChoiceControl({
  field,
  controlId,
  describedBy,
  invalid,
  value,
  onChange,
}: ControlProps<FieldOfType<'single_choice' | 'multi_choice'>>) {
  const { choiceStyle } = useFormTheme().components;
  const multiple = field.type === 'multi_choice';
  const indicator = choiceStyle === 'list' || choiceStyle === 'cards';
  const selected = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];

  if (field.options.length === 0) {
    return <p className="form-text-sm text-(--form-muted)">No options yet</p>;
  }

  return (
    <div className={choiceGroup[choiceStyle]} data-choice-style={choiceStyle}>
      {field.options.map((option, index) => {
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
            <span className={cn('min-w-0 break-words', indicator && 'flex-1')}>
              {option.label || <span className="text-(--form-muted)">Untitled option</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
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
  const current = typeof value === 'string' ? value : '';

  return (
    <div className="relative">
      <select
        id={controlId}
        className={cn(
          textControl,
          inputRadius,
          'h-11 appearance-none pr-10',
          current === '' && 'text-(--form-muted)',
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
          {field.placeholder || 'Select an option'}
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
export function RatingControl({
  field,
  controlId,
  describedBy,
  value,
  onChange,
}: ControlProps<FieldOfType<'rating'>>) {
  const scale = Array.from({ length: field.ratingScale }, (_, index) => index + 1);

  return (
    <div className="flex flex-wrap gap-2">
      {scale.map((rating) => (
        <label key={rating} className={ratingOption}>
          <input
            id={rating === 1 ? controlId : undefined}
            type="radio"
            name={controlId}
            value={rating}
            checked={value === rating}
            aria-describedby={rating === 1 ? describedBy : undefined}
            className="sr-only"
            onChange={() => {
              onChange(rating);
            }}
          />
          {rating}
        </label>
      ))}
    </div>
  );
}
