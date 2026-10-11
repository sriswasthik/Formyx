import { IMAGE_BLOCK_WIDTHS, parseVideoUrl, type FieldOfType } from '@formyx/shared';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ThemeImageField } from '../design/theme-image-field';
import type { FieldPatch } from '../editor-store';
import { RichTextEditor } from './rich-text-editor';
import { SettingsSection } from './settings-section';

type Update = (patch: FieldPatch, mergeKey?: string) => void;

interface Props<T> {
  field: T;
  issues: Record<string, string>;
  update: Update;
}

const WIDTH_LABELS = { small: 'Small', medium: 'Medium', full: 'Full' } as const;

export function ImageSettings({ field, issues, update }: Props<FieldOfType<'image'>>) {
  return (
    <SettingsSection title="Image">
      <div className="flex flex-col gap-1.5">
        <ThemeImageField
          kind="content"
          url={field.imageUrl}
          onChange={(imageUrl) => {
            update({ imageUrl });
          }}
        />
        {issues.imageUrl && <p className="text-13 text-danger-text">{issues.imageUrl}</p>}
      </div>
      <FormField
        id="setting-alt"
        label="Alt text"
        hint="What the image shows, for people who cannot see it."
        error={issues.alt}
      >
        <Textarea
          rows={2}
          value={field.alt}
          maxLength={300}
          onChange={(event) => {
            update({ alt: event.target.value }, 'alt');
          }}
        />
      </FormField>
      <div className="flex flex-col gap-1.5">
        <span id="setting-width-label" className="text-13 font-medium">
          Width
        </span>
        <ToggleGroup
          type="single"
          aria-labelledby="setting-width-label"
          value={field.width}
          onValueChange={(width) => {
            const next = IMAGE_BLOCK_WIDTHS.find((item) => item === width);
            if (next) update({ width: next });
          }}
        >
          {IMAGE_BLOCK_WIDTHS.map((width) => (
            <ToggleGroupItem key={width} value={width}>
              {WIDTH_LABELS[width]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </SettingsSection>
  );
}

export function VideoSettings({ field, issues, update }: Props<FieldOfType<'video'>>) {
  const typed = field.videoUrl.trim() !== '';
  const unknown = typed && !parseVideoUrl(field.videoUrl);
  return (
    <SettingsSection title="Video">
      <FormField
        id="setting-video-url"
        label="Video link"
        hint="A YouTube or Vimeo link. The video loads only when played."
        error={issues.videoUrl ?? (unknown ? 'Use a YouTube or Vimeo link' : undefined)}
      >
        <Input
          type="url"
          inputMode="url"
          value={field.videoUrl}
          placeholder="https://www.youtube.com/watch?v=…"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            update({ videoUrl: event.target.value }, 'video-url');
          }}
        />
      </FormField>
    </SettingsSection>
  );
}

export function ConsentSettings({ field, issues, update }: Props<FieldOfType<'consent'>>) {
  return (
    <SettingsSection title="Terms">
      <RichTextEditor
        id="setting-terms"
        label="Terms"
        rows={6}
        value={field.terms}
        error={issues.terms}
        placeholder="By submitting this form you agree to…"
        onChange={(terms) => {
          update({ terms }, 'terms');
        }}
      />
    </SettingsSection>
  );
}
