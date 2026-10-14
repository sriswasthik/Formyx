import type { FormTheme, ThemePreset } from '@formyx/shared';
import { ThemeBackground } from '@/features/form-renderer/theme/background';
import { themeStyle } from '@/features/form-renderer/theme/theme-variables';
import { cn } from '@/lib/utils';

/** A look, small: its background, drawn by the renderer, with a card and its button. */
export function PresetSwatch({ preset, className }: { preset: ThemePreset; className?: string }) {
  const still: FormTheme = {
    ...preset.theme,
    motion: { ...preset.theme.motion, animatedBackground: false },
  };
  return (
    <span
      className={cn(
        'relative isolate flex h-10 items-end overflow-hidden rounded-md p-1.5',
        className,
      )}
      style={themeStyle(still)}
    >
      <ThemeBackground theme={still} />
      <span className="flex h-5 w-full items-center rounded-sm bg-(--form-container-bg) px-1">
        <span className="h-2 w-5 rounded-[2px] bg-(--form-button-bg)" />
      </span>
    </span>
  );
}
