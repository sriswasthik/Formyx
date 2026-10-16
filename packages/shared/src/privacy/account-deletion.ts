import { z } from 'zod';
import { currentPasswordSchema } from '../auth.js';

/*
 * Deleting an account waits a week, so a change of heart (or someone else at the keyboard)
 * can be undone. In that week the account is signed out everywhere and can sign back in only
 * to keep itself. Then its workspaces are handed over or deleted as chosen, any plans they
 * pay for are cancelled, and the account and its personal data are removed.
 */

export const ACCOUNT_DELETION_DAYS = 7;

/** What happens to a shared workspace the account owns alone. */
export const workspaceDeletionChoiceSchema = z.discriminatedUnion('action', [
  z.object({
    workspaceId: z.string(),
    action: z.literal('transfer'),
    /** A member, who becomes an owner. */
    toUserId: z.string(),
  }),
  z.object({ workspaceId: z.string(), action: z.literal('delete') }),
]);
export type WorkspaceDeletionChoice = z.infer<typeof workspaceDeletionChoiceSchema>;

/** The choices, kept with the account until it is deleted (`users.deletion_plan`). */
export const accountDeletionPlanSchema = z.object({
  workspaces: z.array(workspaceDeletionChoiceSchema).max(100),
});
export type AccountDeletionPlan = z.infer<typeof accountDeletionPlanSchema>;

/**
 * Body of `POST /api/account/delete`: the password (or, for an account without one, its
 * email typed out), and a choice for each shared workspace it owns alone.
 */
export const requestAccountDeletionInputSchema = z.intersection(
  z.union([
    z.object({ password: currentPasswordSchema }),
    z.object({ email: z.string().trim().toLowerCase().min(1, 'Enter your email') }),
  ]),
  z.object({ workspaces: accountDeletionPlanSchema.shape.workspaces.default([]) }),
);
export type RequestAccountDeletionInput = z.input<typeof requestAccountDeletionInputSchema>;

/** A workspace the account owns, as the deletion screen shows it. */
export const ownedWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  /**
   * `alone`: only they are in it, so it is deleted. `shared`: another owner stays, so they
   * just leave. `choose`: they are its only owner and others are members, so they decide.
   */
  fate: z.enum(['alone', 'shared', 'choose']),
  /** Who it could pass to (for `choose`): its other members. */
  members: z.array(z.object({ userId: z.string(), name: z.string(), email: z.string() })),
  /** It pays for a plan, which is cancelled if it is deleted. */
  paidPlan: z.boolean(),
});
export type OwnedWorkspace = z.infer<typeof ownedWorkspaceSchema>;

/** `GET /api/account/deletion`: what deleting would do, and whether it is scheduled. */
export const accountDeletionSchema = z.object({
  scheduledFor: z.iso.datetime().nullable(),
  workspaces: z.array(ownedWorkspaceSchema),
});
export type AccountDeletion = z.infer<typeof accountDeletionSchema>;

/** Body of `POST /api/public/account/restore`: the token from the emailed link. */
export const restoreAccountInputSchema = z.object({
  token: z.string().trim().min(16).max(256),
});
export type RestoreAccountInput = z.infer<typeof restoreAccountInputSchema>;
