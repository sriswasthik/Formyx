import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useInsertAtCaret } from './insert-at-caret';
import { InsertVariable, type PipeSources } from './insert-variable';

interface PipedTextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** What can be inserted; the menu shows only when given. */
  pipe?: PipeSources | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  placeholder?: string | undefined;
  maxLength?: number;
  /** A one-line box; otherwise a text area of this many rows. */
  rows?: number;
}

/**
 * A labelled text box whose text can carry earlier answers and values: the insert menu
 * beside its label puts `{{…}}` where the caret is.
 */
export function PipedTextField({
  id,
  label,
  value,
  onChange,
  pipe,
  hint,
  error,
  placeholder,
  maxLength,
  rows,
}: PipedTextFieldProps) {
  const { ref: areaRef, insert: insertInArea } = useInsertAtCaret<HTMLTextAreaElement>(
    value,
    onChange,
  );
  const { ref: lineRef, insert: insertInLine } = useInsertAtCaret<HTMLInputElement>(
    value,
    onChange,
  );
  const messageId = `${id}-message`;
  const message = error ?? hint;
  const shared = {
    id,
    value,
    placeholder,
    maxLength,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': message ? messageId : undefined,
  } as const;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-7 items-end justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {pipe && (
          <InsertVariable
            sources={pipe}
            target={label.toLowerCase()}
            onInsert={rows === undefined ? insertInLine : insertInArea}
          />
        )}
      </div>
      {rows === undefined ? (
        <Input
          ref={lineRef}
          {...shared}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      ) : (
        <Textarea
          ref={areaRef}
          rows={rows}
          {...shared}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
      {message && (
        <p
          id={messageId}
          className={cn('text-13', error ? 'text-danger-text' : 'text-muted-foreground')}
        >
          {message}
        </p>
      )}
    </div>
  );
}
