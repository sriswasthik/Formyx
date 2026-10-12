import type { AnswerValue, Field } from '@formyx/shared';
import { EyeOff, Scissors } from 'lucide-react';
import { memo, useLayoutEffect, useRef } from 'react';
import { cx } from '@/lib/cx';
import { ChoiceControl, DropdownControl, RatingControl } from './choice-controls';
import { controlChunk, useControlChunk, type ControlChunkId } from './controls/registry';
import { FieldFrame } from './field-frame';
import { describedBy, fieldIds } from './field-ids';
import { RichText } from './rich-text';
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
  /** `large` in conversational forms, where each question has the page to itself. */
  size?: 'regular' | 'large';
}

/** Blocks take no answer. */
function ignoreAnswer() {
  // Nothing to record.
}

/** Holds a control's place while its chunk loads (the public form preloads them). */
function ControlPlaceholder() {
  return <div aria-hidden className="h-11 rounded-(--form-input-radius) bg-(--form-hover)" />;
}

/** A control from one of the chunks loaded on demand. */
function LazyControl({ chunk, props }: { chunk: ControlChunkId; props: ControlProps }) {
  const loaded = useControlChunk(chunk);
  return loaded ? <loaded.Control {...props} /> : <ControlPlaceholder />;
}

function renderControl(props: ControlProps) {
  const { field } = props;
  const chunk = controlChunk(field);
  if (chunk) return <LazyControl chunk={chunk} props={props} />;
  switch (field.type) {
    case 'short_text':
    case 'email':
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
    default:
      return null;
  }
}

/** Several inputs answer these: a fieldset with a legend names them together. */
const GROUP_TYPES: readonly Field['type'][] = [
  'single_choice',
  'multi_choice',
  'rating',
  'picture_choice',
  'yes_no',
  'nps',
  'opinion_scale',
  'ranking',
  'matrix',
  'address',
  'date_range',
  'signature',
  'voice_note',
];

/** What the editor shows of blocks respondents never see as such. */
function EditorMarker({
  icon: Icon,
  children,
}: {
  icon: typeof EyeOff;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 form-text-sm text-(--form-muted)">
      <span
        aria-hidden
        className="h-px flex-1 border-t border-dashed border-(--form-border-strong)"
      />
      <span className="inline-flex items-center gap-1.5">
        <Icon aria-hidden className="size-3.5" />
        {children}
      </span>
      <span
        aria-hidden
        className="h-px flex-1 border-t border-dashed border-(--form-border-strong)"
      />
    </div>
  );
}

/**
 * Renders any question or block from a form schema. The builder's canvas, the preview and
 * the public form all use it, so they always look the same.
 */
export const FieldRenderer = memo(function FieldRenderer({
  field,
  mode,
  value,
  onChange,
  error,
  idPrefix,
  number,
  size = 'regular',
}: FieldRendererProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  // In the editor the question is a picture of itself: `inert` keeps its inputs out of the
  // tab order and away from clicks, which select the question instead.
  useLayoutEffect(() => {
    if (rootRef.current) rootRef.current.inert = mode === 'editor';
  }, [mode]);

  const rootClass = cx(mode === 'editor' && 'pointer-events-none select-none');
  const textSize = size === 'large' ? 'form-text-lg' : 'form-text';

  switch (field.type) {
    case 'statement':
      return (
        <div ref={rootRef} className={cx(rootClass, 'flex flex-col gap-2')}>
          {field.label ? (
            <RichText text={field.label} className={cx(textSize, 'leading-relaxed')} />
          ) : (
            <p className={cx(textSize, 'text-(--form-muted)')}>Untitled statement</p>
          )}
          {field.description && (
            <p className="form-text-sm whitespace-pre-wrap text-(--form-muted)">
              {field.description}
            </p>
          )}
        </div>
      );
    case 'image':
    case 'video':
      return (
        <div ref={rootRef} className={rootClass}>
          <LazyControl
            chunk="blocks"
            props={{
              field,
              controlId: '',
              describedBy: undefined,
              invalid: false,
              value: undefined,
              onChange: ignoreAnswer,
            }}
          />
        </div>
      );
    case 'divider':
      return <hr className="border-(--form-border)" />;
    case 'page_break':
      // Respondents see pages; the editor marks where one ends.
      return mode === 'editor' ? (
        <div ref={rootRef}>
          <EditorMarker icon={Scissors}>
            Page break{field.label.trim() ? `: ${field.label.trim()}` : ''}
          </EditorMarker>
        </div>
      ) : null;
    case 'hidden':
      return mode === 'editor' ? (
        <div ref={rootRef}>
          <EditorMarker icon={EyeOff}>
            Hidden: {field.label.trim() || 'Untitled'} from ?{field.paramName || 'name'}=
          </EditorMarker>
        </div>
      ) : null;
    default:
      break;
  }

  const ids = fieldIds(idPrefix, field);
  const control = renderControl({
    field,
    controlId: ids.control,
    describedBy: describedBy(ids, field, error),
    invalid: Boolean(error),
    value,
    onChange: (next) => {
      onChange?.(field.id, next);
    },
  });

  // Consent's label is the checkbox's own text; the frame adds the description and error.
  if (field.type === 'consent') {
    return (
      <div ref={rootRef} className={cx(rootClass, 'flex min-w-0 flex-col gap-2')}>
        {control}
        {field.description && (
          <p id={ids.description} className="form-text-sm whitespace-pre-wrap text-(--form-muted)">
            {field.description}
          </p>
        )}
        {error && (
          <p id={ids.error} className="form-text-sm text-(--form-danger)">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} className={rootClass}>
      <FieldFrame
        field={field}
        ids={ids}
        group={GROUP_TYPES.includes(field.type)}
        error={error}
        number={number}
        size={size}
      >
        {control}
      </FieldFrame>
    </div>
  );
});
