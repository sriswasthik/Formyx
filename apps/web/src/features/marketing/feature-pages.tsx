import { FONTS, THEME_PRESETS, type FeatureId } from '@formyx/shared';
import {
  Bell,
  Blend,
  Calculator,
  Contrast,
  Download,
  Eye,
  FileSpreadsheet,
  Flag,
  GraduationCap,
  Hash,
  Layers,
  LayoutTemplate,
  Link2,
  Mail,
  MessagesSquare,
  MonitorSmartphone,
  NotebookText,
  Palette,
  Quote,
  RotateCw,
  Route,
  Sheet,
  ShieldCheck,
  SwatchBook,
  Type,
  Webhook,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { FeaturePage, PlanBadge, type FeaturePoint } from './feature-page';
import { FEATURE_PAGE_LINKS } from './feature-links';
import { LookPlayground } from './look-playground';

function linkFor(path: string) {
  const link = FEATURE_PAGE_LINKS.find((candidate) => candidate.path === path);
  if (!link) throw new Error(`No feature page at ${path}`);
  return link;
}

// Design Studio

const DESIGN_POINTS: FeaturePoint[] = [
  {
    icon: Palette,
    title: 'Ready-made looks',
    description: `${String(THEME_PRESETS.length)} looks to start from, each checked so its text and buttons stay easy to read.`,
  },
  {
    icon: Layers,
    title: 'Backgrounds in layers',
    description:
      'Colours, photos, textures and shapes, stacked and blended. Drag a layer up or down to change what sits on top.',
  },
  {
    icon: Blend,
    title: 'Mesh gradients',
    description: 'Soft, many-coloured backgrounds, with colour points you drag into place.',
    featureId: 'mesh_gradients',
  },
  {
    icon: Type,
    title: 'Fonts that fit',
    description: `${String(FONTS.length)} fonts, in pairings that work for headings and questions, from quiet to expressive.`,
  },
  {
    icon: LayoutTemplate,
    title: 'Layouts',
    description:
      'All questions on one page, a card, a split screen with an image, or one question at a time.',
  },
  {
    icon: SwatchBook,
    title: 'Brand kits',
    description: 'Save your logo, colours and fonts once, and start every new form in them.',
  },
  {
    icon: Contrast,
    title: 'Readable by design',
    description:
      'Contrast is checked as you design. If text gets hard to read, the Studio says so and offers a fix.',
  },
  {
    icon: MonitorSmartphone,
    title: 'The same everywhere',
    description:
      'Respondents see exactly what you designed: on phones, on desktops, and embedded on your site.',
  },
];

export function DesignStudioPage() {
  const link = linkFor('/features/design-studio');
  return (
    <FeaturePage
      path={link.path}
      eyebrow="Design Studio"
      title="Forms that look like your brand, not like a form builder"
      lede="Give every form its own look: backgrounds, colours, fonts, buttons and layouts, with ready-made looks to start from. Pick one below and fill the form in."
      visual={
        <LookPlayground
          templateId="event_registration"
          presetIds={[
            'minimal',
            'paper',
            'midnight',
            'sea-glass',
            'sunrise-mesh',
            'blueprint',
            'botanical',
            'pastel-blobs',
          ]}
        />
      }
      pointsTitle="Everything the Studio does"
      points={DESIGN_POINTS}
    />
  );
}

// Logic

function Token({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md border bg-muted px-1.5 py-0.5 font-medium text-foreground">
      {children}
    </span>
  );
}

const LOGIC_EXAMPLES: {
  icon: LucideIcon;
  label: string;
  rule: ReactNode;
  featureId?: FeatureId;
}[] = [
  {
    icon: Eye,
    label: 'Show a question',
    rule: (
      <>
        Show <Token>Dietary needs</Token> when <Token>Staying for dinner?</Token> is{' '}
        <Token>Yes</Token>
      </>
    ),
  },
  {
    icon: Route,
    label: 'Jump to a page',
    rule: (
      <>
        After <Token>Your details</Token>, go to <Token>Sorry to miss you</Token> when{' '}
        <Token>Attending?</Token> is <Token>No</Token>
      </>
    ),
    featureId: 'advanced_logic',
  },
  {
    icon: Calculator,
    label: 'Calculate',
    rule: (
      <>
        Set <Token>Total</Token> to <Token>Tickets</Token> × <Token>₹500</Token>, then show it on
        the last page
      </>
    ),
    featureId: 'advanced_logic',
  },
  {
    icon: Quote,
    label: 'Recall an answer',
    rule: (
      <>
        Ask <Token>Thanks, {'{Name}'}! How did you hear about us?</Token>
      </>
    ),
  },
];

function LogicIllustration() {
  return (
    <figure className="rounded-xl border bg-card p-4 md:p-6">
      <ol className="flex flex-col gap-3">
        {LOGIC_EXAMPLES.map(({ icon: Icon, label, rule, featureId }) => (
          <li
            key={label}
            className="flex flex-col gap-3 rounded-lg border bg-background p-4 sm:flex-row sm:items-center"
          >
            <span className="flex w-44 shrink-0 items-center gap-2 text-13 font-medium text-muted-foreground">
              <Icon aria-hidden />
              {label}
            </span>
            <span className="min-w-0 flex-1 text-14 leading-loose">{rule}</span>
            {featureId && (
              <span className="shrink-0">
                <PlanBadge featureId={featureId} />
              </span>
            )}
          </li>
        ))}
      </ol>
      <figcaption className="mt-4 text-13 text-muted-foreground">
        Rules read like sentences. Pick the questions and answers from lists: no code, no formulas
        to remember.
      </figcaption>
    </figure>
  );
}

const LOGIC_POINTS: FeaturePoint[] = [
  {
    icon: Eye,
    title: 'Show and hide questions',
    description: 'Ask only what matters to each person, based on what they have already answered.',
  },
  {
    icon: Route,
    title: 'Page jumps',
    description:
      'Send people to different pages, or straight to the end, depending on their answers.',
    featureId: 'advanced_logic',
  },
  {
    icon: Calculator,
    title: 'Calculations',
    description: 'Add up prices, count points and work out totals as people answer.',
    featureId: 'advanced_logic',
  },
  {
    icon: GraduationCap,
    title: 'Quizzes',
    description:
      'Mark answers right or wrong and show a score. Answers are checked on our servers, so they can’t be peeked at.',
    featureId: 'quiz_mode',
  },
  {
    icon: Flag,
    title: 'End screens by answer',
    description:
      'Thank people differently, or send them on to another page, depending on how it went.',
    featureId: 'advanced_logic',
  },
  {
    icon: Link2,
    title: 'Prefilled and hidden fields',
    description: 'Fill answers in from the link, or carry a source or a reference along unseen.',
  },
];

export function LogicPage() {
  const link = linkFor('/features/logic');
  return (
    <FeaturePage
      path={link.path}
      eyebrow="Logic"
      title="Forms that react to every answer"
      lede="Show and hide questions, jump between pages, work out totals and score quizzes. Logic in Formyx reads like a sentence, and it is checked for loops and dead ends before you publish."
      visual={<LogicIllustration />}
      pointsTitle="What logic can do"
      points={LOGIC_POINTS}
    />
  );
}

// Integrations

const INTEGRATIONS: {
  icon: LucideIcon;
  name: string;
  description: string;
  featureId?: FeatureId;
}[] = [
  {
    icon: Sheet,
    name: 'Google Sheets',
    description: 'A row per response, a column per question.',
    featureId: 'google_sheets',
  },
  {
    icon: NotebookText,
    name: 'Notion',
    description: 'A database with a typed property per question.',
    featureId: 'notion',
  },
  {
    icon: Hash,
    name: 'Slack',
    description: 'Each response, posted to a channel.',
    featureId: 'chat_notifications',
  },
  {
    icon: MessagesSquare,
    name: 'Discord',
    description: 'Each response, posted to a channel.',
    featureId: 'chat_notifications',
  },
  { icon: Webhook, name: 'Webhooks', description: 'Signed JSON to your own server.' },
  { icon: Mail, name: 'Email', description: 'To you and your team, as responses arrive.' },
  {
    icon: FileSpreadsheet,
    name: 'Excel and CSV',
    description: 'Download every response, any time.',
  },
];

function IntegrationsGrid() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {INTEGRATIONS.map(({ icon: Icon, name, description, featureId }) => (
        <li key={name} className="flex flex-col rounded-xl border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg border">
              <Icon aria-hidden />
            </div>
            {featureId && <PlanBadge featureId={featureId} />}
          </div>
          <h2 className="mt-4 text-14 font-medium">{name}</h2>
          <p className="mt-1 text-13 text-muted-foreground">{description}</p>
        </li>
      ))}
    </ul>
  );
}

