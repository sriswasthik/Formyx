import { CircleAlert } from 'lucide-react';
import { motion } from 'motion/react';
import type * as React from 'react';
import { DURATION, EASE_STANDARD } from '@/lib/motion';

/** A problem with the form as a whole (not one field), announced to screen readers. */
export function FormAlert({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.base, ease: EASE_STANDARD }}
      className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-13 text-danger-text"
    >
      <CircleAlert className="mt-0.5 shrink-0" aria-hidden />
      <p>{children}</p>
    </motion.div>
  );
}
