import type { MeResponse } from '@formyx/shared';
import { createContext, useContext } from 'react';

/**
 * The session, provided by `ProtectedRoute`. Pages read it from here rather than from the
 * "me" query, so they can never render with a signed-out state: when the session ends,
 * `ProtectedRoute` redirects instead of rendering them again.
 */
export const SessionContext = createContext<MeResponse | null>(null);

/** The signed-in user and their workspaces. Only use it below `ProtectedRoute`. */
export function useSession(): MeResponse {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession() must be used inside <ProtectedRoute>');
  return session;
}
