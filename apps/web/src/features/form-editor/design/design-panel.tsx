import {
  applyPreset,
  FEATURES,
  FONTS,
  fontStack,
  matchingSurface,
  requiredFeatures,
  SURFACES,
  withPrimaryColor,
  withSurface,
  type FontId,
  type FormTheme,
} from '@formyx/shared';
import { useId } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ProBadge } from '@/features/entitlements/pro-badge';
import { loadFont } from '@/features/form-renderer/theme/fonts';
import { cn } from '@/lib/utils';
import { useEditorEntitlements } from '../editor-entitlements';
import { useEditorStore } from '../editor-store-context';
import { SettingsSection } from '../settings/settings-section';
import { AccentPicker } from './accent-picker';
import { OptionCards } from './option-cards';
import { PresetPicker } from './preset-picker';
import { ThemeImageField } from './theme-image-field';

const RADII = [
  { value: 'sharp', label: 'Sharp', px: 0 },
  { value: 'rounded', label: 'Rounded', px: 10 },
] as const;

const radiusOptions = RADII.map(({ value, label }) => ({
  value,
  label,
  preview: (
    <span
      className={cn(
        'block h-6 w-9 border-2 border-foreground/70',
        value === 'rounded' ? 'rounded-[7px]' : 'rounded-none',
      )}
    />
  ),
}));

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

/** Says how Pro styles stand for this workspace: free in the beta, or what publishing needs. */
function PlanNote({ theme }: { theme: FormTheme }) {
  const { entitlements, enforced, missing } = useEditorEntitlements();
  if (!entitlements) return null;
  if (!enforced) {
    return (
      <p className="text-12 text-muted-foreground">
        Styles marked Pro are included free during the beta.
      </p>
    );
  }
  const locked = missing(requiredFeatures(theme));
  if (locked.length === 0) return null;
  return (
    <p role="status" className="text-12 text-warning-text">
      Uses Pro styles ({locked.map((featureId) => FEATURES[featureId].name).join(', ')}). Try them
      here; publishing them needs a Pro plan.
    </p>
  );
}

/** How the form looks to respondents. Changes show in the canvas and preview at once. */
export function DesignPanel() {
  const theme = useEditorStore((state) => state.theme);
  const updateTheme = useEditorStore((state) => state.updateTheme);
  const badgeId = useId();
  const radius = RADII.find((option) => option.px === theme.components.radius)?.value ?? null;

  return (
    <div>
      <header className="flex flex-col gap-1 border-b px-4 py-3">
        <h2 className="text-14 font-medium">Design</h2>
        <p className="text-12 text-muted-foreground">
          Respondents see changes once you publish them.
        </p>
        <PlanNote theme={theme} />
      </header>
      <SettingsSection title="Theme">
        <PresetPicker
          theme={theme}
          onChange={(preset) => {
            updateTheme((current) => applyPreset(current, preset));
          }}
        />
      </SettingsSection>
      <SettingsSection title="Accent colour">
        <AccentPicker
          theme={theme}
          onChange={(color, options) => {
            updateTheme((current) => withPrimaryColor(current, color), options);
          }}
        />
      </SettingsSection>
      <SettingsSection title="Background">
        <OptionCards
          label="Background"
          value={matchingSurface(theme)}
          options={surfaceOptions}
          onChange={(id) => {
            const surface = SURFACES.find((candidate) => candidate.id === id);
            if (surface) updateTheme((current) => withSurface(current, surface.color));
          }}
        />
      </SettingsSection>
      <SettingsSection title="Fonts">
        <FontSelect
          label="Headings"
          value={theme.typography.headingFont}
          onChange={(headingFont) => {
            updateTheme((current) => ({
              ...current,
              typography: { ...current.typography, headingFont },
            }));
          }}
        />
        <FontSelect
          label="Text"
          value={theme.typography.bodyFont}
          onChange={(bodyFont) => {
            updateTheme((current) => ({
              ...current,
              typography: { ...current.typography, bodyFont },
            }));
          }}
        />
      </SettingsSection>
      <SettingsSection title="Corners">
        <OptionCards
          label="Corners"
          value={radius}
          options={radiusOptions}
          onChange={(value) => {
            const px = RADII.find((option) => option.value === value)?.px ?? 10;
            updateTheme((current) => ({
              ...current,
              components: { ...current.components, radius: px },
            }));
          }}
        />
      </SettingsSection>
      <SettingsSection title="Logo">
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
      </SettingsSection>
      <SettingsSection title="Cover image">
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
      </SettingsSection>
      <SettingsSection title="Branding">
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
      </SettingsSection>
    </div>
  );
}
