import {
  readAccountPreferences,
  type AccountPreferences,
  type ChangePasswordInput,
  type SoleOwnerDetails,
} from '@formyx/shared';
import { AppError } from '../lib/app-error.js';
import type { PasswordHasher } from '../lib/password.js';
import type { Database } from '../lib/prisma.js';

/*
 * A person's own account: their preferences, their password and leaving Formyx. Workspaces
 * outlive the people in them, so an account that is the only owner of a workspace with other
 * members cannot be deleted until someone else owns it.
 */

export interface AccountService {
  preferences(userId: string): Promise<AccountPreferences>;
  setPreferences(userId: string, preferences: AccountPreferences): Promise<AccountPreferences>;
  /**
   * Checks the current password, then sets the new one; returns the new password version,
   * which signs out every other session. 401 WRONG_CODE for a wrong current password.
   */
  changePassword(userId: string, input: ChangePasswordInput): Promise<number>;
  /**
   * Deletes the account and the workspaces only it belongs to. 409 LAST_OWNER, listing
   * them, if it is the only owner of workspaces others are in.
   */
  deleteAccount(userId: string, password: string): Promise<void>;
}

export function createAccountService({
  prisma,
  passwords,
}: {
  prisma: Database;
  passwords: PasswordHasher;
}): AccountService {
  async function checkPassword(userId: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, passwordVersion: true },
    });
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Log in to continue');
    // 400, not 401: a mistyped password must not look like an ended session.
    if (!(await passwords.verify(password, user.passwordHash))) {
      throw new AppError(400, 'WRONG_CODE', 'That password is not right.', {
        details: [{ path: 'password', message: 'That password is not right' }],
      });
    }
    return user;
  }

  return {
    async preferences(userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { preferences: true },
      });
      return readAccountPreferences(user?.preferences);
    },

    async setPreferences(userId, preferences) {
      await prisma.user.update({ where: { id: userId }, data: { preferences } });
      return preferences;
    },

    async changePassword(userId, { currentPassword, newPassword }) {
      const user = await checkPassword(userId, currentPassword);
      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: await passwords.hash(newPassword),
          passwordVersion: user.passwordVersion + 1,
        },
        select: { passwordVersion: true },
      });
      return updated.passwordVersion;
    },

    async deleteAccount(userId, password) {
      await checkPassword(userId, password);
      const owned = await prisma.membership.findMany({
        where: { userId, role: 'OWNER' },
        select: {
          workspace: {
            select: {
              id: true,
              name: true,
              memberships: { select: { userId: true, role: true } },
            },
          },
        },
      });
      const blocking = owned
        .map(({ workspace }) => workspace)
        .filter(
          (workspace) =>
            workspace.memberships.some((member) => member.userId !== userId) &&
            !workspace.memberships.some(
              (member) => member.userId !== userId && member.role === 'OWNER',
            ),
        );
      if (blocking.length > 0) {
        const details: SoleOwnerDetails = {
          workspaces: blocking.map(({ id, name }) => ({ id, name })),
        };
        throw new AppError(
          409,
          'LAST_OWNER',
          'Make someone else an owner of your shared workspaces first, or delete them.',
          { details },
        );
      }
      const alone = owned
        .map(({ workspace }) => workspace)
        .filter((workspace) => workspace.memberships.every((member) => member.userId === userId));
      await prisma.$transaction([
        // Forms, responses and everything else in them go with them (cascades).
        prisma.workspace.deleteMany({ where: { id: { in: alone.map(({ id }) => id) } } }),
        // Memberships go with the account; forms it made in shared workspaces stay.
        prisma.user.delete({ where: { id: userId } }),
      ]);
    },
  };
}
