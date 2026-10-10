import {
  extractPalette,
  fontStack,
  suggestThemeFromPalette,
  type FormTheme,
  type PaletteColor,
} from '@formyx/shared';
import { ImageUp, Palette } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { loadFont } from '@/features/form-renderer/theme/fonts';
import { getUploadSignature, uploadErrorMessage, uploadToStorage } from '@/lib/uploads';
import { useEditorStore } from '../editor-store-context';
import { readImagePixels } from './logo-pixels';
import { StudioGroup } from './studio-group';
import { THEME_IMAGE_ACCEPT, themeImageProblem } from './theme-image';

type Upload =
  { state: 'uploading' } | { state: 'done'; url: string } | { state: 'failed'; message: string };

interface Reading {
  /** For the preview of the logo itself, while it uploads. */
  previewUrl: string;
  palette: PaletteColor[];
  upload: Upload;
}

/** A small picture of the suggested look: its page, heading font, text and button. */
function SuggestionPreview({ theme }: { theme: FormTheme }) {
  const { colors, typography } = theme;
  useEffect(() => {
    void loadFont(typography.headingFont);
  }, [typography.headingFont]);
  return (
    <div
      aria-hidden
      className="flex items-center gap-3 rounded-lg border p-3"
      style={{ backgroundColor: colors.containerBackground }}
    >
      <span
        className="text-20 leading-none"
        style={{
          color: colors.text,
          fontFamily: fontStack(typography.headingFont),
          fontWeight: typography.headingWeight,
        }}
      >
        Aa
      </span>
      <span className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: colors.mutedText }} />
      <span
        className="rounded-md px-2.5 py-1 text-12 font-medium"
        style={{ backgroundColor: colors.primary, color: colors.buttonText }}
      >
        Submit
      </span>
    </div>
  );
}

/**
 * Builds a look from a logo: its colours are read on this device from a small copy of the
 * image (canvas colour quantization), a readable theme is suggested from them, and the logo
 * uploads meanwhile so it can come with the look.
 */
export function LogoThemeGroup() {
  const { formId = '' } = useParams();
  const theme = useEditorStore((state) => state.theme);
  const updateTheme = useEditorStore((state) => state.updateTheme);
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestion = useMemo(
    () =>
      reading &&
      suggestThemeFromPalette(
        theme,
        reading.palette,
        reading.upload.state === 'done' ? reading.upload.url : undefined,
      ),
    [theme, reading],
  );

  // The preview's object URL lives as long as it is shown.
  useEffect(() => {
    const previewUrl = reading?.previewUrl;
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [reading?.previewUrl]);

  const read = async (file: File) => {
    const problem = themeImageProblem(file);
    setError(problem);
    if (problem) return;
    setBusy(true);
    try {
      const palette = extractPalette(await readImagePixels(file));
      if (palette.length === 0) {
        setError('This image has no colours to work with. Try another.');
        return;
      }
      const previewUrl = URL.createObjectURL(file);
      setReading({ previewUrl, palette, upload: { state: 'uploading' } });
      try {
        const signature = await getUploadSignature({ purpose: 'logo', formId });
        const stored = await uploadToStorage(signature, file);
        setReading((current) =>
          current?.previewUrl === previewUrl
            ? { ...current, upload: { state: 'done', url: stored.secure_url } }
            : current,
        );
      } catch (caught) {
        const message = uploadErrorMessage(caught);
        setReading((current) =>
          current?.previewUrl === previewUrl
            ? { ...current, upload: { state: 'failed', message } }
            : current,
        );
      }
    } catch {
      setError('This image could not be read. Try a PNG or JPG.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <StudioGroup
      title="Theme from your logo"
      description="Colours and fonts to match your logo. Its colours are read on your device."
    >
      {/* Relative, so the hidden file input stays inside the panel's scroll area. */}
      <div className="relative flex flex-col gap-4">
        {reading && suggestion ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <img
                src={reading.previewUrl}
                alt="Your logo"
                className="h-10 w-16 shrink-0 rounded-md border bg-muted object-contain p-1"
              />
              <ul aria-label="Colours in your logo" className="flex flex-wrap gap-1.5">
                {reading.palette.map(({ color }) => (
                  <li key={color} className="flex items-center gap-1 text-12 text-muted-foreground">
                    <span
                      aria-hidden
                      className="size-4 rounded-full border"
                      style={{ backgroundColor: color }}
                    />
                    <span className="font-mono">{color}</span>
                  </li>
                ))}
              </ul>
            </div>
            <SuggestionPreview theme={suggestion} />
            <p role="status" className="text-12 text-muted-foreground">
              {reading.upload.state === 'uploading' && 'Uploading the logo…'}
              {reading.upload.state === 'done' && 'The logo comes with the look.'}
              {reading.upload.state === 'failed' &&
                `The logo could not be uploaded (${reading.upload.message}). The colours and fonts can still be applied.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={reading.upload.state === 'uploading'}
                onClick={() => {
                  const { palette, upload } = reading;
                  const logoUrl = upload.state === 'done' ? upload.url : undefined;
                  updateTheme((current) => suggestThemeFromPalette(current, palette, logoUrl));
                  setReading(null);
                  toast.success('Applied a look from your logo');
                }}
              >
                <Palette aria-hidden />
                Apply this look
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setReading(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="secondary"
            className="self-start"
            disabled={busy}
            onClick={() => {
              inputRef.current?.click();
            }}
          >
            <ImageUp aria-hidden />
            {busy ? 'Reading the logo…' : 'Choose a logo'}
          </Button>
        )}
        <p role="alert" className="text-13 text-danger-text empty:hidden">
          {error}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={THEME_IMAGE_ACCEPT}
          tabIndex={-1}
          aria-hidden
          aria-label="Logo file"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void read(file);
          }}
        />
      </div>
    </StudioGroup>
  );
}
