import {
  fontStack,
  LAYOUT_WIDTHS_PX,
  mixHex,
  RADIUS_MAX,
  SOFT_BUTTON_TINT,
  type FormTheme,
  type ThemeComponents,
} from '@formyx/shared';
import type * as React from 'react';

/** CSS custom properties, which React's style typing does not know. */
export type CssVariables = Record<`--${string}`, string>;

const SHADOWS: Record<ThemeComponents['shadow'], string> = {
  none: 'none',
  sm: '0 1px 2px rgb(0 0 0 / 0.05), 0 4px 12px -4px rgb(0 0 0 / 0.1)',
  md: '0 2px 4px rgb(0 0 0 / 0.04), 0 12px 32px -8px rgb(0 0 0 / 0.16)',
  lg: '0 4px 8px rgb(0 0 0 / 0.05), 0 24px 64px -12px rgb(0 0 0 / 0.24)',
};

const PILL = '9999px';

/** Containers round a little more than the controls inside them. */
function containerRadius(radius: number): string {
  return radius === 0 ? '0px' : `${Math.min(radius + 8, 32)}px`;
}

/**
 * What filled fields are filled with: the field colour, or a faint tint of the text where
 * the field colour is the page's own (as in plain themes), so they never disappear.
 */
function fieldFill({ colors }: FormTheme): string {
  return colors.inputBackground.toUpperCase() === colors.containerBackground.toUpperCase()
    ? mixHex(colors.text, colors.containerBackground, 6)
    : colors.inputBackground;
}

function inputVariables(theme: FormTheme): CssVariables {
  const { colors, components } = theme;
  const radius = `${components.radius}px`;
  const tint = mixHex(colors.text, colors.containerBackground, 5);
  // Hovering darkens a border towards the primary colour, or tints a fill with it.
  const borderHover = mixHex(colors.primary, colors.inputBorder, 55);
  const fillHover = (fill: string) => mixHex(colors.primary, fill, 6);
  const boxBorder = mixHex(colors.text, colors.containerBackground, 14);

  switch (components.inputStyle) {
    case 'filled':
      return {
        '--form-input-bg': fieldFill(theme),
        '--form-input-bg-hover': fillHover(fieldFill(theme)),
        '--form-input-border': 'transparent',
        '--form-input-border-hover': 'transparent',
        '--form-input-border-width': '1px',
        '--form-input-radius': radius,
        '--form-textarea-radius': radius,
        '--form-input-px': '0.875rem',
        '--form-box-bg': fieldFill(theme),
        '--form-box-border': boxBorder,
        '--form-box-radius': radius,
      };
    case 'underline':
      return {
        '--form-input-bg': 'transparent',
        '--form-input-bg-hover': 'transparent',
        '--form-input-border': colors.inputBorder,
        '--form-input-border-hover': borderHover,
        '--form-input-border-width': '0 0 1px 0',
        '--form-input-radius': '0px',
        '--form-textarea-radius': '0px',
        '--form-input-px': '0px',
        '--form-box-bg': 'transparent',
        '--form-box-border': colors.inputBorder,
        '--form-box-radius': radius,
      };
    case 'pill':
      return {
        '--form-input-bg': colors.inputBackground,
        '--form-input-bg-hover': colors.inputBackground,
        '--form-input-border': colors.inputBorder,
        '--form-input-border-hover': borderHover,
        '--form-input-border-width': '1px',
        '--form-input-radius': PILL,
        '--form-textarea-radius': '1.25rem',
        '--form-input-px': '1.125rem',
        '--form-box-bg': colors.inputBackground,
        '--form-box-border': colors.inputBorder,
        '--form-box-radius': '1.25rem',
      };
    case 'minimal':
      return {
        '--form-input-bg': tint,
        '--form-input-bg-hover': fillHover(tint),
        '--form-input-border': 'transparent',
        '--form-input-border-hover': 'transparent',
        '--form-input-border-width': '1px',
        '--form-input-radius': radius,
        '--form-textarea-radius': radius,
        '--form-input-px': '0.875rem',
        '--form-box-bg': tint,
        '--form-box-border': boxBorder,
        '--form-box-radius': radius,
      };
    case 'outlined':
      return {
        '--form-input-bg': colors.inputBackground,
        '--form-input-bg-hover': colors.inputBackground,
        '--form-input-border': colors.inputBorder,
        '--form-input-border-hover': borderHover,
        '--form-input-border-width': '1px',
        '--form-input-radius': radius,
        '--form-textarea-radius': radius,
        '--form-input-px': '0.875rem',
        '--form-box-bg': colors.inputBackground,
        '--form-box-border': colors.inputBorder,
        '--form-box-radius': radius,
      };
  }
}

/**
 * Choice rows, cards, pills and buttons, and rating buttons: boxes even when inputs are
 * underlined. Hovering moves the border or fill towards the primary colour.
 */
