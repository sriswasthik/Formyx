import { z } from 'zod';
import { referralCodeSchema, signupSourceSchema } from './referrals.js';
import { roleSchema } from './roles.js';

export const NAME_MAX_LENGTH = 80;
export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt ignores everything after 72 bytes, so longer passwords are rejected, not truncated. */
export const PASSWORD_MAX_BYTES = 72;

/**
 * Length of `value` in UTF-8 bytes. Counted by hand because this package targets both Node
 * and browsers with only the ES library typings, which do not include TextEncoder.
 */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint < 0x80) bytes += 1;
    else if (codePoint < 0x800) bytes += 2;
    else if (codePoint < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

export const nameSchema = z
  .string({ error: 'Enter your name' })
  .trim()
  .min(1, 'Enter your name')
  .max(NAME_MAX_LENGTH, `Use ${NAME_MAX_LENGTH} characters or fewer`);

/** Trimmed and lowercased, so `Ada@Example.com ` and `ada@example.com` are the same account. */
export const emailSchema = z
  .string({ error: 'Enter your email' })
  .trim()
  .min(1, 'Enter your email')
  .max(EMAIL_MAX_LENGTH, 'Enter a valid email address')
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'));

/** Rules for choosing a password. Deliberately no composition rules, per NIST SP 800-63B. */
export const newPasswordSchema = z
  .string({ error: 'Enter a password' })
  .min(1, { error: 'Enter a password', abort: true })
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .refine((value) => utf8ByteLength(value) <= PASSWORD_MAX_BYTES, 'Password is too long');

/** Logging in only needs a password to be present; the policy applies when choosing one. */
export const currentPasswordSchema = z
  .string({ error: 'Enter your password' })
  .min(1, 'Enter your password');

export const registerInputSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: newPasswordSchema,
  /** A friend's referral code, from their link. An unknown one is ignored. */
  referralCode: referralCodeSchema.optional(),
  /** What brought them, such as the badge on a free form. */
  source: signupSourceSchema.optional(),
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

export const loginInputSchema = z.object({
  email: emailSchema,
  password: currentPasswordSchema,
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const sessionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  createdAt: z.iso.datetime(),
  /** True for the shared demo account, whose data resets nightly and which has limits. */
  isDemo: z.boolean().optional(),
  /** Formyx's own admins, who may open /admin. Left out for everyone else. */
  isAdmin: z.boolean().optional(),
  /** False for accounts that sign in only with Google or Zoho. Left out when there is one. */
  hasPassword: z.boolean().optional(),
  /**
   * True while publishing waits for them to confirm their email (REQUIRE_EMAIL_VERIFICATION).
   * Left out otherwise.
   */
  mustVerifyEmail: z.boolean().optional(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

/** A workspace as seen by one of its members. */
export const workspaceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  role: roleSchema,
});
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

/** Body of `GET /api/auth/me`, and of successful register and log-in responses. */
export const meResponseSchema = z.object({
  user: sessionUserSchema,
  workspaces: z.array(workspaceSummarySchema),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/** Body of `POST /api/auth/verify-email`: the token from the emailed link. */
export const verifyEmailInputSchema = z.object({
  token: z.string().trim().min(1, 'This link is incomplete').max(2000),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailInputSchema>;
