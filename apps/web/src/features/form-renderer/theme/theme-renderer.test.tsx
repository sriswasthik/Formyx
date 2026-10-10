import {
  createDefaultTheme,
  FONT_IDS,
  THEME_PRESETS,
  type BackgroundLayer,
  type FontId,
  type FormTheme,
} from '@formyx/shared';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { FONT_LOADERS } from './font-loaders';
import { loadFont } from './fonts';
import { ThemeRenderer, type ThemeVariant } from './theme-renderer';

const base = createDefaultTheme();
const common = { opacity: 1, blendMode: 'normal' } as const;
const logoUrl = 'https://res.cloudinary.com/demo/logo.png';
const coverImage = {
  url: 'https://res.cloudinary.com/demo/cover.jpg',
  focalPoint: { x: 50, y: 20 },
};

function preset(id: string): FormTheme {
  const found = THEME_PRESETS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No preset ${id}`);
  return found.theme;
}

function renderTheme(theme: FormTheme, variant: ThemeVariant = 'page') {
  return render(
    <ThemeRenderer theme={theme} variant={variant} footer={<footer>Made with Formyx</footer>}>
      <h1>Feedback</h1>
    </ThemeRenderer>,
  );
}

const root = (container: HTMLElement) => {
  const element = container.querySelector<HTMLElement>('[data-form-theme]');
  if (!element) throw new Error('No ThemeRenderer root');
  return element;
};

const layerTypes = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('[data-layer]')].map((layer) => layer.dataset.layer);

describe('ThemeRenderer', () => {
  it('sets the theme’s variables on its root and draws the form inside', () => {
    const { container } = renderTheme(base);
    const style = root(container).style;
    expect(style.getPropertyValue('--form-accent')).toBe('#4370BD');
    expect(style.getPropertyValue('--form-bg')).toBe('#FFFFFF');
    expect(style.fontFamily).toBe('var(--form-body-font)');
    expect(screen.getByRole('heading', { name: 'Feedback' })).toBeInTheDocument();
    expect(screen.getByText('Made with Formyx')).toBeInTheDocument();
  });

  it('draws background layers bottom first, hidden from assistive technology', () => {
    const { container } = renderTheme(preset('studio'));
    expect(layerTypes(container)).toEqual(['solid', 'texture', 'shapes']);
    const background = container.querySelector('[data-theme-background]');
    expect(background).toHaveAttribute('aria-hidden', 'true');
    expect(background).toHaveClass('pointer-events-none');
  });

  it('draws each shape from the registry, where the theme puts it', () => {
    const { container } = renderTheme(preset('studio'));
    const shapes = [...container.querySelectorAll<SVGElement>('[data-shape]')];
    expect(shapes.map((shape) => shape.dataset.shape)).toEqual(['blob', 'circle', 'sparkle']);
    expect(shapes[0]?.style.left).toBe('6%');
    expect(shapes[0]?.style.width).toBe('30%');
    expect(shapes[0]?.style.transform).toBe('translate(-50%, -50%) rotate(-12deg)');
    expect(shapes[0]?.querySelector('path')).toHaveAttribute('fill', 'currentColor');
  });

  it('washes the background with the overlay, blurring what is behind it', () => {
    const { container } = renderTheme({
      ...base,
      overlay: { color: '#000000', opacity: 0.4, blur: 8 },
    });
    const overlay = container.querySelector<HTMLElement>('[data-overlay]');
    expect(overlay?.style.backgroundColor).toBe('rgba(0, 0, 0, 0.4)');
    expect(overlay?.style.backdropFilter).toBe('blur(8px)');

    const { container: plain } = renderTheme(base);
    expect(plain.querySelector('[data-overlay]')).toBeNull();
  });

  it('animates only motion-safe, and only when the theme asks', () => {
    const drift = (theme: FormTheme) =>
      [...renderTheme(theme).container.querySelectorAll('[data-layer]')].map((layer) =>
        layer.className.includes('motion-safe:animate-form-drift'),
      );
    // Sea glass drifts its mesh, never its plain base colour.
    expect(drift(preset('sea-glass'))).toEqual([false, true]);
    expect(
      drift({ ...preset('sea-glass'), motion: { ...base.motion, animatedBackground: false } }),
    ).toEqual([false, false]);
  });

  it('keeps a page’s background in view while it scrolls; embeds and frames just fill', () => {
    const sticky = (variant: ThemeVariant) =>
      renderTheme(base, variant).container.querySelector('[data-theme-background] > div');
    expect(sticky('page')).toHaveClass('sticky', 'h-dvh');
    expect(sticky('frame')).toHaveClass('h-full');
    expect(sticky('embed')).not.toHaveClass('sticky');
  });

  it.each([
    ['none', false],
    ['card', true],
    ['floating', true],
    ['bordered', true],
  ] as const)('puts the form in a %s container', (containerStyle, boxed) => {
    const { container } = renderTheme({
      ...base,
      components: { ...base.components, containerStyle },
    });
    const box = container.querySelector('[data-form-container]');
    if (boxed) expect(box).toHaveAttribute('data-form-container', containerStyle);
    else expect(box).toBeNull();
  });

  it('splits the page into a background side and a form side', () => {
    const { container } = renderTheme(preset('editorial'));
    expect(root(container)).toHaveAttribute('data-layout', 'split');
    const media = container.querySelector('[data-split-media]');
    expect(media?.querySelector('[data-theme-background]')).not.toBeNull();
    expect(media?.contains(screen.getByRole('heading', { name: 'Feedback' }))).toBe(false);
  });

  it('centres the conversational layout over the background, with the cover inside', () => {
    const { container } = renderTheme({
      ...base,
      layout: { ...base.layout, mode: 'conversational', coverImage },
    });
    expect(root(container)).toHaveAttribute('data-layout', 'conversational');
    expect(container.querySelector('[data-form-cover]')?.parentElement).not.toBe(root(container));
  });

  it.each(['top', 'bottom'] as const)('puts the progress bar at the %s edge', (position) => {
    const theme: FormTheme = {
      ...base,
      layout: { ...base.layout, progress: { style: 'line', position } },
    };
    const { container } = render(
      <ThemeRenderer theme={theme} variant="page" progress={<div data-testid="progress" />}>
        <h1>Feedback</h1>
      </ThemeRenderer>,
    );
    const children = [...root(container).children];
    const at = children.indexOf(screen.getByTestId('progress'));
    // After the background layers when on top; the very last thing when at the bottom.
    expect(at).toBe(position === 'top' ? 1 : children.length - 1);
  });

  it('shows the cover across a classic page, and inside a card', () => {
    const classic = renderTheme({ ...base, layout: { ...base.layout, coverImage } }).container;
    const cover = classic.querySelector<HTMLImageElement>('[data-form-cover]');
    expect(cover).toHaveAttribute('alt', '');
    expect(cover?.style.objectPosition).toBe('50% 20%');
    expect(cover?.parentElement).toBe(root(classic));

    const card = renderTheme({
      ...base,
      components: { ...base.components, containerStyle: 'card' },
      layout: { ...base.layout, mode: 'card', coverImage },
    }).container;
    expect(card.querySelector('[data-form-container] [data-form-cover]')).not.toBeNull();
  });

  it('puts the logo in a top bar when the theme says so', () => {
    const topLeft = renderTheme({
      ...base,
      layout: { ...base.layout, logoPosition: 'top_left' },
      branding: { ...base.branding, logoUrl },
    }).container;
    expect(topLeft.querySelector('[data-form-logo]')).toHaveClass('object-left');

    const centred = renderTheme({
      ...base,
      layout: { ...base.layout, logoPosition: 'top_center' },
      branding: { ...base.branding, logoUrl },
    }).container;
    expect(centred.querySelector('[data-form-logo]')).toHaveClass('mx-auto');

    // Above the title is the form's own business (FormView draws it there).
    const header = renderTheme({ ...base, branding: { ...base.branding, logoUrl } }).container;
    expect(header.querySelector('[data-form-logo]')).toBeNull();
  });

  it('loads the fonts it uses, and no others', async () => {
    const original = { ...FONT_LOADERS };
    const fake = (font: FontId) => {
      const loader = vi.fn(() => Promise.resolve({}));
      FONT_LOADERS[font] = loader;
      return loader;
    };
    // Fonts no other test here uses: each font is only ever requested once.
    const loaders = {
      'playfair-display': fake('playfair-display'),
      'space-grotesk': fake('space-grotesk'),
      nunito: fake('nunito'),
    };
    onTestFinished(() => {
      Object.assign(FONT_LOADERS, original);
    });

    renderTheme({
      ...base,
      typography: {
        ...base.typography,
        headingFont: 'playfair-display',
        bodyFont: 'space-grotesk',
      },
    });
    await waitFor(() => {
      expect(loaders['playfair-display']).toHaveBeenCalledTimes(1);
      expect(loaders['space-grotesk']).toHaveBeenCalledTimes(1);
    });
    expect(loaders.nunito).not.toHaveBeenCalled();

    // However many forms use a font, it loads once.
    renderTheme({ ...base, typography: { ...base.typography, headingFont: 'playfair-display' } });
    await loadFont('playfair-display');
    expect(loaders['playfair-display']).toHaveBeenCalledTimes(1);
  });
});

describe('FONT_LOADERS', () => {
  it('can load every font in the registry; Inter ships with the app', () => {
    expect(Object.keys(FONT_LOADERS).sort()).toEqual([...FONT_IDS].sort());
    expect(FONT_LOADERS.inter).toBeNull();
    for (const id of FONT_IDS.filter((font) => font !== 'inter')) {
      expect(FONT_LOADERS[id]).toBeTypeOf('function');
    }
  });
});

describe('every layer kind', () => {
  it('renders without trouble', () => {
    const layers: BackgroundLayer[] = [
      { ...common, id: 'a', type: 'solid', color: '#FFFFFF' },
      {
        ...common,
        id: 'b',
        type: 'linear',
        angle: 90,
        stops: [
          { color: '#FFFFFF', position: 0 },
          { color: '#000000', position: 100 },
        ],
      },
      {
        ...common,
        id: 'c',
        type: 'radial',
        shape: 'circle',
        center: { x: 50, y: 50 },
        stops: [
          { color: '#FFFFFF', position: 0 },
          { color: '#000000', position: 100 },
        ],
      },
      {
        ...common,
        id: 'd',
        type: 'mesh',
        points: Array.from({ length: 4 }, (_, i) => ({
          x: i * 25,
          y: 50,
          color: '#BFE0D6',
          spread: 40,
        })),
      },
      { ...common, id: 'e', type: 'texture', assetId: 'dots', scale: 1 },
      {
        ...common,
        id: 'f',
        type: 'shapes',
        items: [
          {
            id: 's',
            type: 'squiggle',
            x: 50,
            y: 50,
            size: 20,
            rotation: 0,
            color: '#000000',
            opacity: 1,
            blur: 2,
          },
        ],
      },
      {
        ...common,
        id: 'g',
        type: 'image',
        url: 'https://res.cloudinary.com/demo/bg.jpg',
        focalPoint: { x: 50, y: 50 },
        fit: 'contain',
      },
    ];
    const { container } = renderTheme({ ...base, background: { layers } });
    expect(layerTypes(container)).toEqual([
      'solid',
      'linear',
      'radial',
      'mesh',
      'texture',
      'shapes',
      'image',
    ]);
    // Line shapes are drawn as strokes, blurred when asked.
    const squiggle = container.querySelector<SVGElement>('[data-shape="squiggle"]');
    expect(squiggle?.querySelector('path')).toHaveAttribute('stroke', 'currentColor');
    expect(squiggle?.style.filter).toBe('blur(2px)');
  });
});

describe('ThemeRenderer background layers', () => {
  const circle = {
    id: 's',
    type: 'circle',
    x: 20,
    y: 30,
    size: 10,
    rotation: 0,
    color: '#000000',
    opacity: 1,
    blur: 0,
  } as const;

  const cases: [string, BackgroundLayer, (layer: HTMLElement) => void][] = [
    [
      'solid',
      { ...common, id: 'solid', type: 'solid', color: '#F7F6F3' },
      (layer) => {
        expect(layer.style.backgroundColor).toBe('rgb(247, 246, 243)');
      },
    ],
    [
      'linear',
      {
        ...common,
        id: 'linear',
        type: 'linear',
        angle: 45,
        stops: [
          { color: '#FFFFFF', position: 0 },
          { color: '#000000', position: 100 },
        ],
      },
      (layer) => {
        expect(layer.style.backgroundImage).toContain('linear-gradient(45deg');
      },
    ],
    [
      'radial',
      {
        ...common,
        id: 'radial',
        type: 'radial',
        shape: 'ellipse',
        center: { x: 30, y: 10 },
        stops: [
          { color: '#FFFFFF', position: 0 },
          { color: '#000000', position: 100 },
        ],
      },
      (layer) => {
        // jsdom drops `ellipse`, the default shape.
        expect(layer.style.backgroundImage).toContain('radial-gradient(at 30% 10%');
      },
    ],
    [
      'mesh',
      {
        ...common,
        id: 'mesh',
        type: 'mesh',
        points: Array.from({ length: 5 }, (_, i) => ({
          x: i * 20,
          y: 40,
          color: '#BFE0D6',
          spread: 40,
        })),
      },
      (layer) => {
        expect(layer.style.backgroundImage.match(/radial-gradient/g)).toHaveLength(5);
      },
    ],
    [
      'pattern texture',
      { ...common, id: 'grid', type: 'texture', assetId: 'grid', scale: 2, density: 0.8 },
      (layer) => {
        expect(layer.style.getPropertyValue('mask-image')).toMatch(/^url\("data:image\/svg/);
        expect(layer.style.getPropertyValue('mask-size')).toBe('64px');
      },
    ],
    [
      'photo texture',
      { ...common, id: 'linen', type: 'texture', assetId: 'linen', scale: 1 },
      (layer) => {
        expect(layer.style.getPropertyValue('mask-image')).toBe('url("/textures/linen.webp")');
      },
    ],
    [
      'shapes',
      { ...common, id: 'shapes', type: 'shapes', items: [circle] },
      (layer) => {
        expect(layer.querySelectorAll('[data-shape="circle"]')).toHaveLength(1);
      },
    ],
    [
      'image',
      {
        ...common,
        id: 'image',
        type: 'image',
        url: 'https://res.cloudinary.com/demo/bg.jpg',
        focalPoint: { x: 20, y: 80 },
        fit: 'cover',
      },
      (layer) => {
        expect(layer.style.backgroundImage).toBe('url("https://res.cloudinary.com/demo/bg.jpg")');
        expect(layer.style.backgroundPosition).toBe('20% 80%');
      },
    ],
  ];

  it.each(cases)('draws a %s layer', (_name, layer, check) => {
    const { container } = renderTheme({
      ...base,
      background: { layers: [{ ...common, id: 'base', type: 'solid', color: '#FFFFFF' }, layer] },
    });
    const drawn = container.querySelectorAll<HTMLElement>('[data-layer]')[1];
    if (!drawn) throw new Error('Layer not drawn');
    expect(drawn.dataset.layer).toBe(layer.type);
    check(drawn);
  });

  it('leaves hidden layers out', () => {
    const { container } = renderTheme({
      ...base,
      background: {
        layers: [
          { ...common, id: 'base', type: 'solid', color: '#FFFFFF' },
          { ...common, id: 'off', type: 'solid', color: '#000000', hidden: true },
        ],
      },
    });
    expect(layerTypes(container)).toEqual(['solid']);
  });

  it('hides shapes on narrow forms when asked', () => {
    const shapes = (hideOnMobile: boolean): FormTheme => ({
      ...base,
      background: {
        layers: [{ ...common, id: 'shapes', type: 'shapes', hideOnMobile, items: [circle] }],
      },
    });
    const hidden = renderTheme(shapes(true)).container.querySelector('[data-layer="shapes"]');
    expect(hidden).toHaveClass('@max-xl:hidden');
    const shown = renderTheme(shapes(false)).container.querySelector('[data-layer="shapes"]');
    expect(shown).not.toHaveClass('@max-xl:hidden');
  });

  it('draws seeded blobs the same way every time, and differently per seed', () => {
    const blob = (seed: number): FormTheme => ({
      ...base,
      background: {
        layers: [
          { ...common, id: 'shapes', type: 'shapes', items: [{ ...circle, type: 'blob', seed }] },
        ],
      },
    });
    const path = (seed: number) =>
      renderTheme(blob(seed))
        .container.querySelector('[data-shape="blob"] path')
        ?.getAttribute('d');
    expect(path(5)).toBe(path(5));
    expect(path(5)).not.toBe(path(6));
  });

  it.each(THEME_PRESETS)('draws the $name preset', (found) => {
    const { container } = renderTheme(found.theme);
    expect(layerTypes(container)).toEqual(
      (found.theme.background.layers as readonly BackgroundLayer[])
        .filter((layer) => !layer.hidden)
        .map((layer) => layer.type),
    );
  });
});