function choiceVariables(theme: FormTheme): CssVariables {
  const { colors, components } = theme;
  const filled = components.inputStyle === 'filled' || components.inputStyle === 'minimal';
  const background =
    components.inputStyle === 'minimal'
      ? mixHex(colors.text, colors.containerBackground, 5)
      : components.inputStyle === 'underline'
        ? 'transparent'
        : components.inputStyle === 'filled'
          ? fieldFill(theme)
          : colors.inputBackground;
  const pill = components.inputStyle === 'pill' || components.choiceStyle === 'pills';
  return {
    '--form-choice-bg': background,
    '--form-choice-bg-hover': mixHex(
      colors.primary,
      background === 'transparent' ? colors.containerBackground : background,
      6,
    ),
    '--form-choice-border': filled ? 'transparent' : colors.inputBorder,
    '--form-choice-border-hover': filled
      ? 'transparent'
      : mixHex(colors.primary, colors.inputBorder, 55),
    '--form-choice-radius': pill
      ? PILL
      : components.choiceStyle === 'cards'
        ? `${Math.min(components.radius + 4, RADIUS_MAX)}px`
        : `${components.radius}px`,
  };
}

function buttonVariables(theme: FormTheme): CssVariables {
  const { colors, components } = theme;
  const radius = components.buttonStyle === 'pill' ? PILL : `${components.radius}px`;
  switch (components.buttonStyle) {
    case 'outline':
      return {
        '--form-button-bg': 'transparent',
        '--form-button-fg': colors.primary,
        '--form-button-border': colors.primary,
        '--form-button-radius': radius,
      };
    case 'soft':
      return {
        '--form-button-bg': mixHex(colors.primary, colors.containerBackground, SOFT_BUTTON_TINT),
        '--form-button-fg': colors.primary,
        '--form-button-border': 'transparent',
        '--form-button-radius': radius,
      };
    case 'solid':
    case 'pill':
      return {
        '--form-button-bg': colors.primary,
        '--form-button-fg': colors.buttonText,
        '--form-button-border': 'transparent',
        '--form-button-radius': radius,
      };
  }
}

function containerVariables(theme: FormTheme): CssVariables {
  const { colors, components } = theme;
  const style = theme.layout.mode === 'split' ? 'none' : components.containerStyle;
  const radius =
    components.containerRadius === undefined
      ? containerRadius(components.radius)
      : `${components.containerRadius}px`;
  const outline = mixHex(colors.text, colors.containerBackground, 12);

  switch (style) {
    case 'card':
      return {
        '--form-container-bg': colors.containerBackground,
        '--form-container-border': outline,
        '--form-container-radius': radius,
        '--form-container-shadow': SHADOWS[components.shadow],
      };
    case 'floating':
      return {
        '--form-container-bg': colors.containerBackground,
        '--form-container-border': 'transparent',
        '--form-container-radius': radius,
        // Floating means a shadow: at least a medium one.
        '--form-container-shadow':
          SHADOWS[
            components.shadow === 'none' || components.shadow === 'sm' ? 'md' : components.shadow
          ],
      };
    case 'bordered':
      return {
        '--form-container-bg': 'transparent',
        '--form-container-border': colors.inputBorder,
        '--form-container-radius': radius,
        '--form-container-shadow': SHADOWS[components.shadow],
      };
    case 'none':
      return {
        '--form-container-bg': 'transparent',
        '--form-container-border': 'transparent',
        '--form-container-radius': '0px',
        '--form-container-shadow': 'none',
      };
  }
}

/**
 * The CSS variables every respondent-facing form component uses instead of the app's tokens.
 * A form always looks like its theme, never like the builder's light or dark mode, so what
 * the editor shows is what respondents get.
 */
/**
 * `scriptFont` is the families for scripts the theme's fonts lack (Telugu, Devanagari), tried
 * after them, before the generic families, for each character they cannot draw.
 */
export function themeVariables(theme: FormTheme, scriptFont?: string): CssVariables {
  const { colors, typography, components } = theme;
  // What text, inputs and choices sit on: the container, or the background without one.
  const surface = colors.containerBackground;
  const mix = (percent: number) => mixHex(colors.text, surface, percent);

  return {
    '--form-bg': surface,
    '--form-fg': colors.text,
    '--form-muted': colors.mutedText,
    '--form-border': mix(14),
    '--form-border-strong': colors.inputBorder,
    '--form-hover': mix(5),
    '--form-accent': colors.primary,
    '--form-accent-fg': colors.buttonText,
    '--form-accent-subtle': mixHex(colors.primary, surface, 10),
    '--form-danger': colors.error,
    '--form-radius': `${components.radius}px`,
    // Focus rings inside the form use its primary colour.
    '--ring': colors.primary,

    '--form-text': `${typography.baseSize}px`,
    '--form-body-font': fontStack(typography.bodyFont, scriptFont),
    '--form-heading-font': fontStack(typography.headingFont, scriptFont),
    '--form-heading-weight': String(typography.headingWeight),
    '--form-letter-spacing': `${typography.letterSpacing}em`,
    // Headings stay a touch tighter than body text, as in the builder's type scale.
    '--form-heading-tracking': `${Number((typography.letterSpacing - 0.011).toFixed(3))}em`,
    '--form-text-align': typography.textAlign,
    '--form-width': `${LAYOUT_WIDTHS_PX[theme.layout.width]}px`,

    ...inputVariables(theme),
    ...choiceVariables(theme),
    ...buttonVariables(theme),
    ...containerVariables(theme),
  };
}

/** `themeVariables` plus the root's own font settings, ready for a `style` prop. */
export function themeStyle(theme: FormTheme, scriptFont?: string): React.CSSProperties {
  return {
    ...themeVariables(theme, scriptFont),
    fontFamily: 'var(--form-body-font)',
    fontSize: 'var(--form-text)',
    letterSpacing: 'var(--form-letter-spacing)',
    color: 'var(--form-fg)',
  };
}
