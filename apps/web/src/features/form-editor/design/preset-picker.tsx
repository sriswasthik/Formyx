import {
  matchingPreset,
  THEME_PRESETS,
  type FormTheme,
  type ThemePreset,
  type ThemePresetId,
} from '@formyx/shared';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { ProBadge } from '@/features/entitlements/pro-badge';
import { ThemeBackground } from '@/features/form-renderer/theme/background';
import { themeStyle } from '@/features/form-renderer/theme/theme-variables';
import { cn } from '@/lib/utils';

/** A few marks in the preset's colours and fonts: heading, input and button. */
function MiniForm() {
  return (
    <span className="flex flex-col gap-1.5">
      <span className="font-(family-name:--form-heading-font) text-16 leading-none font-(--form-heading-weight)">
        Aa
      </span>
      <span className="block h-2 w-full rounded-[min(var(--form-input-radius),4px)] border border-(--form-input-border) bg-(--form-input-bg)" />
      <span className="block h-2.5 w-7 rounded-[min(var(--form-button-radius),5px)] border border-(--form-button-border) bg-(--form-button-bg)" />
    </span>
  );
}

/** A small, still picture of the preset, drawn by the same code as real forms. */
function PresetThumbnail({ theme }: { theme: FormTheme }) {
  const still = { ...theme, motion: { ...theme.motion, animatedBackground: false } };
  const split = theme.layout.mode === 'split';
  const boxed = !split && theme.components.containerStyle !== 'none';

  return (
    <span
      aria-hidden
      className="relative isolate flex aspect-[16/10] w-full overflow-hidden rounded-md border text-(--form-fg)"
      style={themeStyle(still)}
    >
      {split ? (
        <>
          <span className="relative isolate w-1/2">
            <ThemeBackground theme={still} />
          </span>
          <span className="flex w-1/2 items-center bg-(--form-bg) px-2.5">
            <MiniForm />
          </span>
        </>
      ) : (
        <>
          <ThemeBackground theme={still} />
          <span className="flex w-full items-center justify-center px-3">
            <span
              className={cn(
                'w-full max-w-24',
                boxed &&
                  'rounded-[min(var(--form-container-radius),6px)] border border-(--form-container-border) bg-(--form-container-bg) p-2 [box-shadow:var(--form-container-shadow)]',
              )}
            >
              <MiniForm />
            </span>
          </span>
        </>
      )}
    </span>
  );
}

interface PresetPickerProps {
  theme: FormTheme;
  onChange: (preset: ThemePreset<ThemePresetId>) => void;
}

/** Ready-made looks. None is selected once the look has been changed by hand. */
export function PresetPicker({ theme, onChange }: PresetPickerProps) {
  return (
    <RadioGroupPrimitive.Root
      aria-label="Theme"
      value={matchingPreset(theme)?.id ?? ''}
      onValueChange={(id) => {
        const preset = THEME_PRESETS.find((candidate) => candidate.id === id);
        if (preset) onChange(preset);
      }}
      className="grid grid-cols-2 gap-2"
    >
      {THEME_PRESETS.map((preset) => (
        <RadioGroupPrimitive.Item
          key={preset.id}
          value={preset.id}
          className={cn(
            'flex flex-col gap-2 rounded-lg border bg-background p-1.5 pb-2 text-left text-13',
            'transition-colors duration-150 ease-standard',
            'hover:border-border-strong active:bg-pressed',
            'data-[state=checked]:border-accent data-[state=checked]:bg-accent-subtle',
          )}
        >
          <PresetThumbnail theme={preset.theme} />
          <span className="flex items-center gap-1.5 px-1">
            {preset.name} {preset.tier === 'pro' && <ProBadge />}
          </span>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
