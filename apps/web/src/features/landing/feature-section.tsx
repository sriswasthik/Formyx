import {
  Activity,
  ArrowRight,
  GitBranch,
  MousePointerClick,
  Palette,
  Plug,
  Share2,
  type LucideIcon,
} from 'lucide-react';
import { m } from 'motion/react';
import { Link } from 'react-router';
import { DURATION, EASE_STANDARD } from '@/lib/motion';

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Its own page, if it has one. */
  path?: string;
}

const FEATURES: Feature[] = [
  {
    icon: MousePointerClick,
    title: 'Drag-and-drop builder',
    description:
      'Nearly thirty kinds of question, from short answers to signatures, uploads and voice notes, placed by dragging.',
  },
  {
    icon: Palette,
    title: 'Design Studio',
    description:
      'Backgrounds, gradients, textures, fonts and layouts, with ready-made looks and contrast checked as you go.',
    path: '/features/design-studio',
  },
  {
    icon: GitBranch,
    title: 'Logic',
    description:
      'Show and hide questions, jump between pages, calculate totals and score quizzes, all without code.',
    path: '/features/logic',
  },
  {
    icon: Activity,
    title: 'Live responses',
    description:
      'Answers appear the moment they are sent, with charts for every question and where people stopped.',
  },
  {
    icon: Plug,
    title: 'Integrations',
    description:
      'Every response in Google Sheets, Notion, Slack, Discord or your own server, as it arrives.',
    path: '/features/integrations',
  },
  {
    icon: Share2,
    title: 'Share anywhere',
    description: 'A link, a QR code, or a few lines to embed the form on your own site.',
  },
];

export function FeatureSection() {
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-8 border-t">
      <div className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="features-title" className="text-24 font-semibold tracking-tight md:text-32">
            Everything you need, nothing you don&apos;t
          </h2>
          <p className="mt-3 text-16 text-muted-foreground">
            A focused toolkit for collecting better answers.
          </p>
        </div>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 md:mt-16 lg:grid-cols-3 lg:gap-6">
          {FEATURES.map(({ icon: Icon, title, description, path }, index) => (
            <m.li
              key={title}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-64px' }}
              transition={{
                duration: DURATION.slow,
                ease: EASE_STANDARD,
                delay: (index % 3) * 0.06,
              }}
              className="relative flex flex-col rounded-xl border bg-card p-6 transition-colors duration-150 ease-standard has-[a:hover]:border-border-strong"
            >
              <div className="flex size-9 items-center justify-center rounded-lg border text-foreground">
                <Icon aria-hidden />
              </div>
              <h3 className="mt-5 text-16 font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-14 text-muted-foreground">{description}</p>
              {path && (
                <Link
                  to={path}
                  className="mt-4 inline-flex items-center gap-1 self-start rounded-sm text-14 font-medium text-accent after:absolute after:inset-0 after:rounded-xl hover:underline focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring"
                >
                  More about {title}
                  <ArrowRight aria-hidden />
                </Link>
              )}
            </m.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
