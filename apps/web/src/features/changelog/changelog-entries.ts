/*
 * The public changelog (/changelog), newest first. Add an entry when something people can
 * see ships, and keep its id: the app's "What's new" dot compares ids (see latest.ts).
 */

export interface ChangelogEntry {
  /** Stable and unique, e.g. `2026-10-integrations`. */
  id: string;
  /** ISO date it shipped. */
  date: string;
  title: string;
  summary: string;
  items: string[];
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    id: '2026-10-brand',
    date: '2026-10-14',
    title: 'A new logo',
    summary: 'An F made of the things Formyx is made of: two inputs and a checkbox.',
    items: [
      'The new logo across the site, the app and every email, drawn to stay sharp down to 16px.',
      'Formyx can be added to a phone’s home screen, with its own icon.',
      'Embedded forms show “Made with Formyx” too, opening in a new tab, unless the badge is turned off.',
      'A new picture for links to Formyx shared in chats and posts.',
    ],
  },
  {
    id: '2026-10-launch',
    date: '2026-10-13',
    title: 'Templates, a help centre and a warmer welcome',
    summary: 'Easier to start, easier to find your way, and a reason to tell a friend.',
    items: [
      'A template gallery with 34 forms in seven categories, each with a live preview you can fill in.',
      'A short welcome for new accounts, and a getting-started checklist on the dashboard.',
      'A help centre with a guide to every feature, and a “Help” menu in the app and the editor.',
      'Refer a friend: they get 60 days of Pro, and you get a month free when they first pay.',
      'A few helpful emails, each with a one-click way to stop them; turn them off in Preferences.',
    ],
  },
  {
    id: '2026-10-beta',
    date: '2026-10-12',
    title: 'Beta: feedback, changelog and a sturdier Formyx',
    summary: 'Formyx is in open beta. Tell us what works and what doesn’t, straight from the app.',
    items: [
      'A Feedback button in the sidebar: ideas, problems or anything else, read by the team.',
      'This changelog, with a dot on “What’s new” when something ships.',
      'Rate limits on every endpoint and stricter checks on where webhooks may go.',
      'Faster first paint for forms with heavy themes on slow phones.',
      'A “Share feature usage” switch in Preferences, on by default and easy to turn off.',
    ],
  },
  {
    id: '2026-10-integrations',
    date: '2026-10-12',
    title: 'Integrations: Google Sheets, Notion, Slack and Discord',
    summary: 'Every response, copied where your team already works, as it arrives.',
    items: [
      'Google Sheets: a sheet per form, a row per response, new questions as new columns.',
      'Notion: a database with a typed property for each question.',
      'Richer Slack and Discord messages with the answers and a link to the response.',
      'An Integrations page per form, with each connection’s status and failed jobs to retry.',
    ],
  },
  {
    id: '2026-10-settings',
    date: '2026-10-12',
    title: 'Form settings, languages and access',
    summary: 'Decide who can answer, how often, and in which language.',
    items: [
      'Passwords, one response per email address, response limits and closing dates.',
      'Forms in Hindi, Telugu and more, with prefilled links and private edit links.',
      'Autoresponder emails, daily digests and Excel export.',
      'Account and workspace preferences, saved across devices.',
    ],
  },
  {
    id: '2026-10-logic',
    date: '2026-10-11',
    title: 'Logic: pages, jumps, quizzes and end screens',
    summary: 'Forms that react to answers, and quizzes marked on the server.',
    items: [
      'Pages with jumps, calculated values and answers recalled in later questions.',
      'Quiz scoring with pass marks, and end screens chosen by the answers.',
      'Save and resume later, by email.',
      'A drop-off funnel in Responses.',
    ],
  },
  {
    id: '2026-10-fields',
    date: '2026-10-11',
    title: '21 new question types',
    summary: 'From signatures and voice notes to rankings, matrices and addresses.',
    items: [
      'Signatures, file uploads, voice notes, ratings, scales, rankings and matrices.',
      'Phone numbers by country and Indian addresses filled in from the PIN code.',
      'Images, videos and dividers to lay a form out.',
      'Hidden fields filled from the form’s link.',
    ],
  },
  {
    id: '2026-10-styles',
    date: '2026-10-11',
    title: 'Typography, styles and the conversational layout',
    summary: 'One question at a time, and the type and details to match your brand.',
    items: [
      'A conversational layout that asks one question at a time.',
      'Forty open-licence fonts, with pairings.',
      'Styles for inputs, choices, buttons and progress bars.',
      'Brand kits, and a theme drawn from your logo’s colours.',
    ],
  },
  {
    id: '2026-10-design-studio',
    date: '2026-10-05',
    title: 'The Design Studio',
    summary: 'Backgrounds with depth, and twelve presets to start from.',
    items: [
      'Layered backgrounds: mesh gradients, textures, shapes and images.',
      'Twelve presets, each checked for readable text and controls.',
      'A readability warning with one-click fixes.',
    ],
  },
];
