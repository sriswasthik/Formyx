import { randomBytes } from 'node:crypto';
import { slugify, type LoginInput, type MeResponse, type RegisterInput } from '@formyx/shared';
import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../lib/app-error.js';
import type { PasswordHasher } from '../lib/password.js';
import type { Database } from '../lib/prisma.js';

/** Same message for unknown emails and wrong passwords, so it never confirms an account exists. */
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';
export const EMAIL_TAKEN_MESSAGE = 'An account with this email already exists';

const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SLUG_SUFFIX_LENGTH = 6;
const MAX_SLUG_ATTEMPTS = 3;

const meSelect = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
  isDemo: true,
  memberships: {
    orderBy: { createdAt: 'asc' },
    select: { role: true, workspace: { select: { id: true, name: true, slug: true } } },
  },
} satisfies Prisma.UserSelect;

type MeRecord = Prisma.UserGetPayload<{ select: typeof meSelect }>;

function toMeResponse(user: MeRecord): MeResponse {
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      isDemo: user.isDemo,
    },
    workspaces: user.memberships.map(({ role, workspace }) => ({ ...workspace, role })),
  };
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "Ada Lovelace" -> "Ada's workspace" */
export function personalWorkspaceName(name: string): string {
  return `${firstName(name)}'s workspace`;
}

/** "Design team" -> "design-team-x7k2p9". The random suffix keeps slugs unique and unguessable. */
export function workspaceSlug(name: string): string {
  const suffix = Array.from(
    randomBytes(SLUG_SUFFIX_LENGTH),
    (byte) => SLUG_ALPHABET[byte % SLUG_ALPHABET.length],
  ).join('');
  return `${slugify(name, 32) || 'workspace'}-${suffix}`;
}

/** "Ada Lovelace" -> "ada-x7k2p9" */
export function personalWorkspaceSlug(name: string): string {
  return workspaceSlug(firstName(name));
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function emailTaken(): AppError {
  return new AppError(409, 'CONFLICT', EMAIL_TAKEN_MESSAGE, {
    details: [{ path: 'email', message: EMAIL_TAKEN_MESSAGE }],
  });
}

function invalidCredentials(): AppError {
  return new AppError(401, 'UNAUTHORIZED', INVALID_CREDENTIALS_MESSAGE);
}

export interface AuthService {
  /** Creates the user with a personal workspace they own. */
  register(input: RegisterInput): Promise<MeResponse>;
  logIn(input: LoginInput): Promise<MeResponse>;
  /** The user and their workspaces, or `null` if the user no longer exists. */
  getMe(userId: string): Promise<MeResponse | null>;
}

export function createAuthService({
  prisma,
  passwords,
}: {
  prisma: Database;
  passwords: PasswordHasher;
}): AuthService {
  async function isEmailRegistered(email: string): Promise<boolean> {
    return (await prisma.user.count({ where: { email } })) > 0;
  }

  return {
    async register({ name, email, password }) {
      if (await isEmailRegistered(email)) throw emailTaken();

      const passwordHash = await passwords.hash(password);

      for (let attempt = 1; ; attempt++) {
        try {
          // A nested create runs in one transaction: all three rows are written, or none.
          const user = await prisma.user.create({
            data: {
              name,
              email,
              passwordHash,
              memberships: {
                create: {
                  role: 'OWNER',
                  workspace: {
                    create: {
                      name: personalWorkspaceName(name),
                      slug: personalWorkspaceSlug(name),
                    },
                  },
                },
              },
            },
            select: meSelect,
          });
          return toMeResponse(user);
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          // Either the same email was registered concurrently...
          if (await isEmailRegistered(email)) throw emailTaken();
          // ...or the random workspace slug collided, which is worth another try.
          if (attempt >= MAX_SLUG_ATTEMPTS) throw error;
        }
      }
    },

    async logIn({ email, password }) {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { ...meSelect, passwordHash: true },
      });

      // The demo account has no password: it is only reachable through POST /auth/demo.
      if (!user || user.isDemo) {
        await passwords.verifyAgainstDummy(password);
        throw invalidCredentials();
      }
      if (!(await passwords.verify(password, user.passwordHash))) {
        throw invalidCredentials();
      }
      return toMeResponse(user);
    },

    async getMe(userId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: meSelect });
      return user ? toMeResponse(user) : null;
    },
  };
}
