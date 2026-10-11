import type { ThemeImageKind } from '@formyx/shared';
import { ImageUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  getUploadSignature,
  isUploadCancelled,
  uploadErrorMessage,
  uploadToStorage,
} from '@/lib/uploads';
import { cn } from '@/lib/utils';
import { THEME_IMAGE_ACCEPT, themeImageProblem } from './theme-image';

const COPY: Record<ThemeImageKind, { noun: string; hint: string }> = {
  logo: { noun: 'logo', hint: 'Shown above the title. PNG, JPG, WebP or GIF, up to 5 MB.' },
  cover: {
    noun: 'cover image',
    hint: 'Shown across the top. Wide images work best. PNG, JPG, WebP or GIF, up to 5 MB.',
  },
  background: {
    noun: 'background image',
    hint: 'Fills the page behind the form. PNG, JPG, WebP or GIF, up to 5 MB.',
  },
  content: { noun: 'picture', hint: 'PNG, JPG, WebP or GIF, up to 5 MB.' },
};

interface ThemeImageFieldProps {
  kind: ThemeImageKind;
  url: string | undefined;
  onChange: (url: string | undefined) => void;
}

/** Uploads, replaces or removes the form's logo or cover image. */
export function ThemeImageField({ kind, url, onChange }: ThemeImageFieldProps) {
  const { formId = '' } = useParams();
  const { noun, hint } = COPY[kind];
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    rootRef.current?.querySelector<HTMLElement>('[data-focus-here]')?.focus();
  });

  const upload = async (file: File) => {
    const problem = themeImageProblem(file);
    setError(problem);
    if (problem) return;

    const controller = new AbortController();
    controllerRef.current = controller;
    moveFocus.current = true;
    setProgress(0);
    try {
      const signature = await getUploadSignature({ purpose: kind, formId });
      const stored = await uploadToStorage(signature, file, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      // Saved with the form's next autosave, which checks the image again.
      onChange(stored.secure_url);
    } catch (caught) {
      if (!isUploadCancelled(caught)) setError(uploadErrorMessage(caught));
    } finally {
      // Focus follows the view only if it was still on this control.
      moveFocus.current = rootRef.current?.contains(document.activeElement) ?? false;
      controllerRef.current = null;
      setProgress(null);
    }
  };

  const choose = () => {
    inputRef.current?.click();
  };

  return (
    // Relative, so the hidden file input stays inside the panel's scroll area instead of
    // making the whole page scroll.
    <div ref={rootRef} className="relative flex flex-col gap-3">
      {progress !== null ? (
        <div className="flex items-center gap-3">
          <div
            role="progressbar"
            aria-label={`Uploading the ${noun}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full origin-left rounded-full bg-accent transition-transform duration-150 ease-standard motion-reduce:transition-none"
              style={{ transform: `scaleX(${progress})` }}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            data-focus-here
            onClick={() => {
              controllerRef.current?.abort();
            }}
          >
            Cancel
          </Button>
        </div>
      ) : url ? (
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted',
              kind === 'logo' ? 'h-12 w-20 p-1.5' : 'h-12 w-24',
            )}
          >
            <img
              src={url}
              alt={`Current ${noun}`}
              className={cn('size-full', kind === 'logo' ? 'object-contain' : 'object-cover')}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            <Button variant="secondary" size="sm" data-focus-here onClick={choose}>
              Replace
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                moveFocus.current = true;
                setError(null);
                onChange(undefined);
              }}
            >
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button variant="secondary" size="sm" data-focus-here onClick={choose}>
            <ImageUp aria-hidden />
            Upload {noun}
          </Button>
        </div>
      )}
      <p className="text-12 text-muted-foreground">{hint}</p>
      <p role="alert" className="text-13 text-danger-text empty:hidden">
        {error}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={THEME_IMAGE_ACCEPT}
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
