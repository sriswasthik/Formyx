import { FORM_BACKGROUND_COLORS, type FormFont, type FormTheme } from '@formyx/shared';
import type * as React from 'react';
import { readableTextColor } from '@/lib/color';

const RADIUS: Record<FormTheme['radius'], string> = {
  sharp: '0px',
  rounded: '10px',
};

export const FORM_FONT_STACKS: Record<FormFont, string> = {
  inter: "'Inter Variable', 'Inter Fallback', ui-sans-serif, system-ui, sans-serif",
  serif: "'Source Serif 4 Variable', ui-serif, Georgia, Cambria, serif",
  rounded: "'Nunito Variable', ui-rounded, 'SF Pro Rounded', ui-sans-serif, system-ui, sans-serif",
};

/** Inter ships with the app; the others load on first use, so most forms never fetch them. */
const FONT_LOADERS: Partial<Record<FormFont, () => Promise<unknown>>> = {
  serif: () => import('@fontsource-variable/source-serif-4'),
  rounded: () => import('@fontsource-variable/nunito'),
};

const loaded = new Set<FormFont>();

/** Starts loading the font's files. Until they arrive the fallback in its stack shows. */
export function loadFormFont(font: FormFont): void {
  const load = FONT_LOADERS[font];
  if (!load || loaded.has(font)) return;
  loaded.add(font);
  load().catch(() => {
    // The fallback fonts in the stack keep the form readable; try again next time.
    loaded.delete(font);
  });
}

/**
 * CSS variables that every form component uses instead of the app's tokens. A form always
 * looks like its theme, not like the editor's light or dark mode, so what the editor shows
 * is what respondents get.
 */
export function formThemeVariables(theme: FormTheme): React.CSSProperties {
  const background = FORM_BACKGROUND_COLORS[theme.background];
  const isDark = theme.background === 'dark';
  const foreground = readableTextColor(background, '#18181b', '#fafafa');
  const mix = (percent: number) => `color-mix(in srgb, ${foreground} ${percent}%, ${background})`;

  return {
    '--form-bg': background,
    '--form-fg': foreground,
    '--form-muted': mix(64),
    '--form-border': mix(14),
    '--form-border-strong': mix(26),
    '--form-hover': mix(5),
    '--form-accent': theme.accentColor,
    '--form-accent-fg': readableTextColor(theme.accentColor),
    '--form-accent-subtle': `color-mix(in srgb, ${theme.accentColor} 10%, ${background})`,
    '--form-danger': isDark ? '#f87171' : '#dc2626',
    '--form-radius': RADIUS[theme.radius],
    // Focus rings inside the form use its accent.
    '--ring': theme.accentColor,
    fontFamily: FORM_FONT_STACKS[theme.font],
  } as React.CSSProperties;
}
