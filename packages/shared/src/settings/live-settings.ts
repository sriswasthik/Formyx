import { z } from 'zod';
import { NODE_ID_PATTERN } from '../forms/ids.js';
import { httpsImageUrlSchema } from '../theme/images.js';

/*
 * A form's live settings: who may respond and when, who hears about responses, the email
 * respondents get, how links to it look when shared, and how long responses are kept. Unlike
 * the questions and their settings (`FormSettings`), they take effect as soon as they are
 * saved, and they never reach respondents' browsers. Secrets (the password and chat webhook
 * URLs) are stored apart from them, and only ever reported as set or not.
 */

export const RESPONSE_LIMIT_MAX = 1_000_000;
export const CLOSED_MESSAGE_MAX_LENGTH = 2000;
export const MAX_NOTIFICATION_EMAILS = 10;
export const AUTORESPONDER_SUBJECT_MAX_LENGTH = 200;
export const AUTORESPONDER_BODY_MAX_LENGTH = 5000;
export const SOCIAL_TITLE_MAX_LENGTH = 70;
export const SOCIAL_DESCRIPTION_MAX_LENGTH = 200;
export const RETENTION_DAYS_MAX = 3650;

const isoDateTime = z.iso.datetime({ offset: true, error: 'Use an ISO 8601 date and time' });
const emailAddress = z.email('Enter an email address').max(254, 'Use a shorter address');

/**
 * One response per person: `browser` remembers on the respondent's device (easy to get round,
 * by design: no account or email needed); `email` asks for an email address, confirmed with
 * a code, and refuses a second response from it.
 */
export const ONE_RESPONSE_MODES = ['off', 'browser', 'email'] as const;
export type OneResponseMode = (typeof ONE_RESPONSE_MODES)[number];

export const accessSettingsSchema = z
  .object({
    oneResponsePer: z.enum(ONE_RESPONSE_MODES),
    /** Ask for the respondent's email address before the first question. */
    requireEmail: z.boolean(),
    /** Responses are taken from this moment. */
    opensAt: isoDateTime.optional(),
    /** And until this one. */
    closesAt: isoDateTime.optional(),
    /** Shown when the form is closed, full or past its closing time (rich text). */
    closedMessage: z
      .string()
      .max(CLOSED_MESSAGE_MAX_LENGTH, `Use ${CLOSED_MESSAGE_MAX_LENGTH} characters or fewer`)
      .optional(),
    /** Close after this many responses. */
    responseLimit: z
      .number({ error: 'Enter a number' })
      .int('Enter a whole number')
      .min(1, 'Allow at least one response')
      .max(RESPONSE_LIMIT_MAX, 'Use a smaller number')
      .optional(),
    /** Respondents get a private link to change their response while the form is open. */
    allowEdits: z.boolean(),
    /** Kept out of search engines. Forms are only ever found through their link. */
    unlisted: z.boolean(),
  })
  .superRefine((access, ctx) => {
    if (
      access.opensAt !== undefined &&
      access.closesAt !== undefined &&
      new Date(access.closesAt).getTime() <= new Date(access.opensAt).getTime()
    ) {
      ctx.addIssue({ code: 'custom', path: ['closesAt'], message: 'Close after it opens' });
    }
  });
export type AccessSettings = z.infer<typeof accessSettingsSchema>;

export const NOTIFICATION_FREQUENCIES = ['instant', 'daily'] as const;
export type NotificationFrequency = (typeof NOTIFICATION_FREQUENCIES)[number];

export const formNotificationSettingsSchema = z
  .object({
    /** Addresses beyond the members who subscribed, such as a shared inbox. */
    emails: z
      .array(emailAddress)
      .max(MAX_NOTIFICATION_EMAILS, `Add ${MAX_NOTIFICATION_EMAILS} addresses or fewer`),
    /** An email per response, or one a day listing them. Chat messages are always instant. */
    frequency: z.enum(NOTIFICATION_FREQUENCIES),
    /** When the daily digest goes, in the workspace's time zone. */
    digestHour: z.number().int().min(0).max(23),
  })
  .superRefine((notifications, ctx) => {
    const seen = new Set<string>();
    notifications.emails.forEach((email, index) => {
      const key = email.trim().toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({ code: 'custom', path: ['emails', index], message: 'Already added' });
      }
      seen.add(key);
    });
  });
export type FormNotificationSettings = z.infer<typeof formNotificationSettingsSchema>;

