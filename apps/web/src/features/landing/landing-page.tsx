import { ArrowRight } from 'lucide-react';
import { m, type Variants } from 'motion/react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { isDemoOffered } from '@/features/demo/demo-api';
import { TryDemoButton } from '@/features/demo/try-demo-button';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { FeatureSection } from './feature-section';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

const heroContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const heroItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE_STANDARD } },
};

export function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 pt-20 pb-24 md:px-10 md:pt-32 md:pb-32">
          <m.div
            initial="hidden"
            animate="visible"
            variants={heroContainer}
            className="mx-auto flex max-w-3xl flex-col items-center text-center"
          >
            <m.h1 variants={heroItem} className="text-32 font-semibold tracking-tighter md:text-40">
              Build forms people actually enjoy filling in.
            </m.h1>
            <m.p variants={heroItem} className="mt-5 max-w-xl text-16 text-muted-foreground">
              Drag fields into place, add conditional logic and watch responses arrive live.
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
        </section>
        <FeatureSection />
      </main>
      <SiteFooter />
    </div>
  );
}
