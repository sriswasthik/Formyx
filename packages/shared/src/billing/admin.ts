import { z } from 'zod';
import { planSchema, planStatusSchema } from '../entitlements/plans.js';
import { paidPlanSchema } from '../entitlements/pricing.js';
import { subscriptionSummarySchema } from './api.js';

/* The /api/admin endpoints, for Formyx's own admins (users with isAdmin). */

/** A workspace as admins see it. */
export const adminWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.iso.datetime(),
  owners: z.array(z.object({ name: z.string(), email: z.string() })),
  plan: planSchema,
  effectivePlan: planSchema,
  planStatus: planStatusSchema,
  trialEndsAt: z.iso.datetime().nullable(),
  graceEndsAt: z.iso.datetime().nullable(),
  complimentaryPlan: planSchema.nullable(),
  complimentaryUntil: z.iso.datetime().nullable(),
  subscription: subscriptionSummarySchema.nullable(),
  forms: z.number().int().min(0),
});
export type AdminWorkspace = z.infer<typeof adminWorkspaceSchema>;

/** `GET /api/admin/workspaces?query=`: by name, slug or an owner's email. */
export const adminWorkspacesResponseSchema = z.object({
  workspaces: z.array(adminWorkspaceSchema),
});
export type AdminWorkspacesResponse = z.infer<typeof adminWorkspacesResponseSchema>;

export const ADMIN_SEARCH_MAX_LENGTH = 100;

export const adminSearchQuerySchema = z.object({
  query: z.string().trim().max(ADMIN_SEARCH_MAX_LENGTH).default(''),
});

/** The longest complimentary plan an admin can give at once. */
export const COMPLIMENTARY_MAX_DAYS = 366;

/** Body of `POST /api/admin/workspaces/:workspaceId/complimentary`. */
export const grantComplimentaryInputSchema = z.object({
  plan: paidPlanSchema,
  days: z
    .number()
    .int()
    .min(1, 'Give at least a day')
    .max(COMPLIMENTARY_MAX_DAYS, `Give ${COMPLIMENTARY_MAX_DAYS} days or fewer`),
  /** Who it is for, for the record. */
  note: z.string().trim().max(200).optional(),
});
export type GrantComplimentaryInput = z.infer<typeof grantComplimentaryInputSchema>;

export const TRIAL_EXTENSION_MAX_DAYS = 90;

/** Body of `POST /api/admin/workspaces/:workspaceId/extend-trial`. */
export const extendTrialInputSchema = z.object({
  days: z
    .number()
    .int()
    .min(1, 'Add at least a day')
    .max(TRIAL_EXTENSION_MAX_DAYS, `Add ${TRIAL_EXTENSION_MAX_DAYS} days or fewer`),
});
export type ExtendTrialInput = z.infer<typeof extendTrialInputSchema>;
