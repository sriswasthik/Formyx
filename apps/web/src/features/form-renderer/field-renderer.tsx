import type { AnswerValue, Field } from '@formyx/shared';
import { memo, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { ChoiceControl, DropdownControl, RatingControl } from './choice-controls';
import { FieldFrame } from './field-frame';
import { describedBy, fieldIds } from './field-ids';
import { FileControl } from './file-control';
import { LongTextControl, SingleLineControl } from './text-controls';
import type { ControlProps, RenderMode } from './types';

export interface FieldRendererProps {
  field: Field;
  mode: RenderMode;
  value?: AnswerValue | undefined;
  /** Receives the field id too, so one stable callback can serve a whole form. */
  onChange?: (fieldId: string, value: AnswerValue) => void;
  error?: string | undefined;
  /** Prefix for element ids; unique per rendered form. */
  idPrefix: string;
  /** The question's number, when the theme numbers questions. */
  number?: string | undefined;
}

function renderControl(field: Field, props: Omit<ControlProps, 'field'>) {
  switch (field.type) {
    case 'short_text':
    case 'email':
    case 'phone':
    case 'number':
    case 'date':
      return <SingleLineControl {...props} field={field} />;
    case 'long_text':
      return <LongTextControl {...props} field={field} />;
    case 'single_choice':
    case 'multi_choice':
      return <ChoiceControl {...props} field={field} />;
    case 'dropdown':
      return <DropdownControl {...props} field={field} />;
    case 'rating':
      return <RatingControl {...props} field={field} />;
    case 'file':
      return <FileControl {...props} field={field} />;
    case 'statement':
      return null;
  }
}

const GROUP_TYPES: readonly Field['type'][] = ['single_choice', 'multi_choice', 'rating'];

/**
 * Renders any question from a form schema. The builder's canvas, the preview and the public
 * form all use it, so they always look the same.
 */
export const FieldRenderer = memo(function FieldRenderer({
  field,
  mode,
  value,
  onChange,
  error,
  idPrefix,
  number,
}: FieldRendererProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  // In the editor the question is a picture of itself: `inert` keeps its inputs out of the
  // tab order and away from clicks, which select the question instead.
  useLayoutEffect(() => {
    if (rootRef.current) rootRef.current.inert = mode === 'editor';
  }, [mode]);

  const rootClass = cn(mode === 'editor' && 'pointer-events-none select-none');

  if (field.type === 'statement') {
    return (
      <div ref={rootRef} className={cn(rootClass, 'flex flex-col gap-2')}>
        <p className="form-text leading-relaxed whitespace-pre-wrap">
          {field.label || <span className="text-(--form-muted)">Untitled statement</span>}
        </p>
        {field.description && (
          <p className="form-text-sm whitespace-pre-wrap text-(--form-muted)">
            {field.description}
          </p>
        )}
      </div>
    );
  }

  const ids = fieldIds(idPrefix, field);

  return (
    <div ref={rootRef} className={rootClass}>
      <FieldFrame
        field={field}
        ids={ids}
        group={GROUP_TYPES.includes(field.type)}
        error={error}
        number={number}
      >
        {renderControl(field, {
          controlId: ids.control,
          describedBy: describedBy(ids, field, error),
          invalid: Boolean(error),
          value,
          onChange: (next) => {
            onChange?.(field.id, next);
          },
        })}
      </FieldFrame>
    </div>
  );
});
