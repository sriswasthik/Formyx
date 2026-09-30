import type { FormTheme } from '@formyx/shared';
import type * as React from 'react';
import { readableTextColor, relativeLuminance } from '@/lib/color';

const RADIUS: Record<FormTheme['radius'], string> = {
  none: '0px',
  small: '4px',
  medium: '8px',
  large: '12px',
};

const FONT: Record<FormTheme['font'], string> = {
  inter: "'Inter Variable', ui-sans-serif, system-ui, sans-serif",
  system: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
};

/**
 * CSS variables that every form component uses instead of the app's tokens. A form always
 * looks like its theme, not like the editor's light or dark mode, so what the editor shows
 * is what respondents get.
 */
export function formThemeVariables(theme: FormTheme): React.CSSProperties {
  const isDark = relativeLuminance(theme.background) < 0.2;
  const foreground = readableTextColor(theme.background, '#18181b', '#fafafa');
  const mix = (percent: number) =>
    `color-mix(in srgb, ${foreground} ${percent}%, ${theme.background})`;

  return {
    '--form-bg': theme.background,
    '--form-fg': foreground,
    '--form-muted': mix(64),
    '--form-border': mix(14),
    '--form-border-strong': mix(26),
    '--form-hover': mix(5),
    '--form-accent': theme.accentColor,
    '--form-accent-fg': readableTextColor(theme.accentColor),
    '--form-accent-subtle': `color-mix(in srgb, ${theme.accentColor} 10%, ${theme.background})`,
    '--form-danger': isDark ? '#f87171' : '#dc2626',
    '--form-radius': RADIUS[theme.radius],
    // Focus rings inside the form use its accent.
    '--ring': theme.accentColor,
    fontFamily: FONT[theme.font],
  } as React.CSSProperties;
}
