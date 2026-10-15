import { randomBytes } from 'node:crypto';
import {
  emailSchema,
  NAME_MAX_LENGTH,
  REFERRED_TRIAL_DAYS,
  slugify,
  TRIAL_DAYS,
  type EntitlementsMode,
  type LoginInput,
  type MeResponse,
  type RegisterInput,
} from '@formyx/shared';
import { trialPlan, trialsStart } from '../billing/trial.js';
import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../lib/app-error.js';
import type { PasswordHasher } from '../lib/password.js';
import type { Database } from '../lib/prisma.js';
import { referrerByCode } from '../referrals/referrals.js';
import { DISPOSABLE_EMAIL_MESSAGE, isDisposableEmail } from '../trust/disposable-email.js';
import { SignInFlowError, type ProviderProfile } from '../sign-in/providers.js';

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
  isAdmin: true,
  // Only to say whether there is one; never sent.
  passwordHash: true,
  // Never sent either: for refusing suspended accounts and asking for a confirmed email.
  suspendedAt: true,
  emailVerifiedAt: true,
  memberships: {
    orderBy: { createdAt: 'asc' },
    select: { role: true, workspace: { select: { id: true, name: true, slug: true } } },
  },
} satisfies Prisma.UserSelect;

type MeRecord = Prisma.UserGetPayload<{ select: typeof meSelect }>;

/** Shown when a suspended account tries to sign in, and only then. */
export const SUSPENDED_MESSAGE =
  'This account is suspended. Write to us if you think this is a mistake.';

