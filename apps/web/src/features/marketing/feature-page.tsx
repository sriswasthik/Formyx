import { FEATURES, hasFeature, PLAN_LABELS, TRIAL_DAYS, type FeatureId } from '@formyx/shared';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { m } from 'motion/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SiteFooter } from '@/features/landing/site-footer';
import { SiteHeader } from '@/features/landing/site-header';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { FEATURE_PAGE_LINKS } from './feature-links';

export interface FeaturePoint {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Marks the point with the plan it needs, from the entitlement registry. */
  featureId?: FeatureId;
}

interface FeaturePageProps {
  /** Its path, so "More features" leaves it out. */
  path: string;
  eyebrow: string;
  title: string;
  lede: string;
  visual: ReactNode;
  pointsTitle: string;
  points: readonly FeaturePoint[];
}

/** A plan badge for something that needs a paid plan, read from the entitlement registry. */
export function PlanBadge({ featureId }: { featureId: FeatureId }) {
  if (hasFeature('FREE', featureId)) return null;
  return <Badge>{PLAN_LABELS[FEATURES[featureId].minPlan]}</Badge>;
}

/** One of the marketing feature pages: a promise, something to see, and what it includes. */
export function FeaturePage({
  path,
  eyebrow,
  title,
  lede,
  visual,
  pointsTitle,
  points,
}: FeaturePageProps) {
  const others = FEATURE_PAGE_LINKS.filter((link) => link.path !== path);

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 pt-12 pb-12 md:px-10 md:pt-20">
          <div className="max-w-3xl">
            <p className="text-13 font-medium text-accent">{eyebrow}</p>
            <h1 className="mt-3 text-32 font-semibold tracking-tighter text-balance md:text-40">
              {title}
            </h1>
            <p className="mt-4 text-16 text-muted-foreground">{lede}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link to="/signup">
                  Start for free
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link to="/templates">Browse templates</Link>
              </Button>
            </div>
          </div>
          <div className="mt-12">{visual}</div>
        </section>

        <section aria-labelledby="points-title" className="border-t">
          <div className="mx-auto max-w-6xl px-6 py-16 md:px-10 md:py-24">
            <h2 id="points-title" className="text-24 font-semibold tracking-tight">
              {pointsTitle}
            </h2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {points.map(({ icon: Icon, title: pointTitle, description, featureId }, index) => (
                <m.li
                  key={pointTitle}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-64px' }}
                  transition={{
                    duration: DURATION.slow,
                    ease: EASE_STANDARD,
                    delay: (index % 3) * 0.06,
                  }}
                  className="rounded-xl border bg-card p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg border">
                      <Icon aria-hidden />
                    </div>
                    {featureId && <PlanBadge featureId={featureId} />}
                  </div>
                  <h3 className="mt-5 text-16 font-semibold tracking-tight">{pointTitle}</h3>
                  <p className="mt-2 text-14 text-muted-foreground">{description}</p>
                </m.li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="more-title" className="border-t">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-16 md:flex-row md:items-start md:justify-between md:px-10">
            <div className="max-w-md">
              <h2 id="more-title" className="text-20 font-semibold tracking-tight">
                Try it on your own form
              </h2>
              <p className="mt-2 text-14 text-muted-foreground">
                Free to start, no card needed. Every new account gets {TRIAL_DAYS} days of Pro.
              </p>
              <Button asChild className="mt-5">
                <Link to="/signup">Create your first form</Link>
              </Button>
            </div>
            <nav aria-label="More features" className="flex flex-col gap-2 md:w-80">
              {others.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className="group flex items-center justify-between rounded-lg border p-4 transition-colors duration-150 ease-standard hover:border-border-strong hover:bg-hover"
                >
                  <span>
                    <span className="block text-14 font-medium">{link.label}</span>
                    <span className="block text-13 text-muted-foreground">{link.summary}</span>
                  </span>
                  <ArrowRight
                    className="shrink-0 text-muted-foreground transition-transform duration-150 ease-standard group-hover:translate-x-0.5 motion-reduce:transition-none"
                    aria-hidden
                  />
                </Link>
              ))}
            </nav>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
