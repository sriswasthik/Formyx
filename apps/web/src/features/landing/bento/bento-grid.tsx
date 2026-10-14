import { ArrowRight } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router';
import { CONTAINER, SECTION_LEAD, SECTION_TITLE, SECTION_Y } from '@/features/marketing/layout';
import { Reveal } from '@/features/marketing/reveal';
import { cn } from '@/lib/utils';
import { useSeen } from '../use-cycle';

type PictureName =
  | 'DesignStudioPicture'
  | 'ConversationalPicture'
  | 'LogicPicture'
  | 'ResponsesPicture'
  | 'QuizPicture'
  | 'IntegrationsPicture';

/** One chunk for all six pictures, asked for once the grid nears the screen. */
const loadPictures = () => import('./illustrations');
const pictures = Object.fromEntries(
  (
    [
      'DesignStudioPicture',
      'ConversationalPicture',
      'LogicPicture',
      'ResponsesPicture',
      'QuizPicture',
      'IntegrationsPicture',
    ] as const
  ).map((name) => [name, lazy(async () => ({ default: (await loadPictures())[name] }))]),
) as Record<PictureName, React.LazyExoticComponent<() => React.ReactNode>>;

interface Feature {
  title: string;
  text: string;
  picture: PictureName;
  /** Its own page, when it has one. */
  path?: string;
  /** Columns taken on wide screens (of 3) and tablets (of 2). */
  span: string;
}

const FEATURES: readonly Feature[] = [
  {
    title: 'Design Studio',
    text: 'Mesh gradients, textures, shapes and fonts, with every preset checked for readable contrast.',
    picture: 'DesignStudioPicture',
    path: '/features/design-studio',
    span: 'md:col-span-2',
  },
  {
    title: 'Conversational mode',
    text: 'One question per screen, answered with a tap or the keyboard.',
    picture: 'ConversationalPicture',
    span: '',
  },
  {
    title: 'Smart logic',
    text: 'Show questions, jump between pages and end on the screen that fits each answer.',
    picture: 'LogicPicture',
    path: '/features/logic',
    span: '',
  },
  {
    title: 'Live responses',
    text: 'Answers arrive as they are sent, ready to chart, filter and export to CSV or Excel.',
    picture: 'ResponsesPicture',
    span: 'lg:col-span-2',
  },
  {
    title: 'Quizzes that mark themselves',
    text: 'Score answers on the server, set a pass mark and show the end screen each score earns.',
    picture: 'QuizPicture',
    span: '',
  },
  {
    title: 'Integrations',
    text: 'Every response in Google Sheets, Notion, Slack or Discord, or sent to your own webhook.',
    picture: 'IntegrationsPicture',
    path: '/features/integrations',
    span: 'md:col-span-2',
  },
];

/** The space a picture takes, the same before and after it loads. */
const PICTURE_BOX = 'relative h-64 overflow-hidden border-b bg-muted';

function FeatureCard({
  feature,
  ready,
  delay,
}: {
  feature: Feature;
  ready: boolean;
  delay: number;
}) {
  const Picture = pictures[feature.picture];
  return (
    <li className={cn('flex', feature.span)}>
      <Reveal
        delay={delay}
        className="relative flex w-full flex-col overflow-hidden rounded-xl border bg-card transition-colors duration-150 ease-standard hover:border-border-strong"
      >
        <div className={PICTURE_BOX}>
          {ready && (
            <Suspense fallback={null}>
              <Picture />
            </Suspense>
          )}
        </div>
        <div className="flex flex-1 flex-col p-6 md:p-8">
          <h3 className="text-16 font-semibold tracking-tight">{feature.title}</h3>
          <p className="mt-2 max-w-md text-14 text-muted-foreground">{feature.text}</p>
          {feature.path && (
            <Link
              to={feature.path}
              className="mt-4 inline-flex items-center gap-1 self-start rounded-sm text-14 font-medium text-accent hover:underline"
            >
              More about {feature.title}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </div>
      </Reveal>
    </li>
  );
}

export function BentoGrid() {
  const [grid, setGrid] = useState<HTMLUListElement | null>(null);
  const ready = useSeen(grid);
  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className={cn(CONTAINER, SECTION_Y, 'scroll-mt-16')}
    >
      <Reveal>
        <h2 id="features-title" className={SECTION_TITLE}>
          Everything a good form needs
        </h2>
        <p className={SECTION_LEAD}>
          A look of its own, questions that follow the answers, and responses you can act on.
        </p>
      </Reveal>
      <ul
        ref={setGrid}
        className="mt-10 grid grid-cols-1 gap-4 md:mt-12 md:grid-cols-2 lg:grid-cols-3 lg:gap-6"
      >
        {FEATURES.map((feature, index) => (
          <FeatureCard
            key={feature.title}
            feature={feature}
            ready={ready}
            delay={(index % 3) * 0.06}
          />
        ))}
      </ul>
    </section>
  );
}
