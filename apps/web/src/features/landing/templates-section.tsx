import { ArrowRight } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CONTAINER,
  SECTION_END,
  SECTION_LEAD,
  SECTION_TITLE,
  SECTION_Y,
} from '@/features/marketing/layout';
import { Reveal } from '@/features/marketing/reveal';
import { cn } from '@/lib/utils';
import { useSeen } from './use-cycle';

const TemplatesRowTiles = lazy(async () => ({
  default: (await import('./templates-row')).TemplatesRowTiles,
}));

/** A tile's place in the row: a fixed width in a scrolling row, a sixth of it on desktops. */
export const TILE_ITEM = 'w-[220px] shrink-0 snap-start lg:w-auto lg:shrink';
const TILE_COUNT = 6;

/** A tile's shape while the row loads: the same box, thumbnail and two lines. */
function TilePlaceholder() {
  return (
    <li className={TILE_ITEM}>
      <span className="flex flex-col gap-3 rounded-xl border bg-card p-2">
        <Skeleton className="aspect-[4/3] w-full rounded-lg" />
        <span className="flex flex-col gap-[5px] px-1 pt-[3px] pb-[5px]">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </span>
      </span>
    </li>
  );
}

export function TemplatesSection() {
  const [row, setRow] = useState<HTMLUListElement | null>(null);
  const ready = useSeen(row);
  const placeholders = Array.from({ length: TILE_COUNT }, (_, index) => (
    <TilePlaceholder key={index} />
  ));
  return (
    <section aria-labelledby="templates-title" className={cn(CONTAINER, SECTION_Y, SECTION_END)}>
      <Reveal className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 id="templates-title" className={SECTION_TITLE}>
            Start from a template
          </h2>
          <p className={SECTION_LEAD}>
            Real forms with their questions written and their look chosen, ready to publish.
          </p>
        </div>
        <Link
          to="/templates"
          className="inline-flex shrink-0 items-center gap-1 self-start rounded-sm text-14 font-medium text-accent hover:underline md:self-auto"
        >
          View all templates
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </Reveal>
      <ul
        ref={setRow}
        aria-label="Templates"
        className="-mx-6 mt-10 flex snap-x scroll-px-6 gap-4 overflow-x-auto px-6 pb-2 md:-mx-8 md:scroll-px-8 md:px-8 lg:mx-0 lg:grid lg:grid-cols-6 lg:overflow-visible lg:px-0 lg:pb-0"
      >
        {ready ? (
          <Suspense fallback={placeholders}>
            <TemplatesRowTiles />
          </Suspense>
        ) : (
          placeholders
        )}
      </ul>
    </section>
  );
}
