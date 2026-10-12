import type { Field } from '@formyx/shared';
import type * as React from 'react';
import { cx } from '@/lib/cx';
import type { FieldIds } from './field-ids';
import { useFormMessages } from './i18n/form-locale';
import { useFormTheme } from './theme/theme-context';

interface FieldFrameProps {
  field: Field;
  ids: FieldIds;
  /** Several inputs (radios, checkboxes): rendered as a fieldset with a legend. */
  group: boolean;
  error: string | undefined;
  /** Shown before the label, as the theme numbers questions. */
  number?: string | undefined;
  /** `large`: one question at a time, where the question is the page's focus. */
  size?: 'regular' | 'large';
  children: React.ReactNode;
}

/**
 * The question's words, with its number, and marked as the theme says: required questions
 * with an asterisk or the word, or optional ones instead. Screen readers always hear which
 * questions are required.
 */
function LabelText({ field, number }: { field: Field; number?: string | undefined }) {
  const messages = useFormMessages();
  const marker = useFormTheme().typography.requiredMarker;
  return (
    <>
      {number && (
        <span data-question-number className="mr-2 text-(--form-muted) tabular-nums">
          {number}.
        </span>
      )}
      {field.label || <span className="text-(--form-muted)">Untitled question</span>}
      {field.required && (
        <>
          {marker === 'asterisk' && (
            <span aria-hidden className="text-(--form-muted)">
              {' '}
              *
            </span>
          )}
          {marker === 'word' && (
            <span aria-hidden className="ml-2 form-text-sm font-normal text-(--form-muted)">
              {messages.marker.requiredWord}
            </span>
          )}{' '}
          <span className="sr-only">{messages.marker.required}</span>
        </>
      )}
      {!field.required && marker === 'optional' && (
        <span className="ml-2 form-text-sm font-normal text-(--form-muted)">
          {messages.marker.optionalWord}
        </span>
      )}
    </>
  );
}

/** Label, description, control and error of one question, wired for assistive technology. */
export function FieldFrame({
  field,
  ids,
  group,
  error,
  number,
  size = 'regular',
  children,
}: FieldFrameProps) {
  const labelClass = cx(
    size === 'large' ? 'form-text-lg' : 'form-text',
    'leading-snug font-medium break-words',
  );
  const description = field.description && (
    <p id={ids.description} className="form-text-sm whitespace-pre-wrap text-(--form-muted)">
      {field.description}
    </p>
  );
  const errorMessage = error && (
    <p id={ids.error} className="form-text-sm text-(--form-danger)">
      {error}
    </p>
  );

  if (group) {
    return (
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend id={ids.label} className={labelClass}>
          <LabelText field={field} number={number} />
        </legend>
        {description}
        <div className="pt-1">{children}</div>
        {errorMessage}
      </fieldset>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label id={ids.label} htmlFor={ids.control} className={labelClass}>
        <LabelText field={field} number={number} />
      </label>
      {description}
      <div className="pt-1">{children}</div>
      {errorMessage}
    </div>
  );
}
