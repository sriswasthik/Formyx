import type { FieldOfType } from '@formyx/shared';
import { Upload, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { acceptAttribute, fileHint } from './file-types';
import type { ControlProps } from './types';

/**
 * A drop zone for one file. Uploading arrives in a later sprint; until then the answer is
 * the chosen file's name.
 */
export function FileControl({
  field,
  controlId,
  describedBy,
  invalid,
  value,
  onChange,
}: ControlProps<FieldOfType<'file'>>) {
  const [dragging, setDragging] = useState(false);
  const fileName = typeof value === 'string' ? value : null;
  const { allowedTypes, maxSizeMb } = field.fileConfig;

  if (fileName) {
    return (
      <div className="flex items-center gap-3 rounded-(--form-radius) border border-(--form-border-strong) px-3.5 py-3 text-16">
        <span className="min-w-0 flex-1 truncate">{fileName}</span>
        <button
          type="button"
          aria-label={`Remove ${fileName}`}
          className="rounded-(--form-radius) p-1 text-(--form-muted) transition-colors hover:bg-(--form-hover) hover:text-(--form-fg)"
          onClick={() => {
            onChange(null);
          }}
        >
          <X aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <label
      htmlFor={controlId}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => {
        setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) onChange(file.name);
      }}
      className={cn(
        'flex cursor-pointer flex-col items-center gap-2 rounded-(--form-radius) border border-dashed border-(--form-border-strong) px-6 py-8 text-center',
        'transition-colors duration-150 ease-standard hover:bg-(--form-hover)',
        'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--form-accent)',
        dragging && 'border-(--form-accent) bg-(--form-accent-subtle)',
        invalid && 'border-(--form-danger)',
      )}
    >
      <Upload aria-hidden className="size-5 text-(--form-muted)" />
      <span className="text-16 font-medium">Choose a file or drag it here</span>
      <span className="text-14 text-(--form-muted)">{fileHint(allowedTypes, maxSizeMb)}</span>
      <input
        id={controlId}
        type="file"
        accept={acceptAttribute(allowedTypes)}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-required={field.required || undefined}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onChange(file.name);
        }}
      />
    </label>
  );
}
