import { clsx, type ClassValue } from 'clsx';

/**
 * Joins class names, like `cn` but without tailwind-merge's conflict resolution. The forms
 * respondents see use it, which keeps tailwind-merge (about 8.5 KB) out of public forms. Their
 * classes must not conflict: choose one with a ternary, or override a shared style recipe
 * with Tailwind's `!`. Tests enforce it (src/test/setup.ts).
 */
export function cx(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
