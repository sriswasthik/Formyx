import { useEffect, useState } from 'react';

/**
 * Whether `element` has come within `rootMargin` of the screen, once: for drawing what it
 * holds only when someone may see it.
 */
export function useNearScreen(element: Element | null, rootMargin = '200px'): boolean {
  // Without IntersectionObserver (older browsers), at once.
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (!element || near) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setNear(true);
      },
      { rootMargin },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [element, rootMargin, near]);
  return near;
}
