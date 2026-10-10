import type { FormTheme } from '@formyx/shared';
import { cn } from '@/lib/utils';

/** More steps than this read better as a line. */
export const MAX_STEP_SEGMENTS = 20;

interface FormProgressProps {
  theme: FormTheme;
  /** How far along, from 0 to `total`. */
  value: number;
  total: number;
  /** In conversational forms, the question being shown (0-based), for the steps style. */
  current?: number;
}

/**
 * How far along a respondent is, in the theme's progress style: a thin line, numbered steps
 * or a percentage. A progressbar for assistive technology, whatever it looks like.
 */
export function FormProgress({ theme, value, total, current }: FormProgressProps) {
  const { style, position } = theme.layout.progress;
  if (style === 'none' || total === 0) return null;
  const fraction = Math.min(Math.max(value / total, 0), 1);
  const percent = Math.round(fraction * 100);
  const segments = style === 'steps' && total <= MAX_STEP_SEGMENTS;

  const line = (
    <div className="h-1 w-full overflow-hidden rounded-full bg-(--form-border)">
      <div
        className="h-full origin-left rounded-full bg-(--form-accent) transition-transform duration-250 ease-standard motion-reduce:transition-none"
        style={{ transform: `scaleX(${fraction})` }}
      />
    </div>
  );

  return (
    <div
      role="progressbar"
      aria-label="Progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={
        current === undefined ? `${percent}% complete` : `Question ${current + 1} of ${total}`
      }
      data-form-progress={style}
      data-position={position}
      className={cn(
        'z-10 flex w-full items-center gap-3 px-4 py-3 @xl:px-6',
        position === 'top' ? 'sticky top-0' : 'sticky bottom-0',
      )}
    >
      {segments ? (
        <div className="flex w-full gap-1">
          {Array.from({ length: total }, (_, index) => (
            <span
              key={index}
              data-step-segment
              className={cn(
                'h-1 flex-1 rounded-full transition-colors duration-250 ease-standard motion-reduce:transition-none',
                index < value || index === current ? 'bg-(--form-accent)' : 'bg-(--form-border)',
              )}
            />
          ))}
        </div>
      ) : (
        line
      )}
      {style === 'percentage' && (
        <span className="shrink-0 rounded-full bg-(--form-bg) px-2 py-0.5 form-text-sm font-medium text-(--form-fg) tabular-nums">
          {percent}%
        </span>
      )}
    </div>
  );
}
