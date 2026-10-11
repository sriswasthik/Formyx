import { z } from 'zod';

/*
 * Template ids on their own, so the form API schemas (which public forms load) never pull in
 * the templates themselves.
 */

export const FORM_TEMPLATE_IDS = ['blank', 'event_registration', 'feedback_survey'] as const;
export const formTemplateIdSchema = z.enum(FORM_TEMPLATE_IDS);
export type FormTemplateId = z.infer<typeof formTemplateIdSchema>;
