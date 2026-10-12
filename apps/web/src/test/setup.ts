import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

// `cx` joins classes without resolving conflicts (see src/lib/cx.ts). In tests it also checks
// there are none: anything tailwind-merge would have dropped is a class that loses at random.
vi.mock('@/lib/cx', async () => {
  const { clsx } = await import('clsx');
  const { cn } = await import('@/lib/utils');
  return {
    cx: (...inputs: Parameters<typeof clsx>) => {
      const joined = clsx(inputs);
      const kept = new Set(cn(joined).split(' '));
      const conflicting = joined.split(' ').filter((name) => name && !kept.has(name));
      if (conflicting.length > 0) {
        throw new Error(`cx: conflicting classes [${conflicting.join(' ')}] in "${joined}"`);
      }
      return joined;
    },
  };
});

// jsdom does not implement these browser APIs that Radix and our theme code rely on.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub;

class IntersectionObserverStub {
  readonly root = null;
  readonly rootMargin = '0px';
  readonly scrollMargin = '0px';
  readonly thresholds = [0];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
window.IntersectionObserver = IntersectionObserverStub;

Element.prototype.scrollIntoView = function scrollIntoView() {};
Element.prototype.scrollTo = function scrollTo() {};
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = function setPointerCapture() {};
Element.prototype.releasePointerCapture = function releasePointerCapture() {};
