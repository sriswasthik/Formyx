import { act, render, screen } from '@testing-library/react';
import { MotionConfig } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductFrame } from './product-frame';

const label = (look: string) =>
  `The Formyx editor, with the Workshop sign-up form in the ${look} look`;

function renderFrame(reducedMotion: 'always' | 'never') {
  return render(
    <MotionConfig reducedMotion={reducedMotion}>
      <ProductFrame />
    </MotionConfig>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ProductFrame', () => {
  it('is one picture: the real form in it takes no focus', () => {
    const { container } = renderFrame('never');
    expect(screen.getByRole('img', { name: label('Sunrise mesh') })).toBeInTheDocument();
    const canvas = container.querySelector<HTMLElement>('[data-canvas]');
    expect(canvas?.inert).toBe(true);
  });

  it('moves on to the next look every few seconds', () => {
    renderFrame('never');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole('img', { name: label('Sea glass') })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    // Round the four looks and back to the first.
    expect(screen.getByRole('img', { name: label('Sunrise mesh') })).toBeInTheDocument();
  });

  it('holds on the first look with reduced motion', () => {
    renderFrame('always');
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.getByRole('img', { name: label('Sunrise mesh') })).toBeInTheDocument();
  });
});
