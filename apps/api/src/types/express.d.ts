import type { AuthContext, MembershipContext } from '../middleware/auth.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth`; read it with `getAuth(req)`. */
      auth?: AuthContext;
      /** Set by `requireWorkspaceRole`; read it with `getMembership(req)`. */
      membership?: MembershipContext;
    }
  }
}
