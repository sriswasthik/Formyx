/*
 * The help articles for the page someone is on, for the "?" menu: the editor offers design
 * and publishing, the responses page explains responses, and so on.
 */

const CONTEXT: readonly { pattern: RegExp; slugs: string[] }[] = [
  {
    pattern: /^\/app\/forms\/[^/]+\/edit$/,
    slugs: ['design-studio', 'show-and-hide-questions', 'publish-and-share'],
  },
  { pattern: /^\/app\/forms\/[^/]+\/responses$/, slugs: ['see-your-responses'] },
  {
    pattern: /^\/app\/forms\/[^/]+\/integrations$/,
    slugs: ['google-sheets-and-notion', 'slack-discord-and-webhooks'],
  },
  {
    pattern: /^\/app\/forms\/[^/]+\/settings$/,
    slugs: ['form-settings', 'notifications-and-autoresponders'],
  },
  { pattern: /^\/app\/settings\/billing$/, slugs: ['plans-and-billing'] },
  { pattern: /^\/app\/settings\/workspace$/, slugs: ['workspaces-and-teammates'] },
  { pattern: /^\/app\/settings\/referrals$/, slugs: ['refer-a-friend'] },
  { pattern: /^\/app(\/forms)?\/?$/, slugs: ['create-your-first-form', 'publish-and-share'] },
];

/** The slugs of the articles about `pathname`, most useful first; none for other pages. */
export function contextualHelp(pathname: string): string[] {
  return CONTEXT.find(({ pattern }) => pattern.test(pathname))?.slugs ?? [];
}
