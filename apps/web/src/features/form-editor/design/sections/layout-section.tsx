import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ProBadge } from '@/features/entitlements/pro-badge';
import { useEditorStore } from '../../editor-store-context';
import { StudioGroup } from '../studio-group';
import { ThemeImageField } from '../theme-image-field';

/** The logo, the cover image and "Made with Formyx". */
export function LayoutSection() {
  const theme = useEditorStore((state) => state.theme);
  const updateTheme = useEditorStore((state) => state.updateTheme);
  const badgeId = useId();

  return (
    <>
      <StudioGroup title="Logo">
        <ThemeImageField
          kind="logo"
          url={theme.branding.logoUrl}
          onChange={(logoUrl) => {
            updateTheme((current) => {
              const { logoUrl: _previous, ...branding } = current.branding;
              return { ...current, branding: logoUrl ? { ...branding, logoUrl } : branding };
            });
          }}
        />
      </StudioGroup>
      <StudioGroup title="Cover image">
        <ThemeImageField
          kind="cover"
          url={theme.layout.coverImage?.url}
          onChange={(url) => {
            updateTheme((current) => {
              const { coverImage: _previous, ...layout } = current.layout;
              return {
                ...current,
                layout: url
                  ? { ...layout, coverImage: { url, focalPoint: { x: 50, y: 50 } } }
                  : layout,
              };
            });
          }}
        />
      </StudioGroup>
      <StudioGroup title="Branding">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor={badgeId}>Show “Made with Formyx”</Label>
            <p
              id={`${badgeId}-hint`}
              className="flex items-center gap-1.5 text-12 text-muted-foreground"
            >
              <ProBadge /> Hiding it is a Pro feature.
            </p>
          </div>
          <Switch
            id={badgeId}
            aria-describedby={`${badgeId}-hint`}
            checked={theme.branding.showFormyxBadge}
            onCheckedChange={(showFormyxBadge) => {
              updateTheme((current) => ({
                ...current,
                branding: { ...current.branding, showFormyxBadge },
              }));
            }}
          />
        </div>
      </StudioGroup>
    </>
  );
}
