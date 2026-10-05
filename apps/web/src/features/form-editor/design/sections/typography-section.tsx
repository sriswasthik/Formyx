import { FONTS, fontStack, type FontId } from '@formyx/shared';
import { useId } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProBadge } from '@/features/entitlements/pro-badge';
import { loadFont } from '@/features/form-renderer/theme/fonts';
import { useEditorStore } from '../../editor-store-context';
import { StudioGroup } from '../studio-group';

const FONT_CATEGORY_LABELS = {
  sans: 'Sans serif',
  serif: 'Serif',
  rounded: 'Rounded',
  display: 'Display',
} as const;

interface FontSelectProps {
  label: string;
  value: FontId;
  onChange: (font: FontId) => void;
}

/** One of the registry's fonts, each shown in itself. */
function FontSelect({ label, value, onChange }: FontSelectProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value}
        onValueChange={(next) => {
          const font = FONTS.find((candidate) => candidate.id === next);
          if (font) onChange(font.id);
        }}
        onOpenChange={(open) => {
          // Each font is shown in itself, so the list needs them all.
          if (open) for (const font of FONTS) loadFont(font.id);
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FONTS.map((font) => (
            <SelectItem
              key={font.id}
              value={font.id}
              description={FONT_CATEGORY_LABELS[font.category]}
            >
              <span className="flex items-center gap-2">
                <span style={{ fontFamily: fontStack(font.id) }}>{font.name}</span>{' '}
                {font.tier === 'pro' && <ProBadge />}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Fonts for headings and text. */
export function TypographySection() {
  const typography = useEditorStore((state) => state.theme.typography);
  const updateTheme = useEditorStore((state) => state.updateTheme);
  return (
    <StudioGroup title="Fonts">
      <FontSelect
        label="Headings"
        value={typography.headingFont}
        onChange={(headingFont) => {
          updateTheme((current) => ({
            ...current,
            typography: { ...current.typography, headingFont },
          }));
        }}
      />
      <FontSelect
        label="Text"
        value={typography.bodyFont}
        onChange={(bodyFont) => {
          updateTheme((current) => ({
            ...current,
            typography: { ...current.typography, bodyFont },
          }));
        }}
      />
    </StudioGroup>
  );
}
