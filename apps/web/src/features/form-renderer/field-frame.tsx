import type { Field } from '@formyx/shared';
import type * as React from 'react';
import type { FieldIds } from './field-ids';

interface FieldFrameProps {
  field: Field;
  ids: FieldIds;
  /** Several inputs (radios, checkboxes): rendered as a fieldset with a legend. */
  group: boolean;
  error: string | undefined;
  children: React.ReactNode;
}

function LabelText({ field }: { field: Field }) {
  return (
    <>
      {field.label || <span className="text-(--form-muted)">Untitled question</span>}
      {field.required && (
        <>
          <span aria-hidden className="text-(--form-muted)">
            {' '}
            *
          </span>{' '}
          <span className="sr-only">(required)</span>
        </>
      )}
    </>
  );
}

/** Label, description, control and error of one question, wired for assistive technology. */
export function FieldFrame({ field, ids, group, error, children }: FieldFrameProps) {
  const labelClass = 'form-text leading-snug font-medium break-words';
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
          <LabelText field={field} />
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
        <LabelText field={field} />
      </label>
      {description}
      <div className="pt-1">{children}</div>
      {errorMessage}
    </div>
  );
}
