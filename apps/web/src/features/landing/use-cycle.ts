import { useEffect, useState } from 'react';

interface CycleOptions {
  /** How many items to step through. */
  count: number;
  /** Milliseconds on each item. */
  interval: number;
  /** Holds on the current item, e.g. with reduced motion or while off-screen. */
  paused: boolean;
}

/**
 * Steps through `count` items, one every `interval` ms, looping. It holds while `paused`, and
 * while the tab is hidden, so a background tab never runs it.
 */
export function useCycle({ count, interval, paused }: CycleOptions): number {
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState(() => document.visibilityState === 'hidden');

  useEffect(() => {
    const update = () => {
      setHidden(document.visibilityState === 'hidden');
    };
    document.addEventListener('visibilitychange', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  useEffect(() => {
    if (paused || hidden || count < 2) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, interval);
    return () => {
      window.clearInterval(timer);
    };
  }, [paused, hidden, count, interval]);

  return index;
}

/**
 * Whether `element` has come within `rootMargin` of the screen, once: for loading what it holds
 * shortly before it is seen. Just below the screen by default, not further: what loads while
 * the page itself is loading slows it.
 */
export function useSeen(element: Element | null, rootMargin = '0px 0px 200px 0px'): boolean {
  // Without IntersectionObserver (older browsers), at once.
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (!element || seen) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setSeen(true);
      },
      { rootMargin },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [element, rootMargin, seen]);
  return seen;
}

/** Whether `element` is on screen; true until observed, so the first item shows at once. */
export function useOnScreen(element: Element | null, rootMargin = '0px'): boolean {
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setOnScreen(entry.isIntersecting);
      },
      { rootMargin },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [element, rootMargin]);
  return onScreen;
}
