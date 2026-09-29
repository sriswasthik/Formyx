import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { parseThemePreference } from './theme';
import { THEME_OPTIONS } from './theme-options';
import { useThemeStore } from './theme-store';

/** Light / Dark / System radio items, for use inside any DropdownMenu. */
export function ThemeRadioItems() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);

  return (
    <DropdownMenuRadioGroup
      value={preference}
      onValueChange={(value) => {
        setPreference(parseThemePreference(value));
      }}
    >
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <DropdownMenuRadioItem key={value} value={value}>
          <Icon aria-hidden />
          {label}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

export function ThemeToggle() {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Change theme">
              <Sun className="dark:hidden" aria-hidden />
              <Moon className="hidden dark:block" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Theme</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-36">
        <ThemeRadioItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
