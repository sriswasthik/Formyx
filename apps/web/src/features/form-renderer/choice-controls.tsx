import type { FieldOfType } from '@formyx/shared';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { choiceRow, controlSurface, textControl } from './styles';
import type { ControlProps } from './types';

/** Radios (single choice) or checkboxes (multiple choice), one bordered row per option. */
export function ChoiceControl({
  field,
  controlId,
  describedBy,
  invalid,
  value,
  onChange,
}: ControlProps<FieldOfType<'single_choice' | 'multi_choice'>>) {
  const multiple = field.type === 'multi_choice';
  const selected = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];

  if (field.options.length === 0) {
    return <p className="text-14 text-(--form-muted)">No options yet</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {field.options.map((option, index) => {
        const checked = selected.includes(option.id);
        return (
          <label key={option.id} className={choiceRow}>
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
            <span className="min-w-0 flex-1 break-words">
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
        <label
          key={rating}
          className={cn(
            controlSurface,
            'relative flex size-11 cursor-pointer items-center justify-center text-16 font-medium tabular-nums',
            'hover:bg-(--form-hover)',
            'has-checked:border-(--form-accent) has-checked:bg-(--form-accent) has-checked:text-(--form-accent-fg)',
            'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--form-accent)',
          )}
        >
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
