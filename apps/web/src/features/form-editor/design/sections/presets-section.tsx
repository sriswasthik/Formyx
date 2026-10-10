import { applyPreset } from '@formyx/shared';
import { useEditorStore } from '../../editor-store-context';
import { useEditorWorkspaceId } from '../../editor-workspace';
import { BrandKitGroup } from '../brand-kit-group';
import { LogoThemeGroup } from '../logo-theme-group';
import { PresetPicker } from '../preset-picker';
import { StudioGroup } from '../studio-group';

/**
 * Ready-made looks to start from, and the workspace's brand kits; everything stays editable
 * afterwards.
 */
export function PresetsSection() {
  const theme = useEditorStore((state) => state.theme);
  const updateTheme = useEditorStore((state) => state.updateTheme);
  const workspaceId = useEditorWorkspaceId();
  return (
    <>
      {workspaceId && <BrandKitGroup workspaceId={workspaceId} />}
      <LogoThemeGroup />
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
    </>
  );
}
