import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { isDemoOffered } from '@/features/demo/demo-api';
import { TryDemoButton } from '@/features/demo/try-demo-button';
import { CONTAINER, SECTION_END, SECTION_TITLE, SECTION_Y } from '@/features/marketing/layout';
import { Reveal } from '@/features/marketing/reveal';
import { cn } from '@/lib/utils';

/** The last word: one heading and the way in, plus the live demo where it is offered. */
export function CtaBand() {
  return (
    <section aria-labelledby="cta-title" className="border-t below-fold">
      <Reveal
        className={cn(CONTAINER, SECTION_Y, SECTION_END, 'flex flex-col items-center text-center')}
      >
        <h2 id="cta-title" className={SECTION_TITLE}>
          Your next form deserves better.
        </h2>
        <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
          <Button asChild size="lg">
            <Link to="/signup">
              Start for free
              <ArrowRight aria-hidden />
            </Link>
          </Button>
          {isDemoOffered() && <TryDemoButton />}
        </div>
      </Reveal>
    </section>
  );
}
