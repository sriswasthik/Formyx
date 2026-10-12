import { z } from 'zod';
import { currentPasswordSchema, newPasswordSchema } from '../auth.js';
import { isTimeZone } from '../forms/analytics.js';
import { dateFormatSchema, formLanguageSchema } from '../i18n/languages.js';
import {
  MAX_NOTIFICATION_EMAILS,
  NOTIFICATION_FREQUENCIES,
  type FormNotificationSettings,
} from './live-settings.js';

/*
 * Preferences beyond a single form: a workspace's (its time zone, how it writes dates, what
 * notifications new forms start with) and a person's own (how the app looks and moves, the
 * language their new forms start in, and their email).
 */

export const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

export const timeZoneSchema = z
  .string({ error: 'Choose a time zone' })
  .max(64)
  .refine(isTimeZone, 'Choose a time zone');

/** `GET` and `PUT /api/workspaces/:workspaceId/preferences`. */
export const workspacePreferencesSchema = z.object({
  /** Digests go out, and opening and closing times are read, in this time zone. */
  timeZone: timeZoneSchema,
  /** How the dashboard and emails write dates. */
  dateFormat: dateFormatSchema,
  /** What new forms' notifications start as. */
  defaultNotifications: z.object({
    frequency: z.enum(NOTIFICATION_FREQUENCIES),
    emails: z
      .array(z.email('Enter an email address').max(254))
      .max(MAX_NOTIFICATION_EMAILS, `Add ${MAX_NOTIFICATION_EMAILS} addresses or fewer`),
  }),
});
export type WorkspacePreferences = z.infer<typeof workspacePreferencesSchema>;

export function createDefaultWorkspacePreferences(): WorkspacePreferences {
  return {
    timeZone: DEFAULT_TIME_ZONE,
    dateFormat: 'auto',
    defaultNotifications: { frequency: 'instant', emails: [] },
  };
}

/** Reads stored preferences, falling back to the defaults for anything unreadable. */
export function readWorkspacePreferences(stored: unknown): WorkspacePreferences {
  const parsed = workspacePreferencesSchema.safeParse(stored);
  return parsed.success ? parsed.data : createDefaultWorkspacePreferences();
}

/** New forms' notification settings, from the workspace's defaults. */
export function defaultFormNotifications(
  preferences: WorkspacePreferences,
): Pick<FormNotificationSettings, 'frequency' | 'emails'> {
  return {
    frequency: preferences.defaultNotifications.frequency,
    emails: preferences.defaultNotifications.emails,
  };
}

export const APP_THEMES = ['system', 'light', 'dark'] as const;
/** `system` follows the device's setting; `reduce` and `full` override it in the app. */
export const MOTION_PREFERENCES = ['system', 'reduce', 'full'] as const;
export type MotionPreference = (typeof MOTION_PREFERENCES)[number];

/** `GET` and `PUT /api/account/preferences`. */
export const accountPreferencesSchema = z.object({
  theme: z.enum(APP_THEMES),
  reducedMotion: z.enum(MOTION_PREFERENCES),
  /** The language new forms start in. The app itself is in English. */
  language: formLanguageSchema,
  /** Subscribe me to emails about responses to forms I create (each can be changed). */
  emailOnNewForms: z.boolean(),
  /**
   * Count my use of features (creating, publishing, premium looks) in product analytics,
   * under an id that can't be traced back to me. Off: nothing about me is sent.
   */
  productAnalytics: z.boolean(),
});
export type AccountPreferences = z.infer<typeof accountPreferencesSchema>;

export function createDefaultAccountPreferences(): AccountPreferences {
  return {
    theme: 'system',
    reducedMotion: 'system',
    language: 'en',
    emailOnNewForms: false,
    productAnalytics: true,
  };
}

export function readAccountPreferences(stored: unknown): AccountPreferences {
  const defaults = createDefaultAccountPreferences();
  if (typeof stored !== 'object' || stored === null) return defaults;
  const parsed = accountPreferencesSchema.safeParse({ ...defaults, ...stored });
  return parsed.success ? parsed.data : defaults;
}

/** Body of `POST /api/account/password`. Other sessions are signed out. */
export const changePasswordInputSchema = z
  .object({ currentPassword: currentPasswordSchema, newPassword: newPasswordSchema })
  .refine((input) => input.newPassword !== input.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password you have not used here',
  });
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;

/** Body of `POST /api/account/delete`. */
export const deleteAccountInputSchema = z.object({ password: currentPasswordSchema });
export type DeleteAccountInput = z.infer<typeof deleteAccountInputSchema>;

/** `details` of the 409 refusing to delete an account that is a workspace's only owner. */
export const soleOwnerDetailsSchema = z.object({
  workspaces: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type SoleOwnerDetails = z.infer<typeof soleOwnerDetailsSchema>;
