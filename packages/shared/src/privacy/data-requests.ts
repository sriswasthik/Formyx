import { z } from 'zod';

/*
 * Every request about personal data is logged for Formyx's admins (DPDP readiness): who
 * asked, what for, and how it ended. Respondents' addresses are never kept in the log.
 */

export const DATA_REQUEST_KINDS = [
  'ACCOUNT_EXPORT',
  'ACCOUNT_DELETION',
  'RESPONDENT_LOOKUP',
  'RESPONDENT_DELETION',
] as const;
export type DataRequestKind = (typeof DATA_REQUEST_KINDS)[number];

export const DATA_REQUEST_STATUSES = ['OPEN', 'DONE', 'CANCELLED', 'FAILED'] as const;
export type DataRequestStatus = (typeof DATA_REQUEST_STATUSES)[number];

/** How each kind reads in the admin log. */
export const DATA_REQUEST_LABELS: Record<DataRequestKind, string> = {
  ACCOUNT_EXPORT: 'Data export',
  ACCOUNT_DELETION: 'Account deletion',
  RESPONDENT_LOOKUP: 'Respondent lookup',
  RESPONDENT_DELETION: 'Respondent deletion',
};

/** One row of `GET /api/admin/data-requests`. */
export const adminDataRequestSchema = z.object({
  id: z.string(),
  kind: z.enum(DATA_REQUEST_KINDS),
  status: z.enum(DATA_REQUEST_STATUSES),
  /** Who asked, or null once their account is gone. */
  requester: z.object({ id: z.string(), email: z.string() }).nullable(),
  workspaceId: z.string().nullable(),
  /** Counts and choices, never personal data: `{ responses: 3 }`, `{ workspacesDeleted: 1 }`. */
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});
export type AdminDataRequest = z.infer<typeof adminDataRequestSchema>;

export const adminDataRequestsSchema = z.object({
  requests: z.array(adminDataRequestSchema),
});
export type AdminDataRequests = z.infer<typeof adminDataRequestsSchema>;
