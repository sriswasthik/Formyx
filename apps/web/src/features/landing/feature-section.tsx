import { Activity, GitBranch, MousePointerClick, type LucideIcon } from 'lucide-react';
import { m } from 'motion/react';
import { DURATION, EASE_STANDARD } from '@/lib/motion';

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: MousePointerClick,
    title: 'Drag-and-drop builder',
    description:
      'Compose forms from ready-made fields and reorder them in seconds. What you see is exactly what respondents get.',
  },
  {
    icon: GitBranch,
    title: 'Conditional logic',
    description:
      'Show, hide or skip questions based on earlier answers, so every respondent only sees what matters to them.',
  },
  {
    icon: Activity,
    title: 'Live responses',
    description:
      'Responses appear the moment they are submitted, with analytics that summarise the trends at a glance.',
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
        <ul className="mt-12 grid gap-4 md:mt-16 md:grid-cols-3 md:gap-6">
          {FEATURES.map(({ icon: Icon, title, description }, index) => (
            <m.li
              key={title}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-64px' }}
              transition={{ duration: DURATION.slow, ease: EASE_STANDARD, delay: index * 0.06 }}
              className="rounded-xl border bg-card p-6"
            >
              <div className="flex size-9 items-center justify-center rounded-lg border text-foreground">
                <Icon aria-hidden />
              </div>
              <h3 className="mt-5 text-16 font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-14 text-muted-foreground">{description}</p>
            </m.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
