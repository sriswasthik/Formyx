import { z } from 'zod';
import { formStatusSchema } from '../forms/api.js';
import { reportReasonSchema } from './reports.js';

/*
 * /admin's review queue: forms held when they were published, and forms people reported.
 * Every action here is logged in admin_actions.
 */

const creatorSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  createdAt: z.iso.datetime(),
  suspended: z.boolean(),
});

/** A form in the queue. */
export const adminReviewItemSchema = z.object({
  formId: z.string(),
  /** As published: what visitors saw. */
  title: z.string(),
  slug: z.string(),
  status: formStatusSchema,
  workspace: z.object({ id: z.string(), name: z.string() }),
  /** Null once the creator's account is gone. */
  creator: creatorSchema.nullable(),
  /** Why it is held: its content, or reports. Null when it is live with open reports. */
  heldFor: z.enum(['content', 'reports']).nullable(),
  /** "asks for a password", and so on. */
  reasons: z.array(z.string()),
  openReports: z.number().int().min(0),
  updatedAt: z.iso.datetime(),
});
export type AdminReviewItem = z.infer<typeof adminReviewItemSchema>;

/** Body of `GET /api/admin/review`: held forms first, then reported ones, newest first. */
export const adminReviewQueueSchema = z.object({ items: z.array(adminReviewItemSchema) });
export type AdminReviewQueue = z.infer<typeof adminReviewQueueSchema>;

/** Body of `GET /api/admin/review/:formId`: everything a reviewer needs to decide. */
export const adminFormReviewSchema = adminReviewItemSchema.extend({
  matches: z.array(z.object({ label: z.string(), path: z.string(), excerpt: z.string() })),
  unsafeLinks: z.array(z.object({ url: z.string(), reason: z.string() })),
  reports: z.array(
    z.object({
      id: z.string(),
      reason: reportReasonSchema,
      details: z.string().nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
  /** The published questions' labels, in order, to read what it asks. */
  questions: z.array(z.string()),
  /** Earlier decisions about this form or its creator. */
  history: z.array(
    z.object({
      action: z.string(),
      note: z.string().nullable(),
      adminName: z.string().nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
});
export type AdminFormReview = z.infer<typeof adminFormReviewSchema>;

export const ADMIN_FORM_ACTIONS = [
  /** Held: put it live, and don't hold it again for the same things. */
  'approve',
  /** Live with reports: they were wrong; close them. */
  'dismiss_reports',
  /** Back to a draft; the creator may publish it again (and it is checked again). */
  'unpublish',
  /** Offline for good; only an admin can bring it back. */
  'suspend',
  /** Suspended: back to a draft. */
  'restore',
] as const;
export const adminFormActionSchema = z.enum(ADMIN_FORM_ACTIONS);
export type AdminFormAction = z.infer<typeof adminFormActionSchema>;

const noteSchema = z
  .string()
  .trim()
  .max(500, 'Use 500 characters or fewer')
  .optional()
  .transform((value) => value || undefined);

/** Body of `POST /api/admin/review/:formId`. The note goes in the log. */
export const adminFormActionInputSchema = z.object({
  action: adminFormActionSchema,
  note: noteSchema,
});
export type AdminFormActionInput = z.input<typeof adminFormActionInputSchema>;

/** Body of `POST /api/admin/users/:userId/suspension`. */
export const adminSuspendUserInputSchema = z.object({
  suspended: z.boolean(),
  note: noteSchema,
});
export type AdminSuspendUserInput = z.input<typeof adminSuspendUserInputSchema>;
