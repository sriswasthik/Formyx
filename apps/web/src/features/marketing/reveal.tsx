import { m, useReducedMotionConfig } from 'motion/react';
import type * as React from 'react';
import { DURATION, EASE_STANDARD } from '@/lib/motion';

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** Seconds to wait, to stagger a row of items. */
  delay?: number;
}

/**
 * Fades its content in with an 8px rise the first time it scrolls into view. With reduced
 * motion it is there from the start, still.
 */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const reduce = useReducedMotionConfig() ?? false;
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -48px 0px' }}
      transition={{ duration: DURATION.slow, ease: EASE_STANDARD, delay }}
      className={className}
    >
      {children}
    </m.div>
  );
}
