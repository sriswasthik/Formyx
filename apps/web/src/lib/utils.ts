import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge only knows Tailwind's default scale names. Teach it our
 * custom tokens so e.g. `text-14` is merged as a font size, not a text colour.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['12', '13', '14', '16', '20', '24', '32', '40'],
      ease: ['standard'],
      shadow: ['popover', 'dialog'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
