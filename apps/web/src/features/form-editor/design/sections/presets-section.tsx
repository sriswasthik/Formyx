import { applyPreset } from '@formyx/shared';
import { useEditorStore } from '../../editor-store-context';
import { PresetPicker } from '../preset-picker';
import { StudioGroup } from '../studio-group';

/** Ready-made looks to start from; everything stays editable afterwards. */
export function PresetsSection() {
  const theme = useEditorStore((state) => state.theme);
  const updateTheme = useEditorStore((state) => state.updateTheme);
  return (
    <StudioGroup
      title="Presets"
      description="A starting point. Your logo, cover image and branding stay as they are."
    >
      <PresetPicker
        theme={theme}
        onChange={(preset) => {
          updateTheme((current) => applyPreset(current, preset));
        }}
      />
    </StudioGroup>
  );
}
