import { z } from 'zod';
import type { FormTemplateId } from './forms/template-ids.js';

/*
 * Onboarding: a two-step welcome after sign-up (what Formyx is for, then templates to match),
 * and a getting-started checklist on the dashboard until its steps are done. Only accounts
 * created since it shipped get either; everyone else's stored state is empty.
 */

/** What someone says they will use Formyx for, in the welcome. */
export const USE_CASES = ['events', 'feedback', 'hiring', 'education', 'orders', 'other'] as const;
export type UseCase = (typeof USE_CASES)[number];
export const useCaseSchema = z.enum(USE_CASES);

export const USE_CASE_LABELS: Record<UseCase, { label: string; description: string }> = {
  events: { label: 'Events', description: 'Registrations, RSVPs and sign-ups' },
  feedback: { label: 'Feedback', description: 'Surveys, NPS and reviews' },
  hiring: { label: 'Hiring and HR', description: 'Applications and internal requests' },
  education: { label: 'Education', description: 'Admissions, courses and quizzes' },
  orders: { label: 'Orders and bookings', description: 'Orders, quotes and appointments' },
  other: { label: 'Something else', description: 'Contact forms and everything else' },
};

/** The templates the welcome suggests for each use, best first. */
export const USE_CASE_TEMPLATES: Record<UseCase, readonly FormTemplateId[]> = {
  events: ['event_registration', 'workshop_signup', 'rsvp'],
  feedback: ['feedback_survey', 'nps_survey', 'customer_satisfaction'],
  hiring: ['job_application', 'internship_application', 'leave_request'],
  education: ['college_admission_enquiry', 'course_registration', 'general_knowledge_quiz'],
  orders: ['order_form', 'appointment_booking', 'quote_request'],
  other: ['contact_form', 'feedback_survey', 'volunteer_signup'],
};

/** What is stored on the account (`users.onboarding`); every field is optional. */
export const onboardingStateSchema = z.object({
  /** Set at sign-up: only these accounts are onboarded. */
  startedAt: z.iso.datetime().optional(),
  useCase: useCaseSchema.optional(),
  /** The welcome was finished or skipped. */
  welcomedAt: z.iso.datetime().optional(),
  /** They first saved a change to a form's design. */
  designedAt: z.iso.datetime().optional(),
  checklistDismissedAt: z.iso.datetime().optional(),
});
export type OnboardingState = z.infer<typeof onboardingStateSchema>;

/** The stored state, or an empty one if it is missing or malformed. */
export function readOnboardingState(stored: unknown): OnboardingState {
  const parsed = onboardingStateSchema.safeParse(stored ?? {});
  return parsed.success ? parsed.data : {};
}

export const ONBOARDING_STEPS = [
  'create_form',
  'customise_design',
  'publish',
  'first_response',
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** What the checklist is worked out from: the person's own forms, and their state. */
export interface OnboardingFacts {
  formsCreated: number;
  formsPublished: number;
  responses: number;
  state: OnboardingState;
}

export function completedSteps(facts: OnboardingFacts): Record<OnboardingStep, boolean> {
  return {
    create_form: facts.formsCreated > 0,
    customise_design: facts.state.designedAt !== undefined,
    publish: facts.formsPublished > 0,
    first_response: facts.responses > 0,
  };
}

const onboardingStepSchema = z.enum(ONBOARDING_STEPS);

/** `GET /api/account/onboarding`. */
export const onboardingResponseSchema = z.object({
  /** Show the welcome now. */
  welcome: z.boolean(),
  useCase: useCaseSchema.nullable(),
  /** Which steps are done; `null` once all are, or dismissed (and for older accounts). */
  checklist: z.record(onboardingStepSchema, z.boolean()).nullable(),
});
export type OnboardingResponse = z.infer<typeof onboardingResponseSchema>;

export function onboardingResponse(facts: OnboardingFacts): OnboardingResponse {
  const { state } = facts;
  const started = state.startedAt !== undefined;
  const steps = completedSteps(facts);
  const done = ONBOARDING_STEPS.every((step) => steps[step]);
  return {
    welcome: started && state.welcomedAt === undefined,
    useCase: state.useCase ?? null,
    checklist: started && !done && state.checklistDismissedAt === undefined ? steps : null,
  };
}

/** `PATCH /api/account/onboarding`. */
export const updateOnboardingInputSchema = z
  .object({
    useCase: useCaseSchema.optional(),
    /** The welcome was finished or skipped. */
    welcomed: z.literal(true).optional(),
    checklistDismissed: z.literal(true).optional(),
  })
  .strict();
export type UpdateOnboardingInput = z.infer<typeof updateOnboardingInputSchema>;

/** The state after `input`, at `now`. Earlier times are kept. */
export function applyOnboardingUpdate(
  state: OnboardingState,
  input: UpdateOnboardingInput,
  now: Date,
): OnboardingState {
  const at = now.toISOString();
  return {
    ...state,
    ...(input.useCase && { useCase: input.useCase }),
    ...(input.welcomed && { welcomedAt: state.welcomedAt ?? at }),
    ...(input.checklistDismissed && { checklistDismissedAt: state.checklistDismissedAt ?? at }),
  };
}
