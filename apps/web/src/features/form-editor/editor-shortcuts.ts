import type { Shortcut } from '@/lib/shortcuts';

export const EDITOR_SHORTCUTS = {
  undo: { key: 'z', mod: true },
  redo: { key: 'z', mod: true, shift: true },
  /** Windows convention, accepted alongside Ctrl+Shift+Z. */
  redoAlternative: { key: 'y', mod: true },
  duplicate: { key: 'd', mod: true },
  remove: { key: 'Delete' },
  removeAlternative: { key: 'Backspace' },
  deselect: { key: 'Escape' },
} satisfies Record<string, Shortcut>;
