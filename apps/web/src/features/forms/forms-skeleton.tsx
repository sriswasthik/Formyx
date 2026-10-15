import { Skeleton } from '@/components/ui/skeleton';
import { FORMS_GRID } from './forms-collection';
import type { FormsView } from './view-store';

/** The toolbar's shape while the forms load: search, status tabs, sort and layout. */
export function ToolbarSkeleton() {
  return (
    <div aria-hidden className="flex flex-wrap items-center gap-3">
      <Skeleton className="h-9 w-full rounded-lg sm:w-64" />
      <Skeleton className="h-9 w-72 max-w-full rounded-lg" />
      <div className="ml-auto flex gap-2">
        <Skeleton className="h-9 w-9 rounded-lg md:w-32" />
        <Skeleton className="h-9 w-[4.25rem] rounded-lg" />
      </div>
    </div>
  );
}

/** The forms' shape while they load, card for card or row for row. */
export function FormsSkeleton({ view }: { view: FormsView }) {
  if (view === 'list') {
    return (
      <div role="status" aria-label="Loading forms" className="rounded-xl border">
        <div className="hidden h-[33px] border-b bg-surface @2xl:block" />
        <div className="divide-y">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex min-h-16 items-center gap-3 px-4 py-3 @2xl:gap-4">
              <Skeleton className="size-10 shrink-0 rounded-md" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-48 max-w-[60%]" />
                <Skeleton className="h-3 w-32 @2xl:hidden" />
              </div>
              <Skeleton className="hidden h-4 w-[7rem] @2xl:block" />
              <Skeleton className="hidden h-4 w-[10rem] @2xl:block" />
              <Skeleton className="hidden h-4 w-[9rem] @2xl:block" />
              <span className="w-8" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div role="status" aria-label="Loading forms" className={FORMS_GRID}>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex flex-col overflow-hidden rounded-xl border">
          <Skeleton className="aspect-[16/10] rounded-none border-b" />
          <div className="flex flex-col gap-2 p-4">
            <div className="flex h-8 items-center">
              <Skeleton className="h-4 w-2/3" />
            </div>
            <div className="flex h-5 items-center gap-3">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="ml-auto h-3.5 w-24" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
