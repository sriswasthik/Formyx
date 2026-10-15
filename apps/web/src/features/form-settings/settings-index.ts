import {
  Bell,
  Database,
  MailCheck,
  Palette,
  Settings2,
  Share2,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

/*
 * Every setting on the page, by section: what the section nav lists, what search looks
 * through (labels and the words people might use for them), and what deep links point at
 * (`?section=access&setting=password`).
 */

export const SETTINGS_SECTIONS = [
  'general',
  'access',
  'experience',
  'notifications',
  'autoresponder',
  'sharing',
  'data',
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const SECTION_INFO: Record<
  SettingsSection,
  { label: string; description: string; icon: LucideIcon }
> = {
  general: {
    label: 'General',
    description: 'The basics of the form.',
    icon: Settings2,
  },
  access: {
    label: 'Access',
    description: 'Who can respond, how often and when. Changes apply at once.',
    icon: ShieldCheck,
  },
  experience: {
    label: 'Respondent experience',
    description: 'How the form reads and behaves for respondents.',
    icon: Palette,
  },
  notifications: {
    label: 'Notifications',
    description: 'Who hears about new responses by email, and how often.',
    icon: Bell,
  },
  autoresponder: {
    label: 'Autoresponder',
    description: 'An email respondents get after they send the form.',
    icon: MailCheck,
  },
  sharing: {
    label: 'Sharing and SEO',
    description: "The form's address, how its link looks when shared, and links that fill it in.",
    icon: Share2,
  },
  data: {
    label: 'Data',
    description: 'How long responses are kept, and taking them out.',
    icon: Database,
  },
};

export interface SettingEntry {
  id: string;
  section: SettingsSection;
  label: string;
  /** Other words people search for it by. */
  keywords: string;
}

export const SETTINGS: SettingEntry[] = [
  { id: 'title', section: 'general', label: 'Title', keywords: 'name rename heading' },
  { id: 'submit-text', section: 'general', label: 'Submit button text', keywords: 'button send' },
  { id: 'password', section: 'access', label: 'Password', keywords: 'lock protect private secret' },
  {
    id: 'one-response',
    section: 'access',
    label: 'One response per person',
    keywords: 'duplicate once single verify otp code email limit',
  },
  {
    id: 'require-email',
    section: 'access',
    label: "Ask for respondents' email",
    keywords: 'email address collect',
  },
  {
    id: 'captcha',
    section: 'access',
    label: 'Spam check',
    keywords: 'captcha turnstile cloudflare bots robots spam',
  },
  {
    id: 'schedule',
    section: 'access',
    label: 'Opening and closing times',
    keywords: 'schedule date time open close deadline start end',
  },
  {
    id: 'closed-message',
    section: 'access',
    label: 'Closed message',
    keywords: 'closed text message ended',
  },
  {
    id: 'response-limit',
    section: 'access',
    label: 'Response limit',
    keywords: 'maximum cap number of responses close',
  },
  {
    id: 'edits',
    section: 'access',
    label: 'Changing responses',
    keywords: 'edit change update link after submitting',
  },
  {
    id: 'unlisted',
    section: 'access',
    label: 'Search engines',
    keywords: 'unlisted index google seo noindex hidden',
  },
  {
    id: 'language',
    section: 'experience',
    label: 'Language',
    keywords: 'telugu hindi english translate locale',
  },
  { id: 'date-format', section: 'experience', label: 'Date format', keywords: 'dates dd mm yyyy' },
  {
    id: 'number-format',
    section: 'experience',
    label: 'Number format',
    keywords: 'numbers commas decimals currency lakh',
  },
  { id: 'progress-bar', section: 'experience', label: 'Progress bar', keywords: 'progress steps' },
  {
    id: 'question-numbers',
    section: 'experience',
    label: 'Question numbers',
    keywords: 'numbering letters',
  },
  {
    id: 'required-marker',
    section: 'experience',
    label: 'Required questions',
    keywords: 'asterisk star required optional marker',
  },
  {
    id: 'save-progress',
    section: 'experience',
    label: 'Saving progress',
    keywords: 'autosave save later resume draft',
  },
  {
    id: 'badge',
    section: 'experience',
    label: '"Made with Formyx"',
    keywords: 'badge branding powered by logo remove',
  },
  {
    id: 'my-email',
    section: 'notifications',
    label: 'Email me',
    keywords: 'notify me new response alert',
  },
  {
    id: 'extra-emails',
    section: 'notifications',
    label: 'Other addresses',
    keywords: 'recipients team inbox email notify',
  },
  {
    id: 'frequency',
    section: 'notifications',
    label: 'How often',
    keywords: 'digest daily instant summary',
  },
  {
    id: 'chat',
    section: 'notifications',
    label: 'Slack, Discord, Google Sheets and webhooks',
    keywords: 'chat channel integrations notion spreadsheet webhook zapier',
  },
  {
    id: 'autoresponder',
    section: 'autoresponder',
    label: 'Autoresponder email',
    keywords: 'confirmation receipt thank you email copy of answers',
  },
  {
    id: 'slug',
    section: 'sharing',
    label: 'Form address',
    keywords: 'url link slug custom address',
  },
  {
    id: 'social',
    section: 'sharing',
    label: 'Link preview',
    keywords: 'social open graph og image title description twitter whatsapp',
  },
  { id: 'favicon', section: 'sharing', label: 'Favicon', keywords: 'icon tab browser' },
  {
    id: 'prefill',
    section: 'sharing',
    label: 'Prefilled link',
    keywords: 'prefill url parameters fill in answers',
  },
  { id: 'qr', section: 'sharing', label: 'QR code', keywords: 'qr print poster scan' },
  {
    id: 'retention',
    section: 'data',
    label: 'Delete responses automatically',
    keywords: 'retention auto delete days privacy gdpr',
  },
  { id: 'ip', section: 'data', label: 'IP addresses', keywords: 'ip privacy tracking store' },
  {
    id: 'export',
    section: 'data',
    label: 'Download responses',
    keywords: 'export csv excel xlsx download',
  },
  {
    id: 'delete-all',
    section: 'data',
    label: 'Delete all responses',
    keywords: 'clear erase remove reset',
  },
];

/** Settings whose label or keywords contain every word of `query`. */
export function searchSettings(query: string): SettingEntry[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return SETTINGS.filter((setting) => {
    const haystack =
      `${setting.label} ${setting.keywords} ${SECTION_INFO[setting.section].label}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** The id a setting's row carries, for deep links and search. */
export const settingAnchor = (id: string) => `setting-${id}`;

export function isSettingsSection(value: string | null): value is SettingsSection {
  return value !== null && SETTINGS_SECTIONS.some((section) => section === value);
}