function toMeResponse(user: MeRecord, requireEmailVerification = false): MeResponse {
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      isDemo: user.isDemo,
      ...(user.isAdmin && { isAdmin: true }),
      ...(user.passwordHash === null && { hasPassword: false }),
      ...(requireEmailVerification && !user.emailVerifiedAt && { mustVerifyEmail: true }),
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

/** The name a new account from Google or Zoho gets: theirs, or the start of their email. */
export function nameFromProfile(name: string | null, email: string): string {
  const chosen = name?.replace(/\s+/g, ' ').trim() || email.split('@')[0] || 'Formyx user';
  return chosen.slice(0, NAME_MAX_LENGTH).trim();
}

export interface ProviderSignIn {
  me: MeResponse;
  /** The account was made just now: the first time they signed in. */
  created: boolean;
}

export interface AuthService {
  /** Creates the user with a personal workspace they own. */
  register(input: RegisterInput): Promise<MeResponse>;
  logIn(input: LoginInput): Promise<MeResponse>;
  /**
   * Signs in with a Google or Zoho account: the account it was linked to; or the account
   * with the same email, which it is then linked to, if the provider has confirmed the email
   * belongs to them; or a new account. `SignInFlowError` when it can't.
   */
  signInWithProvider(
    profile: ProviderProfile,
    extras?: Pick<RegisterInput, 'referralCode' | 'source'>,
  ): Promise<ProviderSignIn>;
  /** The user and their workspaces, or `null` if the user no longer exists. */
  getMe(userId: string): Promise<MeResponse | null>;
}

export function createAuthService({
  prisma,
  passwords,
  mode = 'all_unlocked',
  requireEmailVerification = false,
}: {
  prisma: Database;
  passwords: PasswordHasher;
  /** Where plans are enforced, the first workspace starts a free trial. */
  mode?: EntitlementsMode;
  /** REQUIRE_EMAIL_VERIFICATION: the app asks unconfirmed accounts to confirm. */
  requireEmailVerification?: boolean;
}): AuthService {
  const me = (user: MeRecord) => toMeResponse(user, requireEmailVerification);

  async function isEmailRegistered(email: string): Promise<boolean> {
    return (await prisma.user.count({ where: { email } })) > 0;
  }

  /**
   * The user, their personal workspace (which takes the account's one free trial, where plans
   * are enforced) and their membership of it, in one transaction. Throws the unique violation
   * when the email is taken; a colliding random workspace slug is tried again.
   */
  async function createAccount({
    name,
    email,
    passwordHash,
    referralCode,
    source,
    identity,
    emailVerified = false,
  }: {
    name: string;
    email: string;
    passwordHash: string | null;
    referralCode?: string | undefined;
    source?: RegisterInput['source'];
    /** The Google or Zoho account it is made through. */
    identity?: { provider: string; subject: string; email: string };
    /** The address is confirmed already (by Google or Zoho). */
    emailVerified?: boolean;
  }): Promise<MeResponse> {
    // A friend's code: a longer trial, and a reward for them later. An unknown code is ignored.
    const referrerId = referralCode ? await referrerByCode(prisma, referralCode) : null;

    for (let attempt = 1; ; attempt++) {
      try {
        const now = new Date();
        const trial = trialsStart(mode);
        // A nested create runs in one transaction: every row is written, or none.
        const user = await prisma.user.create({
          data: {
            name,
            email,
            passwordHash,
            ...(emailVerified && { emailVerifiedAt: now }),
            // New accounts get the welcome and the getting-started checklist.
            onboarding: { startedAt: now.toISOString() },
            signupSource: source ?? null,
            ...(referrerId && { referredBy: { create: { referrerId } } }),
            ...(identity && { signInIdentities: { create: identity } }),
            // The personal workspace takes the account's one free trial.
            ...(trial && { trialUsedAt: now }),
            memberships: {
              create: {
                role: 'OWNER',
                workspace: {
                  create: {
                    name: personalWorkspaceName(name),
                    slug: personalWorkspaceSlug(name),
                    ...(trial && trialPlan(now, referrerId ? REFERRED_TRIAL_DAYS : TRIAL_DAYS)),
                  },
                },
              },
            },
          },
          select: meSelect,
        });
        return me(user);
      } catch (error) {
        // Taken email: the caller decides. Otherwise the random workspace slug collided,
        // which is worth another try.
        if (!isUniqueViolation(error) || (await isEmailRegistered(email))) throw error;
        if (attempt >= MAX_SLUG_ATTEMPTS) throw error;
      }
    }
  }

  return {
    async register({ name, email, password, referralCode, source }) {
      if (isDisposableEmail(email)) {
        throw new AppError(400, 'VALIDATION_ERROR', DISPOSABLE_EMAIL_MESSAGE, {
          details: [{ path: 'email', message: DISPOSABLE_EMAIL_MESSAGE }],
        });
      }
      if (await isEmailRegistered(email)) throw emailTaken();
      const passwordHash = await passwords.hash(password);
      try {
        return await createAccount({ name, email, passwordHash, referralCode, source });
      } catch (error) {
        // The same email was registered concurrently.
        if (isUniqueViolation(error) && (await isEmailRegistered(email))) throw emailTaken();
        throw error;
      }
    },

    async logIn({ email, password }) {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { ...meSelect, passwordHash: true, suspendedAt: true },
      });

      // The demo account has no password: it is only reachable through POST /auth/demo. Nor
      // do accounts made through Google or Zoho, until they set one.
      if (!user || user.isDemo || user.passwordHash === null) {
        await passwords.verifyAgainstDummy(password);
        throw invalidCredentials();
      }
      if (!(await passwords.verify(password, user.passwordHash))) {
        throw invalidCredentials();
      }
      // Said only to whoever knows the password, so it never reveals that an account exists.
      if (user.suspendedAt) throw new AppError(403, 'ACCOUNT_SUSPENDED', SUSPENDED_MESSAGE);
      return me(user);
    },

    async signInWithProvider(profile, extras = {}) {
      const { provider, subject } = profile;
      const linkedUser = async () =>
        (
          await prisma.signInIdentity.findUnique({
            where: { provider_subject: { provider, subject } },
            select: { user: { select: meSelect } },
          })
        )?.user;

      /** A sign-in to an existing account, unless it is suspended. */
      const signedIn = (user: MeRecord): ProviderSignIn => {
        if (user.suspendedAt) throw new SignInFlowError('suspended');
        return { me: me(user), created: false };
      };

      const linked = await linkedUser();
      if (linked) return signedIn(linked);

      const email = emailSchema.safeParse(profile.email);
      if (!email.success) throw new SignInFlowError('failed', `${provider} sent a bad email`);
      const identity = { provider, subject, email: email.data };

      for (let attempt = 1; ; attempt++) {
        const existing = await prisma.user.findUnique({
          where: { email: email.data },
          select: { id: true, isDemo: true },
        });
        if (existing) {
          if (existing.isDemo) throw new SignInFlowError('failed', 'That is the demo account');
          // Anyone can type any email at some providers: only a confirmed one reaches an account.
          if (!profile.emailVerified) throw new SignInFlowError('unverified_email');
          const user = await prisma.user.update({
            where: { id: existing.id },
            data: { signInIdentities: { create: identity } },
            select: meSelect,
          });
          return signedIn(user);
        }
        if (isDisposableEmail(email.data)) throw new SignInFlowError('disposable_email');
        try {
          const created = await createAccount({
            name: nameFromProfile(profile.name, email.data),
            email: email.data,
            passwordHash: null,
            identity,
            emailVerified: profile.emailVerified,
            ...extras,
          });
          return { me: created, created: true };
        } catch (error) {
          // Made at the same moment (another tab, say): use it, or link to it on the next pass.
          if (!isUniqueViolation(error) || attempt >= 2) throw error;
          const raced = await linkedUser();
          if (raced) return signedIn(raced);
        }
      }
    },

    async getMe(userId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: meSelect });
      return user ? me(user) : null;
    },
  };
}
