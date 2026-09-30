import { z } from 'zod';

/** What a member may do in a workspace, from most to least access. */
export const ROLES = ['OWNER', 'EDITOR', 'VIEWER'] as const;

export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

const ROLE_RANK: Record<Role, number> = { VIEWER: 0, EDITOR: 1, OWNER: 2 };

/** True when `role` grants at least the access of `minRole` (OWNER > EDITOR > VIEWER). */
export function hasRole(role: Role, minRole: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  EDITOR: 'Editor',
  VIEWER: 'Viewer',
};
