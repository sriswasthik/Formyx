import { useEffect } from 'react';
import { isTypingTarget, matchesShortcut } from '@/lib/shortcuts';
import { focusQuestion, neighbourAfterRemoving } from './canvas/focus-question';
import { useEditorStoreApi } from './editor-store-context';
import { EDITOR_SHORTCUTS as KEYS } from './editor-shortcuts';

/**
 * Places where keys belong to something else: dialogs, menus and open lists. A dialog that is
 * the editor itself in another form (the full-screen Design Studio) says so with
 * `data-editor-keys`.
 */
const OWNS_KEYS = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/**
 * Undo/redo, duplicate, delete and deselect from the keyboard while building. Undo and redo
 * work even while typing: inputs show the store's value, so the browser's own undo would
 * fight it. Delete never fires while typing, so Backspace still edits text.
 */
export function useEditorShortcuts(enabled: boolean): void {
  const store = useEditorStoreApi();

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const { target } = event;
      const owner = target instanceof Element ? target.closest(OWNS_KEYS) : null;
      if (owner && !owner.hasAttribute('data-editor-keys')) return;
      // A keyboard drag is in progress: its arrows, Space and Escape belong to it.
      if (document.querySelector('[aria-roledescription="sortable"][aria-pressed="true"]')) return;

      const state = store.getState();
      const matches = (shortcut: (typeof KEYS)[keyof typeof KEYS]) =>
        matchesShortcut(event, shortcut);

      if (matches(KEYS.undo)) {
        event.preventDefault();
        state.undo();
        return;
      }
      if (matches(KEYS.redo) || matches(KEYS.redoAlternative)) {
        event.preventDefault();
        state.redo();
        return;
      }

      const selected = state.selectedFieldId;
      const typing = isTypingTarget(target);

      if (matches(KEYS.duplicate)) {
        // Always claim it, so the browser does not bookmark the page instead.
        event.preventDefault();
        if (selected) focusQuestion(state.duplicateField(selected));
        return;
      }
      if (selected && !typing && (matches(KEYS.remove) || matches(KEYS.removeAlternative))) {
        event.preventDefault();
        const ids = state.schema.fields.map((field) => field.id);
        const next = neighbourAfterRemoving(ids, ids.indexOf(selected));
        state.removeField(selected);
        focusQuestion(next);
        return;
      }
      if (matches(KEYS.deselect)) {
        // First leave the input; a second Escape deselects.
        if (typing && target instanceof HTMLElement) {
          target.blur();
          return;
        }
        if (selected) {
          event.preventDefault();
          state.selectField(null);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, store]);
}
