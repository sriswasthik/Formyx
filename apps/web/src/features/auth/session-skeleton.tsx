import { Skeleton } from '@/components/ui/skeleton';

/** Shaped like the app shell, so the page does not jump once the session has loaded. */
export function SessionSkeleton() {
  return (
    <div className="flex min-h-dvh" role="status" aria-label="Loading your account">
      <div className="hidden w-60 shrink-0 flex-col gap-4 border-r bg-surface p-4 md:flex">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-9 w-full" />
        <div className="flex flex-col gap-2 pt-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center border-b px-4 md:px-8 lg:px-10">
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="flex flex-col gap-4 px-6 py-6 md:px-8 md:py-8 lg:px-10">
          <Skeleton className="h-40 w-full max-w-5xl rounded-xl" />
        </div>
      </div>
    </div>
  );
}
