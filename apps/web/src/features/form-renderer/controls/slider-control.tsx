import type { FieldOfType } from '@formyx/shared';
import { cn } from '@/lib/utils';
import type { ControlProps } from '../types';

/** "7.5 kg"; numbers keep the step's decimals so the value does not jump in width. */
function formatValue(value: number, field: FieldOfType<'slider'>): string {
  const decimals = (String(field.step).split('.')[1] ?? '').length;
  const text = value.toFixed(decimals);
  return field.unit.trim() ? `${text} ${field.unit.trim()}` : text;
}

/**
 * A native range input, so arrow keys, Page Up/Down and screen readers work as they do
 * everywhere. Until it is moved the question counts as unanswered, and says so.
 */
function SliderControl({
  field,
  controlId,
  describedBy,
  invalid,
  value,
  onChange,
}: ControlProps<FieldOfType<'slider'>>) {
  const answered = typeof value === 'number';
  const middle = field.min + Math.round((field.max - field.min) / 2 / field.step) * field.step;
  const current = answered ? value : middle;
  const share = ((current - field.min) / (field.max - field.min)) * 100;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <output
          htmlFor={controlId}
          aria-live="polite"
          className={cn('form-text font-medium tabular-nums', !answered && 'text-(--form-muted)')}
        >
          {answered ? formatValue(value, field) : 'Drag to answer'}
        </output>
      </div>
      <input
        id={controlId}
        type="range"
        min={field.min}
        max={field.max}
        step={field.step}
        value={current}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-valuetext={answered ? formatValue(value, field) : 'Not answered'}
        data-answered={answered || undefined}
        className="form-range w-full"
        style={{ '--form-range-fill': `${share}%` } as React.CSSProperties}
        onChange={(event) => {
          onChange(Number(event.target.value));
        }}
        // A click on the middle (where it starts) moves nothing, but means "this one".
        onPointerUp={() => {
          if (!answered) onChange(current);
        }}
        onKeyDown={(event) => {
          if (!answered && (event.key === 'Enter' || event.key === ' ')) onChange(current);
        }}
      />
      <div
        aria-hidden
        className="flex justify-between form-text-sm text-(--form-muted) tabular-nums"
      >
        <span>{formatValue(field.min, field)}</span>
        <span>{formatValue(field.max, field)}</span>
      </div>
    </div>
  );
}

export function Control(props: ControlProps) {
  return props.field.type === 'slider' ? <SliderControl {...props} field={props.field} /> : null;
}
