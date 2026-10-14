/*
 * The marketing feature pages, for the header, the footer, each page's "More features" and
 * the build's list of public pages. Plain data: the build reads it in Node.
 */

export interface FeaturePageLink {
  path: string;
  label: string;
  summary: string;
  /** The page's own title and description, for search results and link previews. */
  seoTitle: string;
  seoDescription: string;
}

export const FEATURE_PAGE_LINKS: readonly FeaturePageLink[] = [
  {
    path: '/features/design-studio',
    label: 'Design Studio',
    summary: 'Backgrounds, fonts and layouts',
    seoTitle: 'Design Studio: beautiful forms in your brand',
    seoDescription:
      'Give every form its own look with Formyx: ready-made looks, mesh gradients, textures, shapes, fonts and layouts, with contrast checked as you go.',
  },
  {
    path: '/features/logic',
    label: 'Logic',
    summary: 'Forms that react to answers',
    seoTitle: 'Conditional logic, jumps and calculations',
    seoDescription:
      'Show or hide questions, jump between pages, calculate totals and score quizzes in Formyx, without writing code.',
  },
  {
    path: '/features/integrations',
    label: 'Integrations',
    summary: 'Sheets, Notion, Slack and more',
    seoTitle: 'Integrations: Google Sheets, Notion, Slack and webhooks',
    seoDescription:
      'Send every Formyx response to Google Sheets, Notion, Slack, Discord, email or your own webhook, the moment it arrives.',
  },
];
