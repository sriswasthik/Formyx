import {
  readAccountPreferences,
  type AccountPreferences,
  type ChangePasswordInput,
  type DeleteAccountInput,
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
   * Sets a first password, for an account made through Google or Zoho; returns the new
   * password version. 409 for an account that has one: it changes it instead.
   */
  setPassword(userId: string, newPassword: string): Promise<number>;
  /**
   * Checks it is really them, before deleting the account: the password, or for an account
   * without one, its email. Throws 400 WRONG_CODE otherwise.
   */
  confirm(userId: string, confirmation: DeleteAccountInput): Promise<void>;
}

function noPassword(): AppError {
  return new AppError(409, 'CONFLICT', 'This account has no password yet. Set one instead.');
}

export function createAccountService({
  prisma,
  passwords,
}: {
  prisma: Database;
  passwords: PasswordHasher;
}): AccountService {
  async function findAccount(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, passwordHash: true, passwordVersion: true },
    });
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Log in to continue');
    return user;
  }

  async function checkPassword(userId: string, password: string) {
    const user = await findAccount(userId);
    if (user.passwordHash === null) throw noPassword();
    // 400, not 401: a mistyped password must not look like an ended session.
    if (!(await passwords.verify(password, user.passwordHash))) {
      throw new AppError(400, 'WRONG_CODE', 'That password is not right.', {
        details: [{ path: 'password', message: 'That password is not right' }],
      });
    }
    return user;
  }

  /** What deleting needs: the password, or for an account without one, its email. */
  async function checkConfirmation(userId: string, confirmation: DeleteAccountInput) {
    if ('password' in confirmation) return checkPassword(userId, confirmation.password);
    const user = await findAccount(userId);
    if (user.passwordHash !== null) {
      throw new AppError(400, 'BAD_REQUEST', 'Confirm with your password.');
    }
    if (confirmation.email !== user.email) {
      throw new AppError(400, 'WRONG_CODE', 'That is not your account’s email.', {
        details: [{ path: 'email', message: 'That is not your account’s email' }],
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

    async setPassword(userId, newPassword) {
      // Only while there is none, checked in the same statement, so two at once can't both win.
      const { count } = await prisma.user.updateMany({
        where: { id: userId, passwordHash: null },
        data: {
          passwordHash: await passwords.hash(newPassword),
          passwordVersion: { increment: 1 },
        },
      });
      if (count === 0) {
        throw new AppError(
          409,
          'CONFLICT',
          'This account already has a password. Change it instead.',
        );
      }
      const user = await findAccount(userId);
      return user.passwordVersion;
    },

    async confirm(userId, confirmation) {
      await checkConfirmation(userId, confirmation);
    },
  };
}
