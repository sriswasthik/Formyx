import { z } from 'zod';

/** Why someone reports a form, from the "Report this form" link on every public form. */
export const REPORT_REASONS = ['phishing', 'spam', 'offensive', 'other'] as const;
export const reportReasonSchema = z.enum(REPORT_REASONS);
export type ReportReason = z.infer<typeof reportReasonSchema>;

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  phishing: 'It asks for passwords, bank or card details',
  spam: 'It is spam or a scam',
  offensive: 'It is hateful, violent or explicit',
  other: 'Something else',
};

export const REPORT_DETAILS_MAX_LENGTH = 1000;

/** Body of `POST /api/public/forms/:slug/report`. Anyone may send it; no account needed. */
export const reportFormInputSchema = z.object({
  reason: reportReasonSchema,
  details: z
    .string()
    .trim()
    .max(REPORT_DETAILS_MAX_LENGTH, `Use ${REPORT_DETAILS_MAX_LENGTH} characters or fewer`)
    .optional()
    .transform((value) => value || undefined),
});
export type ReportFormInput = z.input<typeof reportFormInputSchema>;
