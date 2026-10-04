import { describe, expect, it } from 'vitest';
import { createDefaultTheme, migrateTheme } from './migrate.js';
import { primaryHasEnoughContrast, textSurfaces, themeReadabilityIssues } from './readability.js';
import type { FormTheme } from './schema.js';
import { ACCENT_PRESETS, SURFACES, withPrimaryColor, withSurface } from './surfaces.js';
import { THEME_V1_BACKGROUNDS } from './theme-v1.js';

const base = createDefaultTheme();
const parts = (theme: FormTheme) => themeReadabilityIssues(theme).map((issue) => issue.part);

describe('themeReadabilityIssues', () => {
  it('finds nothing wrong with the default theme', () => {
    expect(themeReadabilityIssues(base)).toEqual([]);
  });

  it.each(
    THEME_V1_BACKGROUNDS.flatMap((background) =>
      ACCENT_PRESETS.map(({ label, color }) => ({ background, label, color })),
    ),
  )('passes for every v1 accent preset on $background ($label)', ({ background, color }) => {
    const theme = migrateTheme({
      accentColor: color,
      font: 'inter',
      radius: 'rounded',
      background,
    });
    expect(themeReadabilityIssues(theme)).toEqual([]);
  });

  it('flags text that fades into the background', () => {
    const theme: FormTheme = { ...base, colors: { ...base.colors, text: '#EEEEEE' } };
    expect(parts(theme)).toEqual(['text', 'inputText']);
  });

  it('flags a primary colour that does not stand out', () => {
    const theme = withPrimaryColor(base, '#F0E68C');
    expect(primaryHasEnoughContrast(theme)).toBe(false);
    expect(
      primaryHasEnoughContrast(withPrimaryColor(withSurface(base, '#18181B'), '#1E2A3A')),
    ).toBe(false);
    expect(primaryHasEnoughContrast(base)).toBe(true);
  });

  it('checks button labels for the button style in use', () => {
    const pale = { ...base, colors: { ...base.colors, primary: '#8AB0EA', buttonText: '#FFFFFF' } };
    // White on light blue is too faint for a solid button...
    expect(parts(pale)).toContain('button');
    // ...and so is light blue text on white for an outline one.
    const outline: FormTheme = {
      ...pale,
      colors: { ...pale.colors, buttonText: '#18181B' },
      components: { ...pale.components, buttonStyle: 'outline' },
    };
    expect(parts(outline)).toContain('button');
  });

  it('reads text against every background colour, through the overlay', () => {
    const gradient: FormTheme = {
      ...base,
      background: {
        layers: [
          {
            id: 'g',
            type: 'linear',
            angle: 180,
            stops: [
              { color: '#FFFFFF', position: 0 },
              { color: '#18181B', position: 100 },
            ],
            opacity: 1,
            blendMode: 'normal',
          },
        ],
      },
    };
    expect(parts(gradient)).toContain('text');

    // A strong white overlay brings the dark end up far enough.
    const washed: FormTheme = { ...gradient, overlay: { color: '#FFFFFF', opacity: 0.9, blur: 8 } };
    expect(textSurfaces(washed)).toEqual(['#FFFFFF', '#E8E8E8']);
    expect(parts(washed)).not.toContain('text');
  });

  it('uses the container colour when the form sits in a card', () => {
    const dark = withSurface(base, SURFACES[2].color);
    const carded: FormTheme = {
      ...dark,
      colors: { ...base.colors },
      components: { ...dark.components, containerStyle: 'card' },
    };
    expect(textSurfaces(carded)).toEqual(['#FFFFFF']);
    expect(themeReadabilityIssues(carded)).toEqual([]);
  });
});
