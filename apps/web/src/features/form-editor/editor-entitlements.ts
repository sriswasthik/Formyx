import { createContext, useContext } from 'react';
import {
  UNKNOWN_ENTITLEMENTS,
  type UseEntitlements,
} from '@/features/entitlements/use-entitlements';

/** What the form's workspace plan includes, for everything inside the editor. */
export const EditorEntitlementsContext = createContext<UseEntitlements>(UNKNOWN_ENTITLEMENTS);

export function useEditorEntitlements(): UseEntitlements {
  return useContext(EditorEntitlementsContext);
}
