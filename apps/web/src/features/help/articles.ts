/*
 * The help centre's articles (/help). Plain data: the build reads it in Node to give each
 * article its own page title (src/app/public-pages.ts), and the app links to them by slug from
 * the "?" menu. Keep the steps in step with the app's own labels.
 */

export const HELP_CATEGORIES = [
  { id: 'start', label: 'Getting started' },
  { id: 'design', label: 'Design' },
  { id: 'logic', label: 'Logic and quizzes' },
  { id: 'responses', label: 'Responses' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'account', label: 'Account, teams and billing' },
] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number]['id'];

export type HelpBlock =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'steps'; items: string[] }
  | { type: 'list'; items: string[] }
  | { type: 'tip'; text: string };

export interface HelpArticle {
  slug: string;
  title: string;
  /** One line, for the list and search results. */
  summary: string;
  category: HelpCategory;
  /** Other words people search with. */
  keywords: string[];
  body: HelpBlock[];
}

export const HELP_ARTICLES: readonly HelpArticle[] = [
  {
    slug: 'create-your-first-form',
    title: 'Create your first form',
    summary: 'Start from a template or a blank page, add questions and preview it.',
    category: 'start',
    keywords: ['new form', 'template', 'blank', 'start', 'build'],
    body: [
      {
        type: 'p',
        text: 'Every form starts on the Forms page. You can begin with a blank form, or with one of our templates, which come with their questions and their own look.',
      },
      {
        type: 'steps',
        items: [
          'On the Forms page, press New form.',
          'Pick Blank form, or search the templates by name or category, then press Create form.',
          'The editor opens. Add questions from the list on the left, or drag them onto the form.',
          'Press a question to change its label, help text and options, and to make it required.',
          'Switch to Preview at the top to try the form as respondents will see it.',
        ],
      },
      {
        type: 'tip',
        text: 'Everything saves as you go. Undo and Redo are at the top of the editor: Ctrl+Z and Ctrl+Shift+Z, or ⌘Z and ⌘⇧Z on a Mac.',
      },
    ],
  },
  {
    slug: 'question-types',
    title: 'Questions and blocks',
    summary: 'The kinds of question you can ask, and blocks that show text, images and video.',
    category: 'start',
    keywords: [
      'field',
      'question type',
      'upload',
      'signature',
      'rating',
      'statement',
      'page break',
    ],
    body: [
      {
        type: 'p',
        text: 'The list on the left of the editor groups every question type. Search it by name or by what you want to ask.',
      },
      {
        type: 'list',
        items: [
          'Text and contact: short and long answers, email, phone, website and address.',
          'Choice: single and multiple choice, dropdowns, picture choices, yes or no, and ranking.',
          'Rating and scales: stars, net promoter score, opinion scales, sliders and matrices.',
          'Numbers, dates and times: numbers, currency, dates, date ranges and times.',
          'Uploads and media: file uploads, signatures and voice notes.',
          'Content and layout: statements, images, videos, dividers and page breaks, which show something and ask nothing.',
        ],
      },
      {
        type: 'tip',
        text: 'Hidden fields carry a value from the form’s link, such as where a respondent came from, without showing anything.',
      },
    ],
  },
  {
    slug: 'publish-and-share',
    title: 'Publish and share a form',
    summary: 'Make a form live, then share its link, a QR code or embed it on your site.',
    category: 'start',
    keywords: ['publish', 'share', 'link', 'qr code', 'embed', 'website', 'iframe'],
    body: [
      {
        type: 'p',
        text: 'A form is a draft until you publish it. Respondents only ever see what was published; changes you make afterwards stay in the draft until you press Publish changes.',
      },
      {
        type: 'steps',
        items: [
          'In the editor, press Publish at the top right. If something needs fixing first, Formyx lists it.',
          'The share window opens: press Copy link to share the public link.',
          'Download the QR code to print it on posters and tables.',
          'Choose Embed to copy a few lines of code that put the form on your own website.',
        ],
      },
      {
        type: 'tip',
        text: 'To stop taking responses, open the publishing options next to Publish and choose Close form. You can reopen it at any time.',
      },
    ],
  },
  {
    slug: 'design-studio',
    title: 'Design your form',
    summary: 'Use the Design Studio for looks, colours, fonts, backgrounds and layouts.',
    category: 'design',
    keywords: ['theme', 'colour', 'color', 'font', 'background', 'gradient', 'layout', 'look'],
    body: [
      {
        type: 'p',
        text: 'Open the Design tab in the editor’s side panel. The preview beside it shows exactly what respondents will see, on any screen.',
      },
      {
        type: 'steps',
        items: [
          'Start from a ready-made look, or keep the one your template came with.',
          'Change the colours and fonts. If text becomes hard to read, the Studio says so and offers a fix.',
          'Build the background in layers: a colour, a photo, a mesh gradient, a texture or shapes.',
          'Pick a layout: all questions on one page, a card, a split screen with an image, or one question at a time.',
        ],
      },
      {
        type: 'tip',
        text: 'Some fonts, textures, shapes and layouts are part of Pro. They are marked in the Studio, and on the free plan your form shows the closest free choice instead.',
      },
    ],
  },
  {
    slug: 'brand-kits',
    title: 'Brand kits',
    summary: 'Save your logo, colours and fonts once and start every new form in them.',
    category: 'design',
    keywords: ['brand', 'logo', 'kit', 'default look'],
    body: [
      {
        type: 'p',
        text: 'A brand kit keeps your logo, colours and fonts together, so every form looks like yours without setting it up again.',
      },
      {
        type: 'steps',
        items: [
          'Design a form the way you like it.',
          'In the Design Studio, choose Save as brand kit and give it a name.',
          'Apply the kit to any other form from the Studio, or make it the workspace’s default for new forms.',
        ],
      },
    ],
  },
  {
    slug: 'show-and-hide-questions',
    title: 'Show and hide questions',
    summary: 'Ask a question only when an earlier answer calls for it.',
    category: 'logic',
    keywords: ['condition', 'conditional', 'logic', 'skip', 'branch', 'if'],
    body: [
      {
        type: 'p',
        text: 'A condition on a question shows it only when an earlier answer matches, so people see just what applies to them.',
      },
      {
        type: 'steps',
        items: [
          'Select the question that should appear only sometimes.',
          'In its settings, add a condition: pick an earlier question, how to compare, and the answer.',
          'Add more conditions if needed, and choose whether all or any of them must match.',
          'Use Preview to try both paths.',
        ],
      },
      {
        type: 'tip',
        text: 'A question that is hidden is never required, even if it is marked as required.',
      },
    ],
  },
  {
    slug: 'pages-jumps-and-calculations',
    title: 'Pages, jumps and calculations',
    summary: 'Split a form into pages, send people to different pages, and work out totals.',
    category: 'logic',
    keywords: ['page', 'jump', 'route', 'calculate', 'total', 'variable', 'end screen', 'redirect'],
    body: [
      {
        type: 'p',
        text: 'Add a page break to split a form into pages. The Logic tab in the editor then shows every page, with where each one leads.',
      },
      {
        type: 'list',
        items: [
          'Jumps send people from a page to another one, or straight to the end, depending on their answers.',
          'Values count and add up as people answer: a price total, a score, a number of guests. Show them in later questions or on the end screen.',
          'End screens can differ by answer, and can send people on to another web page.',
        ],
      },
      {
        type: 'tip',
        text: 'Jumps, values and several end screens are part of Pro. Formyx checks for loops and pages nobody can reach before you publish.',
      },
    ],
  },
  {
    slug: 'quizzes',
    title: 'Make a quiz',
    summary: 'Mark answers right or wrong, give points and show a score.',
    category: 'logic',
    keywords: ['quiz', 'score', 'points', 'correct answer', 'test', 'exam'],
    body: [
      {
        type: 'steps',
        items: [
          'In the Logic tab, open Quiz and turn on Quiz mode.',
          'For each question to mark, choose the right answer and how many points it is worth.',
          'Choose whether to show the score, a pass mark, and whether to reveal the right answers afterwards.',
        ],
      },
      {
        type: 'p',
        text: 'Answers are marked on our servers, so the right answers never reach the respondent’s browser before they finish.',
      },
    ],
  },
  {
    slug: 'see-your-responses',
    title: 'See and download responses',
    summary: 'Read responses as they arrive, see a summary of each question, and export them.',
    category: 'responses',
    keywords: [
      'responses',
      'results',
      'summary',
      'export',
      'csv',
      'excel',
      'download',
      'analytics',
    ],
    body: [
      {
        type: 'p',
        text: 'Open a form’s Responses page. New responses appear the moment they are sent, without reloading.',
      },
      {
        type: 'list',
        items: [
          'Summary shows a chart for every question, views, completion rate, and where people stopped.',
          'Responses lists each one in full, and you can search them.',
          'To download them, open the form’s Settings, then Data, and choose Download responses (CSV, or Excel on Pro).',
        ],
      },
    ],
  },
  {
    slug: 'notifications-and-autoresponders',
    title: 'Email notifications and autoresponders',
    summary: 'Get an email for each response or a daily digest, and email respondents a copy.',
    category: 'responses',
    keywords: [
      'email',
      'notification',
      'digest',
      'autoresponder',
      'confirmation',
      'thank you email',
    ],
    body: [
      {
        type: 'steps',
        items: [
          'Open the form’s Settings, then Notifications.',
          'Turn on Email me, and choose each response or a daily digest under How often.',
          'Add other addresses to tell your team too.',
          'Under Autoresponder, write an email that goes to each respondent: a thank-you, or a copy of their answers.',
        ],
      },
      {
        type: 'tip',
        text: 'The autoresponder needs an email question in the form, so Formyx knows where to send it.',
      },
    ],
  },
  {
    slug: 'google-sheets-and-notion',
    title: 'Send responses to Google Sheets or Notion',
    summary: 'Every response becomes a row in a sheet, or a page in a Notion database.',
    category: 'integrations',
    keywords: ['google sheets', 'spreadsheet', 'notion', 'database', 'sync', 'integration'],
    body: [
      {
        type: 'steps',
        items: [
          'Open the form’s Integrations page.',
          'Press Connect Google Sheets (or Connect Notion) and sign in to allow Formyx to write.',
          'Pick or create the sheet or database. Responses you already have are copied over.',
        ],
      },
      {
        type: 'p',
        text: 'New questions become new columns. If Google or Notion is down, Formyx keeps trying; anything that still fails is listed on the Integrations page, ready to send again.',
      },
    ],
  },
  {
    slug: 'slack-discord-and-webhooks',
    title: 'Slack, Discord and webhooks',
    summary: 'Post responses to a channel, or send them to your own server.',
    category: 'integrations',
    keywords: ['slack', 'discord', 'webhook', 'api', 'zapier', 'make', 'channel'],
    body: [
      {
        type: 'list',
        items: [
          'Slack and Discord: make an incoming webhook for the channel in Slack or Discord, then paste its URL on the form’s Integrations page.',
          'Webhooks: press Add webhook and enter your server’s address. Each response is sent as JSON, signed so you can check it came from Formyx.',
        ],
      },
      {
        type: 'tip',
        text: 'On a webhook, press Send test event to check your server before real responses arrive.',
      },
    ],
  },
  {
    slug: 'form-settings',
    title: 'Passwords, limits and closing dates',
    summary: 'Decide who can answer, how often, and until when.',
    category: 'account',
    keywords: ['password', 'limit', 'close', 'schedule', 'one response', 'private', 'access'],
    body: [
      {
        type: 'p',
        text: 'Open the form’s Settings, then Access.',
      },
      {
        type: 'list',
        items: [
          'Password: respondents enter it before they see the form.',
          'One response per person: by browser, or by a verified email address.',
          'Opening and closing times: the form opens and closes on its own.',
          'Response limit: the form closes after a number of responses.',
          'Closed message: what people see when it is closed.',
        ],
      },
    ],
  },
  {
    slug: 'workspaces-and-teammates',
    title: 'Workspaces and teammates',
    summary: 'Invite people to a workspace as owners, editors or viewers.',
    category: 'account',
    keywords: ['team', 'invite', 'member', 'role', 'workspace', 'editor', 'viewer', 'owner'],
    body: [
      {
        type: 'p',
        text: 'Forms belong to a workspace. Everyone starts with their own, and can make more for a team or a client.',
      },
      {
        type: 'list',
        items: [
          'Owners manage members, billing and the workspace itself.',
          'Editors build, publish and change forms.',
          'Viewers see forms and their responses, and change nothing.',
        ],
      },
      {
        type: 'steps',
        items: [
          'Open Settings, then Workspace.',
          'Press Invite people, enter their email addresses and choose a role.',
        ],
      },
    ],
  },
  {
    slug: 'plans-and-billing',
    title: 'Plans, trials and billing',
    summary: 'What each plan includes, how the trial works, and how to change or cancel.',
    category: 'account',
    keywords: [
      'plan',
      'pro',
      'business',
      'price',
      'trial',
      'upgrade',
      'cancel',
      'invoice',
      'refund',
    ],
    body: [
      {
        type: 'p',
        text: 'Plans belong to a workspace. New accounts get a free trial of Pro for their first workspace, without a card.',
      },
      {
        type: 'steps',
        items: [
          'Open Settings, then Billing, to see your plan, usage and payments.',
          'Choose a plan and pay with a card, UPI or another method through Razorpay.',
          'To cancel, use Cancel plan on the same page. It keeps working to the end of the period you paid for.',
        ],
      },
      {
        type: 'tip',
        text: 'Going back to Free never deletes anything. Forms keep working, with free stand-ins for Pro looks.',
      },
    ],
  },
  {
    slug: 'refer-a-friend',
    title: 'Refer a friend',
    summary: 'Give a friend a longer trial, and get a free month when they pay.',
    category: 'account',
    keywords: ['referral', 'invite a friend', 'free month', 'link', 'reward'],
    body: [
      {
        type: 'steps',
        items: [
          'Open Settings, then Referrals, and copy your link.',
          'Your friend signs up through it and gets a longer trial of Pro.',
          'When they first pay for a plan, you get a month free: a month of Pro, or your next payment skipped if you already pay.',
        ],
      },
    ],
  },
];

export function helpArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((article) => article.slug === slug);
}

/** The words of an article, for searching. */
function searchText(article: HelpArticle): string {
  const body = article.body
    .map((block) => ('text' in block ? block.text : block.items.join(' ')))
    .join(' ');
  return `${article.title} ${article.summary} ${article.keywords.join(' ')} ${body}`.toLowerCase();
}

/**
 * Articles matching every word of `query`, best first: title matches, then summary and
 * keywords, then the body.
 */
export function searchHelp(query: string): HelpArticle[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...HELP_ARTICLES];
  const score = (article: HelpArticle) =>
    words.reduce((total, word) => {
      if (article.title.toLowerCase().includes(word)) return total + 3;
      if (`${article.summary} ${article.keywords.join(' ')}`.toLowerCase().includes(word)) {
        return total + 2;
      }
      return total + 1;
    }, 0);
  return HELP_ARTICLES.filter((article) => {
    const text = searchText(article);
    return words.every((word) => text.includes(word));
  }).sort((a, b) => score(b) - score(a));
}
