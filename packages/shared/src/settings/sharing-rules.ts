import { z } from 'zod';

/*
 * Rules for what editors type into sharing settings: a form's own address and the chat
 * webhooks responses are posted to.
 */

export const CUSTOM_SLUG_MIN_LENGTH = 3;
export const CUSTOM_SLUG_MAX_LENGTH = 48;
const CUSTOM_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Addresses that would read as Formyx's own pages rather than someone's form. */
const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'embed',
  'formyx',
  'help',
  'login',
  'logout',
  'new',
  'preview',
  'settings',
  'signup',
  'support',
]);

/** A form's address after `/f/`, as editors choose it. */
export const customSlugSchema = z
  .string({ error: 'Enter an address' })
  .trim()
  .toLowerCase()
  .min(CUSTOM_SLUG_MIN_LENGTH, `Use at least ${CUSTOM_SLUG_MIN_LENGTH} characters`)
  .max(CUSTOM_SLUG_MAX_LENGTH, `Use ${CUSTOM_SLUG_MAX_LENGTH} characters or fewer`)
  .regex(CUSTOM_SLUG_PATTERN, 'Use lowercase letters, numbers and single hyphens between them')
  .refine((slug) => !RESERVED_SLUGS.has(slug), 'This address is reserved');

export const CHAT_SERVICES = ['slack', 'discord'] as const;
export type ChatService = (typeof CHAT_SERVICES)[number];

export const CHAT_SERVICE_NAMES: Record<ChatService, string> = {
  slack: 'Slack',
  discord: 'Discord',
};

/**
 * Incoming webhook URLs, and nothing else: posting only to Slack's and Discord's own hosts
 * means a setting can never point the API at another server, private or public.
 */
const CHAT_WEBHOOK_PATTERNS: Record<ChatService, RegExp> = {
  slack: /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/,
  discord:
    /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,30}\/[A-Za-z0-9_-]{20,100}$/,
};

const CHAT_WEBHOOK_EXAMPLES: Record<ChatService, string> = {
  slack: 'https://hooks.slack.com/services/…',
  discord: 'https://discord.com/api/webhooks/…',
};

/** Why `url` is not an incoming webhook of `service`, or `null` if it is. */
export function chatWebhookProblem(service: ChatService, url: string): string | null {
  return CHAT_WEBHOOK_PATTERNS[service].test(url.trim())
    ? null
    : `Paste a ${CHAT_SERVICE_NAMES[service]} incoming webhook URL (${CHAT_WEBHOOK_EXAMPLES[service]})`;
}

/** The end of a webhook URL, enough to recognise it without giving it away. */
export function chatWebhookHint(url: string): string {
  return `…${url.slice(-4)}`;
}
