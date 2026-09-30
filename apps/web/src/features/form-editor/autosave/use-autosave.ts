import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { formKeys } from '@/features/forms/form-list-cache';
import { updateForm } from '@/features/forms/forms-api';
import type { EditorStore } from '../editor-store';
import { Autosaver, type SaveState } from './autosaver';

/**
 * Autosaves the editor's draft and keeps the forms cache in step. Warns before the tab is
 * closed while changes are unsaved.
 */
export function useAutosave(
  formId: string,
  store: EditorStore,
): {
  state: SaveState;
  autosaver: Autosaver;
} {
  const queryClient = useQueryClient();
  const [autosaver] = useState(
    () =>
      new Autosaver({
        store,
        save: (input) => updateForm(formId, input),
        onSaved: (form) => {
          queryClient.setQueryData(formKeys.detail(form.id), form);
          // Dashboards show titles and edit times; they refetch when next shown.
          void queryClient.invalidateQueries({ queryKey: formKeys.lists(form.workspaceId) });
        },
      }),
  );

  useEffect(() => {
    autosaver.start();
    return () => {
      autosaver.dispose();
    };
  }, [autosaver]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (autosaver.hasUnsavedChanges()) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [autosaver]);

  const state = useSyncExternalStore(autosaver.subscribe, autosaver.getState);
  return { state, autosaver };
}
