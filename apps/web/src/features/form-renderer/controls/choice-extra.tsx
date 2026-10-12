import type { FieldOfType } from '@formyx/shared';
import { Angry, Check, Frown, Heart, Laugh, Meh, Smile, Star, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { cx } from '@/lib/cx';
import { ChoiceList, ScaleButtons } from '../choice-controls';
import { RichText } from '../rich-text';
import { controlSurface } from '../styles';
import type { ControlProps } from '../types';
import { useFormMessages } from '../i18n/form-locale';

const focusRing =
  'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--form-accent)';

/** Image cards, one or several picked. The option's label is the picture's text, too. */
function PictureChoice({
  field,
  controlId,
  describedBy,
  invalid,
  value,
  onChange,
}: ControlProps<FieldOfType<'picture_choice'>>) {
  const selected = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  if (field.options.length === 0) {
    return <p className="form-text-sm text-(--form-muted)">No pictures yet</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-2.5 @md:grid-cols-3" data-picture-choice>
      {field.options.map((option, index) => {
        const checked = selected.includes(option.id);
        return (
          <label
            key={option.id}
            className={cx(
              controlSurface,
              'group relative flex cursor-pointer flex-col overflow-hidden p-1.5',
              'has-checked:border-(--form-accent) has-checked:bg-(--form-accent-subtle)',
              focusRing,
            )}
          >
            <input
              id={index === 0 ? controlId : undefined}
              type={field.multiple ? 'checkbox' : 'radio'}
              name={controlId}
              value={option.id}
              checked={checked}
              aria-describedby={index === 0 ? describedBy : undefined}
              aria-invalid={field.multiple && invalid ? true : undefined}
              className="sr-only"
              onChange={() => {
                if (!field.multiple) {
                  onChange(option.id);
                  return;
                }
                const next = checked
                  ? selected.filter((id) => id !== option.id)
                  : [...selected, option.id];
                onChange(next.length > 0 ? next : null);
              }}
            />
            <span className="relative block aspect-4/3 overflow-hidden rounded-[calc(var(--form-choice-radius)-4px)] bg-(--form-hover)">
              {option.imageUrl && (
                <img
                  src={option.imageUrl}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover"
                />
              )}
              {checked && (
                <span
                  aria-hidden
                  className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-(--form-accent) text-(--form-accent-fg)"
                >
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              )}
            </span>
            <span className="px-1.5 pt-2 pb-1 form-text break-words">
              {option.label || <span className="text-(--form-muted)">Untitled picture</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}

const STYLED_ICONS: Record<'stars' | 'hearts', LucideIcon> = { stars: Star, hearts: Heart };

/** Five faces from unhappy to delighted; three take the ends and the middle. */
const FACE_ICONS: LucideIcon[] = [Angry, Frown, Meh, Smile, Laugh];

/** Stars or hearts filled up to the rating (or the one hovered), or a row of faces. */
function StyledRating({
  field,
  controlId,
  describedBy,
  value,
  onChange,
}: ControlProps<FieldOfType<'rating'>>) {
  const [hovered, setHovered] = useState<number | null>(null);
  const messages = useFormMessages();
  const allFaces = FACE_ICONS.map((icon, index) => ({
    icon,
    label: messages.controls.faces[index] ?? '',
  }));
  const faces =
    field.ratingStyle === 'faces' && (field.ratingScale === 3 || field.ratingScale === 5)
      ? field.ratingScale === 3
        ? [allFaces[0], allFaces[2], allFaces[4]]
        : allFaces
      : null;
  const current = typeof value === 'number' ? value : 0;
  const shown = hovered ?? current;
  const values = Array.from({ length: field.ratingScale }, (_, index) => index + 1);
  const Icon = field.ratingStyle === 'hearts' ? STYLED_ICONS.hearts : STYLED_ICONS.stars;

  return (
    <div
      className="flex flex-wrap gap-1"
      onPointerLeave={() => {
        setHovered(null);
      }}
      data-rating-style={field.ratingStyle}
    >
      {values.map((rating) => {
        const face = faces?.[rating - 1];
        const FaceIcon = face?.icon;
        const filled = face ? rating === current : rating <= shown;
        return (
          <label
            key={rating}
            className={cx(
              'relative flex size-11 cursor-pointer items-center justify-center rounded-full',
              'transition-colors duration-150 ease-standard',
              filled ? 'text-(--form-accent)' : 'text-(--form-muted) hover:text-(--form-accent)',
              focusRing,
            )}
            onPointerEnter={() => {
              if (!face) setHovered(rating);
            }}
          >
            <input
              id={rating === 1 ? controlId : undefined}
              type="radio"
              name={controlId}
              value={rating}
              checked={value === rating}
              aria-label={face ? `${rating}, ${face.label}` : `${rating} of ${field.ratingScale}`}
              aria-describedby={rating === 1 ? describedBy : undefined}
              className="sr-only"
              onChange={() => {
                onChange(rating);
              }}
            />
            {FaceIcon ? (
              <FaceIcon aria-hidden className="size-8" strokeWidth={filled ? 2.25 : 1.5} />
            ) : (
              <Icon
                aria-hidden
                className="size-8"
                strokeWidth={1.75}
                fill={filled ? 'currentColor' : 'none'}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

/** One checkbox, ticked to agree, with the terms (rich text) above it. */
function ConsentControl({
  field,
  controlId,
  describedBy,
  invalid,
  value,
  onChange,
}: ControlProps<FieldOfType<'consent'>>) {
  return (
    <label
      className={cx(
        controlSurface,
        'relative flex cursor-pointer items-start gap-3 px-3.5 py-3 form-text',
        'has-checked:border-(--form-accent) has-checked:bg-(--form-accent-subtle)',
        focusRing,
      )}
    >
      <input
        id={controlId}
        type="checkbox"
        checked={value === true}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-required={field.required || undefined}
        className="peer sr-only"
        onChange={(event) => {
          onChange(event.target.checked ? true : null);
        }}
      />
      <span
        aria-hidden
        className={cx(
          'mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-[min(var(--form-radius),5px)] border border-(--form-border-strong) bg-(--form-bg)',
          'peer-checked:border-(--form-accent) peer-checked:bg-(--form-accent) peer-checked:text-(--form-accent-fg)',
        )}
      >
        {value === true && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 break-words">
        {field.label || <span className="text-(--form-muted)">Untitled agreement</span>}
        {field.required && (
          <>
            <span aria-hidden className="text-(--form-muted)">
              {' '}
              *
            </span>{' '}
            <span className="sr-only">(required)</span>
          </>
        )}
      </span>
    </label>
  );
}

/** The terms (rich text, scrolling when long) above the checkbox that agrees to them. */
function Consent(props: ControlProps<FieldOfType<'consent'>>) {
  const { field } = props;
  return (
    <div className="flex flex-col gap-3">
      {field.terms.trim() && (
        <RichText
          text={field.terms}
          className="max-h-64 overflow-y-auto rounded-(--form-radius) border border-(--form-border) p-3.5 form-text-sm text-(--form-muted)"
        />
      )}
      <ConsentControl {...props} />
    </div>
  );
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

export function Control(props: ControlProps) {
  const { field } = props;
  const messages = useFormMessages();
  switch (field.type) {
    case 'picture_choice':
      return <PictureChoice {...props} field={field} />;
    case 'yes_no':
      return (
        <ChoiceList
          {...props}
          options={[
            { id: 'yes', label: messages.answer.yes },
            { id: 'no', label: messages.answer.no },
          ]}
          multiple={false}
        />
      );
    case 'nps':
      return (
        <ScaleButtons
          {...props}
          values={range(0, 10)}
          stretch
          labels={{ low: field.lowLabel, high: field.highLabel }}
        />
      );
    case 'opinion_scale':
      return (
        <ScaleButtons
          {...props}
          values={range(field.start, field.end)}
          stretch
          labels={{ low: field.lowLabel, middle: field.middleLabel, high: field.highLabel }}
        />
      );
    case 'rating':
      return <StyledRating {...props} field={field} />;
    case 'consent':
      return <Consent {...props} field={field} />;
    default:
      return null;
  }
}
