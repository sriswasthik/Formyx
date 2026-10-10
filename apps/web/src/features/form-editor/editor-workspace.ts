import { createContext, useContext } from 'react';

/** The workspace the edited form belongs to; `null` where the editor is drawn without one. */
export const EditorWorkspaceContext = createContext<string | null>(null);

export function useEditorWorkspaceId(): string | null {
  return useContext(EditorWorkspaceContext);
}
