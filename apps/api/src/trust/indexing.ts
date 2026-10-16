import type { Prisma } from '../generated/prisma/client.js';

/*
 * Forms are kept out of search engines unless their creators ask otherwise, and only a
 * workspace with an owner who has confirmed their email address may ask: a throwaway
 * account can't get a phishing form listed.
 */

/** Selected on a form's workspace: one of its owners who has confirmed their address. */
export const VERIFIED_OWNER_SELECT = {
  memberships: {
    where: { role: 'OWNER', user: { emailVerifiedAt: { not: null } } },
    select: { userId: true },
    take: 1,
  },
} satisfies Prisma.WorkspaceSelect;

/** Whether the workspace (selected with `VERIFIED_OWNER_SELECT`) may let forms be listed. */
export function mayBeIndexed(workspace: { memberships: readonly unknown[] }): boolean {
  return workspace.memberships.length > 0;
}

/** Whether search engines may list a form: asked for, and allowed for its workspace. */
export function isIndexable(
  access: { unlisted: boolean },
  workspace: { memberships: readonly unknown[] },
): boolean {
  return !access.unlisted && mayBeIndexed(workspace);
}
