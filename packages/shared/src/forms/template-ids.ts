import { z } from 'zod';

/*
 * Template ids on their own, so the form API schemas (which public forms load) never pull in
 * the templates themselves.
 */

/** Saved with nothing, but stable: links to the gallery and onboarding name them. */
export const FORM_TEMPLATE_IDS = [
  'blank',
  'event_registration',
  'rsvp',
  'wedding_rsvp',
  'workshop_signup',
  'webinar_registration',
  'speaker_application',
  'feedback_survey',
  'nps_survey',
  'customer_satisfaction',
  'event_feedback',
  'website_feedback',
  'restaurant_feedback',
  'job_application',
  'internship_application',
  'employee_onboarding',
  'leave_request',
  'exit_interview',
  'employee_engagement',
  'college_admission_enquiry',
  'course_registration',
  'course_evaluation',
  'scholarship_application',
  'parent_teacher_meeting',
  'order_form',
  'catering_order',
  'quote_request',
  'appointment_booking',
  'contact_form',
  'bug_report',
  'general_knowledge_quiz',
  'safety_training_quiz',
  'volunteer_signup',
  'membership_application',
  'donation_pledge',
] as const;
export const formTemplateIdSchema = z.enum(FORM_TEMPLATE_IDS);
export type FormTemplateId = z.infer<typeof formTemplateIdSchema>;
