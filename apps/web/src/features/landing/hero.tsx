import { TRIAL_DAYS } from '@formyx/shared';
import { ArrowRight } from 'lucide-react';
import { lazy, startTransition, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LATEST_CHANGELOG_TITLE } from '@/features/changelog/latest';
import { CONTAINER } from '@/features/marketing/layout';
import { cn } from '@/lib/utils';
import { PRODUCT_FRAME_CLASS } from './product-frame-size';

// The editor picture is the heaviest part of the page: it loads after the hero has painted.
const loadFrame = () => import('./product-frame');
const ProductFrame = lazy(async () => ({ default: (await loadFrame()).ProductFrame }));

/** Holds the frame's place while it loads, at its size, so nothing below it moves. */
function FramePlaceholder() {
  return (
    <div role="status" aria-label="Loading the editor preview" className={PRODUCT_FRAME_CLASS}>
      <div className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="ml-auto h-8 w-24" />
      </div>
      <div className="flex-1 bg-muted p-3 sm:p-6">
        <Skeleton className="h-full rounded-xl" />
      </div>
    </div>
  );
}

/**
 * Whether to draw the editor picture yet: once the page has loaded, in a transition, so its
 * rendering comes after the page's and in small slices rather than one long task.
 */
function useFrameReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Its code downloads now; only drawing it waits.
    void loadFrame();
    const show = () => {
      startTransition(() => {
        setReady(true);
      });
    };
    if (document.readyState === 'complete') {
      show();
      return;
    }
    window.addEventListener('load', show, { once: true });
    return () => {
      window.removeEventListener('load', show);
    };
  }, []);
  return ready;
}

/**
 * The top of the landing page: what is new, the promise, the two ways in and the editor with
 * a form in it. Drawn without an entrance animation, so the headline paints at once.
 * `framePlaceholder` draws only the frame's placeholder, for the build's HTML copy.
 */
export function Hero({ framePlaceholder = false }: { framePlaceholder?: boolean }) {
  const frameReady = useFrameReady();
  return (
    <section
      aria-labelledby="hero-title"
      className={cn(CONTAINER, 'pt-10 pb-16 md:pt-16 md:pb-24')}
    >
      <div className="flex flex-col items-center text-center">
        <Link
          to="/changelog"
          className="group inline-flex h-8 items-center gap-2 rounded-full border bg-background pr-3 pl-1 text-13 transition-colors duration-150 ease-standard hover:border-border-strong hover:bg-hover active:bg-pressed"
        >
          <span className="rounded-full bg-muted px-2 py-0.5 text-12 font-medium">New</span>{' '}
          <span className="text-muted-foreground group-hover:text-foreground">
            {LATEST_CHANGELOG_TITLE}
          </span>
          <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
        </Link>
        <h1
          id="hero-title"
          className="mt-6 text-[2.25rem]/[2.625rem] font-semibold tracking-display text-balance sm:text-40 md:text-56 lg:text-64"
        >
          Build forms people actually enjoy filling in.
        </h1>
        <p className="mt-5 max-w-[560px] text-16 text-muted-foreground md:text-18">
          Design beautiful forms, add smart logic and watch responses arrive live. Free to start,
          with {TRIAL_DAYS} days of Pro.
        </p>
        <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
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
        <p className="mt-4 text-13 text-muted-foreground">No credit card required.</p>
      </div>
      <div className="mt-12 md:mt-16">
        {framePlaceholder || !frameReady ? (
          <FramePlaceholder />
        ) : (
          <Suspense fallback={<FramePlaceholder />}>
            <ProductFrame />
          </Suspense>
        )}
      </div>
    </section>
  );
}
