import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from './logo';
import {
  faviconSvg,
  LOGO_SHAPES,
  LOGO_SHAPES_SMALL,
  logoSvg,
  MASKABLE_SCALE,
} from './logo-geometry';

function rects(container: HTMLElement) {
  return [...container.querySelectorAll('g rect')].map((rect) => ({
    x: Number(rect.getAttribute('x')),
    y: Number(rect.getAttribute('y')),
    width: Number(rect.getAttribute('width')),
    height: Number(rect.getAttribute('height')),
    rx: Number(rect.getAttribute('rx')),
  }));
}

describe('Logo', () => {
  it('is one image named Formyx, with the wordmark beside the icon', () => {
    const { container } = render(<Logo />);
    const logo = screen.getByRole('img', { name: 'Formyx' });
    expect(logo).toHaveTextContent('Formyx');
    // The icon's square, then its three shapes.
    expect(container.querySelector('svg > rect')).toHaveClass('fill-foreground');
    expect(container.querySelector('svg g')).toHaveClass('fill-background');
  });

  it('scales the wordmark and its gap with the icon', () => {
    render(<Logo size={48} />);
    const logo = screen.getByRole('img', { name: 'Formyx' });
    expect(logo.style.gap).toBe('12.8px');
    expect(screen.getByText('Formyx').style.fontSize).toBe('32px');
    expect(logo.querySelector('svg')).toHaveAttribute('width', '48');
  });

  it('draws the mark alone in the current colour', () => {
    const { container } = render(<Logo variant="mark" size={40} />);
    expect(screen.getByRole('img', { name: 'Formyx' })).not.toHaveTextContent('Formyx');
    expect(container.querySelector('svg > rect')).toBeNull();
    expect(container.querySelector('svg g')).toHaveClass('fill-current');
    expect(rects(container)).toEqual(LOGO_SHAPES);
  });

  it('draws the icon as a square holding the mark', () => {
    const { container } = render(<Logo variant="icon" size={48} />);
    expect(screen.getByRole('img', { name: 'Formyx' })).toBeInTheDocument();
    expect(container.querySelector('svg > rect')).toHaveAttribute('rx', '8');
    expect(rects(container)).toHaveLength(3);
  });

  it('snaps its shapes to whole pixels at small sizes', () => {
    const { container } = render(<Logo variant="icon" size={16} />);
    expect(rects(container)).toEqual(LOGO_SHAPES_SMALL);
    for (const shape of LOGO_SHAPES_SMALL) {
      for (const edge of [shape.x, shape.y, shape.x + shape.width, shape.y + shape.height]) {
        // 16px is half the grid: every edge lands on a pixel.
        expect(Number.isInteger(edge / 2)).toBe(true);
      }
    }
  });

  it('can be decorative, beside text or inside a named link', () => {
    const { container } = render(<Logo decorative />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('logo files', () => {
  it('public/favicon.svg is the one built from the shapes', () => {
    const file = readFileSync(join(import.meta.dirname, '../../../public/favicon.svg'), 'utf8');
    expect(file).toBe(faviconSvg());
  });

  it('the favicon inverts in a dark browser theme', () => {
    expect(faviconSvg()).toMatch(/@media \(prefers-color-scheme: dark\)/);
  });

  it('a maskable icon keeps the mark well inside the safe zone', () => {
    const svg = logoSvg({
      shapes: LOGO_SHAPES,
      size: 512,
      fill: '#fff',
      tile: { fill: '#000', radius: 0 },
      scale: MASKABLE_SCALE,
    });
    expect(svg).toContain(`scale(${MASKABLE_SCALE})`);
    // The safe zone is a circle of radius 12.8 (40% of 32) about the centre. Corners are
    // rounded, so their bounding boxes are a generous measure; leave a margin of 2 more.
    const farthest = Math.max(
      ...LOGO_SHAPES.flatMap((shape) =>
        [shape.x, shape.x + shape.width].flatMap((x) =>
          [shape.y, shape.y + shape.height].map((y) => Math.hypot(x - 16, y - 16) * MASKABLE_SCALE),
        ),
      ),
    );
    expect(farthest).toBeLessThan(12.8 - 2);
  });
});
