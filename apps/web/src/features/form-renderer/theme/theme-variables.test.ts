import {
  ACCENT_PRESETS,
  createDefaultTheme,
  migrateTheme,
  mixHex,
  THEME_PRESETS,
  THEME_V1_BACKGROUNDS,
  THEME_V1_FONTS,
  THEME_V1_RADII,
  type FormTheme,
  type ThemeComponents,
} from '@formyx/shared';
import { describe, expect, it } from 'vitest';
import { themeStyle, themeVariables } from './theme-variables';

const base = createDefaultTheme();

function withComponents(components: Partial<ThemeComponents>): FormTheme {
  return { ...base, components: { ...base.components, ...components } };
}

describe('themeVariables', () => {
  it('describes the default theme', () => {
    expect(themeVariables(base)).toMatchObject({
      '--form-bg': '#FFFFFF',
      '--form-fg': '#18181B',
      '--form-muted': '#6B6B6D',
      '--form-border-strong': '#C3C3C4',
      '--form-accent': '#4370BD',
      '--form-accent-fg': '#FFFFFF',
      '--form-danger': '#DC2626',
      '--form-radius': '10px',
      '--ring': '#4370BD',
      '--form-text': '16px',
      '--form-body-font':
        "'Inter Variable', 'Inter Fallback', ui-sans-serif, system-ui, sans-serif",
      '--form-heading-weight': '600',
      '--form-heading-tracking': '-0.011em',
      '--form-width': '640px',
    });
  });

  /*
   * Sprint 7's renderer, for comparison: background and accent as chosen, text in
   * near-black or near-white, and the rest mixed from those two.
   */
  const V1_BACKGROUNDS = { white: '#FFFFFF', off_white: '#F7F6F3', dark: '#18181B' } as const;
  const V1_FONT_STACKS = {
    inter: "'Inter Variable', 'Inter Fallback', ui-sans-serif, system-ui, sans-serif",
    serif:
      "'Source Serif 4 Variable', 'Source Serif 4 Fallback', ui-serif, Georgia, Cambria, serif",
    rounded:
      "'Nunito Variable', 'Nunito Fallback', ui-rounded, 'SF Pro Rounded', ui-sans-serif, system-ui, sans-serif",
  } as const;

  it.each(
    THEME_V1_BACKGROUNDS.flatMap((background) =>
      THEME_V1_FONTS.flatMap((font) =>
        THEME_V1_RADII.map((radius) => ({ background, font, radius })),
      ),
    ),
  )('draws a v1 theme as before: $background, $font, $radius', ({ background, font, radius }) => {
    const accent = ACCENT_PRESETS[4].color;
    const variables = themeVariables(
      migrateTheme({ accentColor: accent, font, radius, background }),
    );
    const bg = V1_BACKGROUNDS[background];
    const fg = background === 'dark' ? '#FAFAFA' : '#18181B';

    expect(variables).toMatchObject({
      '--form-bg': bg,
      '--form-fg': fg,
      '--form-muted': mixHex(fg, bg, 64),
      '--form-border': mixHex(fg, bg, 14),
      '--form-border-strong': mixHex(fg, bg, 26),
      '--form-hover': mixHex(fg, bg, 5),
      '--form-accent': accent,
      '--form-accent-subtle': mixHex(accent, bg, 10),
      '--form-radius': radius === 'sharp' ? '0px' : '10px',
      '--form-body-font': V1_FONT_STACKS[font],
      '--form-heading-font': V1_FONT_STACKS[font],
      // Outlined inputs and solid buttons on the form's own background, as v1 drew them.
      '--form-input-bg': bg,
      '--form-input-border': mixHex(fg, bg, 26),
      '--form-button-bg': accent,
      '--form-container-bg': 'transparent',
    });
  });

  it.each([
    ['outlined', { '--form-input-border-width': '1px', '--form-input-radius': '10px' }],
    [
      'filled',
      {
        '--form-input-border': 'transparent',
        // On a plain page the field colour is the page's own, so fields take a faint tint.
        '--form-input-bg': mixHex('#18181B', '#FFFFFF', 6),
        '--form-choice-bg': mixHex('#18181B', '#FFFFFF', 6),
      },
    ],
    [
      'underline',
      {
        '--form-input-border-width': '0 0 1px 0',
        '--form-input-radius': '0px',
        '--form-input-px': '0px',
        '--form-input-bg': 'transparent',
      },
    ],
    ['pill', { '--form-input-radius': '9999px', '--form-choice-radius': '9999px' }],
    [
      'minimal',
      { '--form-input-border': 'transparent', '--form-input-bg': mixHex('#18181B', '#FFFFFF', 5) },
    ],
  ] as const)('styles %s inputs', (inputStyle, expected) => {
    expect(themeVariables(withComponents({ inputStyle }))).toMatchObject(expected);
  });

  it.each([
    ['solid', { '--form-button-bg': '#4370BD', '--form-button-fg': '#FFFFFF' }],
    [
      'outline',
      {
        '--form-button-bg': 'transparent',
        '--form-button-fg': '#4370BD',
        '--form-button-border': '#4370BD',
      },
    ],
    [
      'soft',
      { '--form-button-bg': mixHex('#4370BD', '#FFFFFF', 14), '--form-button-fg': '#4370BD' },
    ],
    ['pill', { '--form-button-radius': '9999px', '--form-button-bg': '#4370BD' }],
  ] as const)('styles %s buttons', (buttonStyle, expected) => {
    expect(themeVariables(withComponents({ buttonStyle }))).toMatchObject(expected);
  });

  it('keeps a filled field colour that differs from the page', () => {
    const paper = THEME_PRESETS.find((preset) => preset.id === 'paper')?.theme;
    if (!paper) throw new Error('No Paper preset');
    expect(themeVariables(paper)['--form-input-bg']).toBe(paper.colors.inputBackground);
  });

  it('gives containers their fill, border, radius and shadow', () => {
    const card = themeVariables(withComponents({ containerStyle: 'card', shadow: 'sm' }));
    expect(card['--form-container-bg']).toBe('#FFFFFF');
    expect(card['--form-container-border']).toBe(mixHex('#18181B', '#FFFFFF', 12));
    expect(card['--form-container-radius']).toBe('18px');
    expect(card['--form-container-shadow']).toMatch(/rgb/);

    const floating = themeVariables(withComponents({ containerStyle: 'floating', shadow: 'none' }));
    expect(floating['--form-container-border']).toBe('transparent');
    // Floating always means a shadow.
    expect(floating['--form-container-shadow']).not.toBe('none');

    const bordered = themeVariables(withComponents({ containerStyle: 'bordered', radius: 0 }));
    expect(bordered).toMatchObject({
      '--form-container-bg': 'transparent',
      '--form-container-radius': '0px',
    });
  });

  it('moves hover borders and fills towards the primary colour', () => {
    const outlined = themeVariables(withComponents({ inputStyle: 'outlined' }));
    expect(outlined['--form-input-border-hover']).toBe(mixHex('#4370BD', '#C3C3C4', 55));
    expect(outlined['--form-choice-border-hover']).toBe(mixHex('#4370BD', '#C3C3C4', 55));
    const filled = themeVariables(withComponents({ inputStyle: 'filled' }));
    expect(filled['--form-input-bg-hover']).toBe(
      mixHex('#4370BD', mixHex('#18181B', '#FFFFFF', 6), 6),
    );
    expect(filled['--form-box-border']).not.toBe('transparent');
  });

  it.each([
    ['list', '10px'],
    ['cards', '14px'],
    ['pills', '9999px'],
    ['buttons', '10px'],
  ] as const)('rounds %s choices', (choiceStyle, radius) => {
    expect(themeVariables(withComponents({ choiceStyle }))['--form-choice-radius']).toBe(radius);
  });

  it('uses the container radius the theme sets, if any', () => {
    const card = withComponents({ containerStyle: 'card', containerRadius: 32 });
    expect(themeVariables(card)['--form-container-radius']).toBe('32px');
  });

  it('gives the split layout no container: its form side is the panel', () => {
    const split = {
      ...withComponents({ containerStyle: 'card' }),
      layout: { ...base.layout, mode: 'split' as const },
    };
    expect(themeVariables(split)['--form-container-bg']).toBe('transparent');
  });

  it('scales type from the base size and keeps headings tighter', () => {
    const theme: FormTheme = {
      ...base,
      typography: { ...base.typography, baseSize: 18, letterSpacing: 0.02, headingWeight: 700 },
      layout: { ...base.layout, width: 'wide' },
    };
    expect(themeVariables(theme)).toMatchObject({
      '--form-text': '18px',
      '--form-letter-spacing': '0.02em',
      '--form-heading-tracking': '0.009em',
      '--form-heading-weight': '700',
      '--form-width': '760px',
    });
  });

  it.each(THEME_PRESETS)('sets every variable for the $name preset', ({ theme }) => {
    for (const value of Object.values(themeVariables(theme))) {
      expect(value).not.toMatch(/undefined|NaN/);
    }
  });
});

describe('themeStyle', () => {
  it('applies the body font, size and colour to the root', () => {
    expect(themeStyle(base)).toMatchObject({
      fontFamily: 'var(--form-body-font)',
      fontSize: 'var(--form-text)',
      color: 'var(--form-fg)',
    });
  });
});
