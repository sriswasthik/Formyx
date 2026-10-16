import type { FormStatus } from '../forms/api.js';
import type { AccessSettings } from './live-settings.js';

/*
 * Whether a form takes responses right now, worked out the same way for the public page,
 * the dashboard and every request the API checks. The password and one-response-per-person
 * checks need the server's records, so the API makes those itself.
 */

/**
 * `unavailable`: held for review, or taken offline by Formyx (the form or its creator). The
 * public page says only that, without the form's title.
 */
export type ClosedReason =
  'unpublished' | 'closed' | 'response_limit' | 'close_date' | 'unavailable';

export type FormAvailability =
  | { state: 'open' }
  /** Published, but its opening time is still to come. */
  | { state: 'not_open'; opensAt: string }
  | { state: 'closed'; reason: ClosedReason };

export interface AvailabilityInput {
  status: FormStatus;
  access: Pick<AccessSettings, 'opensAt' | 'closesAt' | 'responseLimit'>;
  responseCount: number;
  now?: Date;
}

/**
 * Closed beats not open yet: a form whose limit is reached or whose closing time has passed
 * says so, even if someone also set an opening time.
 */
export function formAvailability({
  status,
  access,
  responseCount,
  now = new Date(),
}: AvailabilityInput): FormAvailability {
  if (status === 'UNDER_REVIEW' || status === 'SUSPENDED') {
    return { state: 'closed', reason: 'unavailable' };
  }
  if (status === 'DRAFT') return { state: 'closed', reason: 'unpublished' };
  if (status === 'CLOSED') return { state: 'closed', reason: 'closed' };
  if (access.responseLimit !== undefined && responseCount >= access.responseLimit) {
    return { state: 'closed', reason: 'response_limit' };
  }
  if (access.closesAt !== undefined && now.getTime() >= new Date(access.closesAt).getTime()) {
    return { state: 'closed', reason: 'close_date' };
  }
  if (access.opensAt !== undefined && now.getTime() < new Date(access.opensAt).getTime()) {
    return { state: 'not_open', opensAt: access.opensAt };
  }
  return { state: 'open' };
}

/** Whether the response that makes `responseCount` fills the form, so it should close. */
export function fillsForm(
  access: Pick<AccessSettings, 'responseLimit'>,
  responseCount: number,
): boolean {
  return access.responseLimit !== undefined && responseCount >= access.responseLimit;
}

/** How email addresses are compared: trimmed and lowercased. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Whether respondents must give an email address, and whether it must be confirmed. */
export function respondentEmailStep(
  access: Pick<AccessSettings, 'requireEmail' | 'oneResponsePer'>,
): 'none' | 'ask' | 'verify' {
  if (access.oneResponsePer === 'email') return 'verify';
  return access.requireEmail ? 'ask' : 'none';
}

export const FORM_PASSWORD_MIN_LENGTH = 4;
/** bcrypt reads at most 72 bytes. */
export const FORM_PASSWORD_MAX_LENGTH = 72;

/** How many tries at a form's password or an emailed code before waiting. */
export const UNLOCK_ATTEMPTS = 10;
export const CODE_ATTEMPTS = 5;
export const VERIFICATION_CODE_LENGTH = 6;
export const VERIFICATION_CODE_MINUTES = 10;
