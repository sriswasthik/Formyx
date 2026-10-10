import { useEffect, useState } from 'react';

/**
 * How much of the bottom of the screen the on-screen keyboard covers, in CSS pixels, so a
 * bar pinned to the bottom can sit above it. 0 without a keyboard or `visualViewport`.
 */
export function useKeyboardInset(enabled: boolean): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = typeof window === 'undefined' ? undefined : window.visualViewport;
    if (!enabled || !viewport) return;
    const update = () => {
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      // Small differences are browser chrome sliding, not a keyboard.
      setInset(covered > 80 ? Math.round(covered) : 0);
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, [enabled]);

  return enabled ? inset : 0;
}