/** The email respondents get after sending, with their answers if the form says so. */
export const autoresponderSchema = z.object({
  enabled: z.boolean(),
  /** An email question to send to; `null`: the address asked for before the questions. */
  recipientFieldId: z.string().regex(NODE_ID_PATTERN).nullable(),
  subject: z
    .string()
    .max(
      AUTORESPONDER_SUBJECT_MAX_LENGTH,
      `Use ${AUTORESPONDER_SUBJECT_MAX_LENGTH} characters or fewer`,
    ),
  /** Rich text, with answers and values piped in. */
  body: z
    .string()
    .max(AUTORESPONDER_BODY_MAX_LENGTH, `Use ${AUTORESPONDER_BODY_MAX_LENGTH} characters or fewer`),
  includeAnswers: z.boolean(),
  includeScore: z.boolean(),
  /** The private link to change the response, when the form allows it. */
  includeEditLink: z.boolean(),
  /** Where replies go; the sender's address otherwise. */
  replyTo: emailAddress.optional(),
});
export type AutoresponderSettings = z.infer<typeof autoresponderSchema>;

/** How links to the form look in chats and social posts. */
export const sharingSettingsSchema = z.object({
  socialTitle: z
    .string()
    .trim()
    .max(SOCIAL_TITLE_MAX_LENGTH, `Use ${SOCIAL_TITLE_MAX_LENGTH} characters or fewer`)
    .optional(),
  socialDescription: z
    .string()
    .trim()
    .max(SOCIAL_DESCRIPTION_MAX_LENGTH, `Use ${SOCIAL_DESCRIPTION_MAX_LENGTH} characters or fewer`)
    .optional(),
  /** Replaces the preview image drawn from the theme. */
  socialImageUrl: httpsImageUrlSchema.optional(),
  faviconUrl: httpsImageUrlSchema.optional(),
});
export type SharingSettings = z.infer<typeof sharingSettingsSchema>;

export const dataSettingsSchema = z.object({
  /** Responses older than this are deleted, with their files; `null` keeps them. */
  retentionDays: z
    .number({ error: 'Enter a number of days' })
    .int('Enter a whole number of days')
    .min(1, 'Keep responses at least a day')
    .max(RETENTION_DAYS_MAX, `Use ${RETENTION_DAYS_MAX} days or fewer`)
    .nullable(),
});
export type DataSettings = z.infer<typeof dataSettingsSchema>;

export const liveSettingsSchema = z.object({
  access: accessSettingsSchema,
  notifications: formNotificationSettingsSchema,
  autoresponder: autoresponderSchema,
  sharing: sharingSettingsSchema,
  data: dataSettingsSchema,
});
export type LiveSettings = z.infer<typeof liveSettingsSchema>;
export type LiveSettingsSection = keyof LiveSettings;
export const LIVE_SETTINGS_SECTIONS = [
  'access',
  'notifications',
  'autoresponder',
  'sharing',
  'data',
] as const satisfies readonly LiveSettingsSection[];

export const DEFAULT_AUTORESPONDER_SUBJECT = 'Thanks for your response';
export const DEFAULT_AUTORESPONDER_BODY =
  'Hi,\n\nThanks for filling in our form. Here is a copy of your answers.';

export function createDefaultLiveSettings(
  defaults: { frequency?: NotificationFrequency; emails?: string[] } = {},
): LiveSettings {
  return {
    access: { oneResponsePer: 'off', requireEmail: false, allowEdits: false, unlisted: true },
    notifications: {
      emails: defaults.emails ?? [],
      frequency: defaults.frequency ?? 'instant',
      digestHour: 9,
    },
    autoresponder: {
      enabled: false,
      recipientFieldId: null,
      subject: DEFAULT_AUTORESPONDER_SUBJECT,
      body: DEFAULT_AUTORESPONDER_BODY,
      includeAnswers: true,
      includeScore: true,
      includeEditLink: true,
    },
    sharing: {},
    data: { retentionDays: null },
  };
}

/**
 * Reads stored settings, filling in what is missing with defaults (sections are stored
 * whole, so a section is taken or replaced as one). Anything unreadable falls back to the
 * defaults rather than locking the form's owners out of it.
 */
export function readLiveSettings(stored: unknown): LiveSettings {
  const defaults = createDefaultLiveSettings();
  if (typeof stored !== 'object' || stored === null) return defaults;
  const record = stored as Record<string, unknown>;
  const read = <K extends LiveSettingsSection>(key: K): LiveSettings[K] => {
    const parsed = liveSettingsSchema.shape[key].safeParse(record[key]);
    return parsed.success ? (parsed.data as LiveSettings[K]) : defaults[key];
  };
  return {
    access: read('access'),
    notifications: read('notifications'),
    autoresponder: read('autoresponder'),
    sharing: read('sharing'),
    data: read('data'),
  };
}
