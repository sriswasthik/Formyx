import {
  FORM_BACKGROUND_COLORS,
  FORM_BACKGROUND_LABELS,
  FORM_BACKGROUNDS,
  FORM_FONT_LABELS,
  FORM_FONTS,
  FORM_RADII,
  FORM_RADIUS_LABELS,
} from '@formyx/shared';
import { useEffect } from 'react';
import { FORM_FONT_STACKS, loadFormFont } from '@/features/form-renderer/theme-variables';
import { cn } from '@/lib/utils';
import { useEditorStore } from '../editor-store-context';
import { SettingsSection } from '../settings/settings-section';
import { AccentPicker } from './accent-picker';
import { OptionCards } from './option-cards';

const fontOptions = FORM_FONTS.map((font) => ({
  value: font,
  label: FORM_FONT_LABELS[font],
  preview: (
    <span className="text-20 leading-none" style={{ fontFamily: FORM_FONT_STACKS[font] }}>
      Aa
    </span>
  ),
}));

const radiusOptions = FORM_RADII.map((radius) => ({
  value: radius,
  label: FORM_RADIUS_LABELS[radius],
  preview: (
    <span
      className={cn(
        'block h-6 w-9 border-2 border-foreground/70',
        radius === 'rounded' ? 'rounded-[7px]' : 'rounded-none',
      )}
    />
  ),
}));

const backgroundOptions = FORM_BACKGROUNDS.map((background) => ({
  value: background,
  label: FORM_BACKGROUND_LABELS[background],
  preview: (
    <span
      className="block size-6 rounded-full border border-border-strong"
      style={{ backgroundColor: FORM_BACKGROUND_COLORS[background] }}
    />
  ),
}));

/** How the form looks to respondents. Changes show in the canvas and preview at once. */
export function DesignPanel() {
  const theme = useEditorStore((state) => state.theme);
  const updateTheme = useEditorStore((state) => state.updateTheme);

  // The font cards preview each font in itself.
  useEffect(() => {
    for (const font of FORM_FONTS) loadFormFont(font);
  }, []);

  return (
    <div>
      <header className="border-b px-4 py-3">
        <h2 className="text-14 font-medium">Design</h2>
        <p className="text-12 text-muted-foreground">
          Respondents see changes once you publish them.
        </p>
      </header>
      <SettingsSection title="Accent colour">
        <AccentPicker
          theme={theme}
          onChange={(accentColor, options) => {
            updateTheme({ accentColor }, options);
          }}
        />
      </SettingsSection>
      <SettingsSection title="Font">
        <OptionCards
          label="Font"
          value={theme.font}
          options={fontOptions}
          onChange={(font) => {
            updateTheme({ font });
          }}
        />
      </SettingsSection>
      <SettingsSection title="Corners">
        <OptionCards
          label="Corners"
          value={theme.radius}
          options={radiusOptions}
          onChange={(radius) => {
            updateTheme({ radius });
          }}
        />
      </SettingsSection>
      <SettingsSection title="Background">
        <OptionCards
          label="Background"
          value={theme.background}
          options={backgroundOptions}
          onChange={(background) => {
            updateTheme({ background });
          }}
        />
      </SettingsSection>
    </div>
  );
}
