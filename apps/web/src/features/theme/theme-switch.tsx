import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { parseThemePreference } from './theme';
import { THEME_OPTIONS } from './theme-options';
import { useThemeStore } from './theme-store';

/**
 * Light, dark or system, as three small icons side by side: one click, and the current choice
 * always shows. For roomy places such as the site footer; the menu (`ThemeToggle`) fits tighter.
 */
export function ThemeSwitch() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);

  return (
    <ToggleGroup
      type="single"
      aria-label="Theme"
      value={preference}
      onValueChange={(value) => {
        // Radix reports '' when the chosen one is clicked again: it stays chosen.
        if (value) setPreference(parseThemePreference(value));
      }}
      className="h-8 rounded-full"
    >
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <Tooltip key={value}>
          <TooltipTrigger asChild>
            {/* Chosen is styled from `aria-checked`: the tooltip's trigger sets its own
                `data-state` on this same element, hiding the item's "on". */}
            <ToggleGroupItem
              value={value}
              aria-label={label}
              className="min-w-7 rounded-full px-1.5 aria-checked:bg-pressed aria-checked:text-foreground"
            >
              <Icon aria-hidden />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  );
}
