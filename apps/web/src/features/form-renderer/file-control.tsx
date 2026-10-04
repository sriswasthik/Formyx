import { fileProblem, formatFileSize, isFileAnswer, type FieldOfType } from '@formyx/shared';
import { FileText, RotateCw, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isUploadCancelled, uploadErrorMessage } from '@/lib/uploads';
import { cn } from '@/lib/utils';
import { useFileUploads } from './file-uploads';
import { acceptAttribute, fileHint } from './file-types';
import type { ControlProps } from './types';

type Transfer =
  | { status: 'idle' }
  | { status: 'uploading'; file: File; progress: number }
  | { status: 'failed'; file: File };

const iconButton = cn(
  'inline-flex items-center gap-1.5 rounded-(--form-radius) px-2 py-1 form-text-sm text-(--form-muted)',
  'transition-colors duration-150 ease-standard hover:bg-(--form-hover) hover:text-(--form-fg)',
);

/** One file's row: an icon, its name and size, and what can be done with it. */
function FileRow({
  name,
  size,
  invalid,
  children,
  actions,
}: {
  name: string;
  size: number;
  invalid: boolean;
  children?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-(--form-radius) border border-(--form-border-strong) px-3.5 py-3',
        invalid && 'border-(--form-danger)',
      )}
    >
      <FileText aria-hidden className="size-5 shrink-0 text-(--form-muted)" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="flex min-w-0 items-baseline gap-2 form-text">
          <span className="truncate">{name}</span>
          <span className="shrink-0 form-text-sm text-(--form-muted) tabular-nums">
            {formatFileSize(size)}
          </span>
        </p>
        {children}
      </div>
      <div className="flex shrink-0 items-center gap-1">{actions}</div>
    </div>
  );
}

function ProgressBar({ name, progress }: { name: string; progress: number }) {
  const percent = Math.round(progress * 100);
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-label={`Uploading ${name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-(--form-border)"
      >
        <div
          className="h-full origin-left rounded-full bg-(--form-accent) transition-transform duration-150 ease-standard motion-reduce:transition-none"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
      <span aria-hidden className="w-10 text-right form-text-sm text-(--form-muted) tabular-nums">
        {percent}%
      </span>
    </div>
  );
}

/**
 * A drop zone for one file. The file goes straight to storage as soon as it is chosen, with
 * a progress bar; the answer is the stored file. Files that break the question's limits are
 * turned away before uploading, and the server checks again.
 */
export function FileControl({
  field,
  controlId,
  describedBy,
  invalid,
  value,
  onChange,
}: ControlProps<FieldOfType<'file'>>) {
  const uploads = useFileUploads();
  const [transfer, setTransfer] = useState<Transfer>({ status: 'idle' });
  const [dragging, setDragging] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const { allowedTypes, maxSizeMb } = field.fileConfig;
  const fieldId = field.id;
  const setUploading = uploads?.setUploading;

  // Each view marks the control that should have focus once it replaces the previous one.
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    rootRef.current?.querySelector<HTMLElement>('[data-focus-here]')?.focus();
  });

  // A question that goes away (or a form that is reset) stops its upload.
  useEffect(
    () => () => {
      controllerRef.current?.abort();
      setUploading?.(fieldId, false);
    },
    [fieldId, setUploading],
  );

  /** Moves focus along with the view, unless the person has gone elsewhere meanwhile. */
  const keepFocus = () => {
    moveFocus.current = rootRef.current?.contains(document.activeElement) ?? false;
  };

  const start = async (file: File) => {
    moveFocus.current = true;
    onChange(null);
    const problem = fileProblem(file, { maxSizeMb, allowedTypes });
    if (problem || !uploads?.upload) {
      const message = problem ?? 'Files can’t be uploaded here.';
      setTransfer({ status: 'idle' });
      setAnnouncement(message);
      uploads?.reportProblem(fieldId, message);
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setTransfer({ status: 'uploading', file, progress: 0 });
    setAnnouncement(`Uploading ${file.name}`);
    uploads.setUploading(fieldId, true);
    try {
      const answer = await uploads.upload(field, file, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (controller.signal.aborted) return;
          setTransfer({ status: 'uploading', file, progress });
        },
      });
      if (controller.signal.aborted) return;
      keepFocus();
      setTransfer({ status: 'idle' });
      setAnnouncement(`${file.name} uploaded`);
      onChange(answer);
    } catch (error) {
      if (isUploadCancelled(error) || controller.signal.aborted) return;
      const message = uploadErrorMessage(error);
      keepFocus();
      setTransfer({ status: 'failed', file });
      setAnnouncement(message);
      uploads.reportProblem(fieldId, message);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      uploads.setUploading(fieldId, false);
    }
  };

  const clear = () => {
    moveFocus.current = true;
    controllerRef.current?.abort();
    setTransfer({ status: 'idle' });
    setAnnouncement('');
    onChange(null);
  };

  let view: ReactNode;
  if (transfer.status === 'uploading') {
    view = (
      <FileRow
        name={transfer.file.name}
        size={transfer.file.size}
        invalid={invalid}
        actions={
          <button type="button" data-focus-here className={iconButton} onClick={clear}>
            Cancel
          </button>
        }
      >
        <ProgressBar name={transfer.file.name} progress={transfer.progress} />
      </FileRow>
    );
  } else if (transfer.status === 'failed') {
    const { file } = transfer;
    view = (
      <FileRow
        name={file.name}
        size={file.size}
        invalid
        actions={
          <>
            <button
              type="button"
              data-focus-here
              className={iconButton}
              onClick={() => {
                void start(file);
              }}
            >
              <RotateCw aria-hidden />
              Try again
            </button>
            <button
              type="button"
              aria-label={`Remove ${file.name}`}
              className={cn(iconButton, 'px-1')}
              onClick={clear}
            >
              <X aria-hidden />
            </button>
          </>
        }
      />
    );
  } else if (isFileAnswer(value)) {
    view = (
      <FileRow
        name={value.name}
        size={value.size}
        invalid={invalid}
        actions={
          <button
            type="button"
            data-focus-here
            aria-label={`Remove ${value.name}`}
            className={cn(iconButton, 'px-1')}
            onClick={clear}
          >
            <X aria-hidden />
          </button>
        }
      />
    );
  } else {
    view = (
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
          if (file) void start(file);
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
        <span className="form-text font-medium">Choose a file or drag it here</span>
        <span className="form-text-sm text-(--form-muted)">
          {fileHint(allowedTypes, maxSizeMb)}
        </span>
        <input
          id={controlId}
          type="file"
          data-focus-here
          accept={acceptAttribute(allowedTypes)}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          aria-required={field.required || undefined}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Choosing the same file again after removing it must still count as a change.
            event.target.value = '';
            if (file) void start(file);
          }}
        />
      </label>
    );
  }

  return (
    <div ref={rootRef}>
      {view}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
