import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { EditorState, EditorStore } from './editor-store';

/** One store per open editor, so editors (and tests) never share state. */
export const EditorStoreContext = createContext<EditorStore | null>(null);

export function useEditorStoreApi(): EditorStore {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error('Editor hooks must be used inside <EditorStoreContext>');
  return store;
}

export function useEditorStore<T>(selector: (state: EditorState) => T): T {
  return useStore(useEditorStoreApi(), selector);
}
