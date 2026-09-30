import { Skeleton } from '@/components/ui/skeleton';
import type { FormsView } from './view-store';

export function FormsSkeleton({ view }: { view: FormsView }) {
  if (view === 'list') {
    return (
      <div role="status" aria-label="Loading forms" className="rounded-xl border">
        <div className="hidden h-8 border-b bg-surface @2xl:block" />
        <div className="divide-y">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex h-14 items-center gap-4 px-4">
              <Skeleton className="h-4 w-48 max-w-[50%]" />
              <Skeleton className="ml-auto hidden h-5 w-16 @2xl:block" />
              <Skeleton className="hidden h-4 w-20 @2xl:block" />
              <Skeleton className="hidden h-4 w-24 @2xl:block" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label="Loading forms"
      className="grid gap-4 @lg:grid-cols-2 @3xl:grid-cols-3"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex min-h-36 flex-col rounded-xl border p-5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="mt-2 h-4 w-1/2" />
          <div className="mt-auto flex gap-2 pt-6">
            <Skeleton className="h-5 w-14" />
            <Skeleton className="h-5 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}
