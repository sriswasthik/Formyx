import { ArrowRight } from 'lucide-react';
import { m, type Variants } from 'motion/react';
import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { isDemoOffered } from '@/features/demo/demo-api';
import { TryDemoButton } from '@/features/demo/try-demo-button';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { FeatureSection } from './feature-section';
import { PricingTeaser, TemplatesBand } from './landing-sections';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

// The live form is the heaviest part of the page: it loads after the hero has painted.
const LookPlayground = lazy(async () => ({
  default: (await import('@/features/marketing/look-playground')).LookPlayground,
}));

const heroContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const heroItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE_STANDARD } },
};

/** Holds the demo's place while it loads, at its size, so nothing below it jumps. */
function DemoPlaceholder() {
  return (
    <div
      role="status"
      aria-label="Loading the demo"
      className="flex flex-col overflow-hidden rounded-xl border bg-background"
    >
      <div className="flex gap-2 border-b px-3 py-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-20" />
        ))}
      </div>
      <Skeleton className="h-[min(38rem,72dvh)] rounded-none" />
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 pt-16 pb-20 md:px-10 md:pt-28 md:pb-28">
          <m.div
            initial="hidden"
            animate="visible"
            variants={heroContainer}
            className="mx-auto flex max-w-3xl flex-col items-center text-center"
          >
            <m.h1
              variants={heroItem}
              className="text-32 font-semibold tracking-tighter text-balance md:text-40"
            >
              Build forms people actually enjoy filling in.
            </m.h1>
            <m.p variants={heroItem} className="mt-5 max-w-xl text-16 text-muted-foreground">
              Drag questions into place, give the form your own look, add logic, and watch responses
              arrive live.
            </m.p>
            <m.div
              variants={heroItem}
              className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row"
            >
              <Button asChild size="lg">
                <Link to="/signup">
                  Start building
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              {isDemoOffered() ? (
                <TryDemoButton />
              ) : (
                <Button asChild size="lg" variant="secondary">
                  <a href="#features">See how it works</a>
                </Button>
              )}
            </m.div>
          </m.div>

          <m.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.slow, ease: EASE_STANDARD, delay: 0.18 }}
            className="mx-auto mt-14 max-w-4xl md:mt-20"
          >
            <Suspense fallback={<DemoPlaceholder />}>
              <LookPlayground templateId="workshop_signup" />
            </Suspense>
            <p className="mt-3 text-center text-13 text-muted-foreground">
              A real Formyx form. Switch its look, then fill it in: it is drawn exactly as your
              respondents would see it.
            </p>
          </m.div>
        </section>
        <FeatureSection />
        <TemplatesBand />
        <PricingTeaser />
      </main>
      <SiteFooter />
    </div>
  );
}