const INTEGRATION_POINTS: FeaturePoint[] = [
  {
    icon: Zap,
    title: 'As it happens',
    description: 'Responses reach your sheet, database or channel within seconds of being sent.',
  },
  {
    icon: RotateCw,
    title: 'Nothing lost',
    description:
      'If a service is down, Formyx keeps trying. Anything that still fails is listed, ready to send again.',
  },
  {
    icon: Sheet,
    title: 'Keeps up with your form',
    description:
      'Add a question and Google Sheets gets a new column. Change a label and it follows.',
    featureId: 'google_sheets',
  },
  {
    icon: ShieldCheck,
    title: 'Signed webhooks',
    description: 'Every webhook is signed, so your server can check it really came from Formyx.',
  },
  {
    icon: Bell,
    title: 'Autoresponders',
    description: 'Send each respondent a copy of their answers, or a thank-you, by email.',
    featureId: 'autoresponder',
  },
  {
    icon: Download,
    title: 'Export any time',
    description: 'Download responses as CSV, or as an Excel workbook with proper columns.',
    featureId: 'excel_export',
  },
];

export function IntegrationsPage() {
  const link = linkFor('/features/integrations');
  return (
    <FeaturePage
      path={link.path}
      eyebrow="Integrations"
      title="Every response, where your team already works"
      lede="Connect a form to Google Sheets, Notion, Slack, Discord or your own server in a few clicks. Responses arrive as they are sent, and nothing is lost if a service is down."
      visual={<IntegrationsGrid />}
      pointsTitle="Built to be relied on"
      points={INTEGRATION_POINTS}
    />
  );
}
