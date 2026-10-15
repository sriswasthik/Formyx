import type { Shortcut } from '@/lib/shortcuts';

/** Shortcuts that work anywhere in the app's signed-in pages. */
export const APP_SHORTCUTS = {
  /** Opens the command palette. */
  search: { key: 'k', mod: true },
  /** Collapses the sidebar to its rail, or opens it again. */
  sidebar: { key: '[' },
} satisfies Record<string, Shortcut>;

/** Whether a key press is meant for the field the person is typing in. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
