import {
  buttonTextOn,
  matchingSurface,
  SURFACES,
  withPrimaryColor,
  withSurface,
  type ThemeColors,
} from '@formyx/shared';
import { useEditorStore } from '../../editor-store-context';
import { AccentPicker } from '../accent-picker';
import { ColorField } from '../fields';
import { OptionCards } from '../option-cards';
import { StudioGroup } from '../studio-group';

const surfaceOptions = SURFACES.map((surface) => ({
  value: surface.id,
  label: surface.label,
  preview: (
    <span
      className="block size-6 rounded-full border border-border-strong"
      style={{ backgroundColor: surface.color }}
    />
  ),
}));

type EditableColor = Exclude<keyof ThemeColors, 'primary'>;

const COLOR_FIELDS: readonly { key: EditableColor; label: string }[] = [
  { key: 'text', label: 'Text' },
  { key: 'mutedText', label: 'Hints' },
  { key: 'containerBackground', label: 'Card' },
  { key: 'inputBackground', label: 'Field' },
  { key: 'inputBorder', label: 'Field border' },
  { key: 'buttonText', label: 'Button text' },
  { key: 'error', label: 'Errors' },
];

export function ColorsSection() {
  const theme = useEditorStore((state) => state.theme);
  const updateTheme = useEditorStore((state) => state.updateTheme);

  return (
    <>
      <StudioGroup
        title="Accent colour"
        description="Buttons, selected choices, links and focus rings."
      >
        <AccentPicker
          theme={theme}
          onChange={(color, options) => {
            updateTheme((current) => withPrimaryColor(current, color), options);
          }}
        />
      </StudioGroup>
      <StudioGroup title="Text and surfaces">
        <div className="grid grid-cols-1 gap-4 @sm:grid-cols-2">
          {COLOR_FIELDS.map(({ key, label }) => (
            <ColorField
              key={key}
              label={label}
              value={theme.colors[key]}
              mergeKey={`color:${key}`}
              onChange={(color, options) => {
                updateTheme(
                  (current) => ({ ...current, colors: { ...current.colors, [key]: color } }),
                  options,
                );
              }}
            />
          ))}
        </div>
        {theme.colors.buttonText !== buttonTextOn(theme.colors.primary) && (
          <p className="text-12 text-muted-foreground">
            Button text is set by hand; picking an accent sets it to whatever reads best.
          </p>
        )}
      </StudioGroup>
      <StudioGroup
        title="Plain background"
        description="Replaces every background layer with one colour, and sets the text colours to match."
      >
        <OptionCards
          label="Plain background"
          value={matchingSurface(theme)}
          options={surfaceOptions}
          onChange={(id) => {
            const surface = SURFACES.find((candidate) => candidate.id === id);
            if (surface) updateTheme((current) => withSurface(current, surface.color));
          }}
        />
      </StudioGroup>
    </>
  );
}
