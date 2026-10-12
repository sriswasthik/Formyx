import { RotateCw } from 'lucide-react';
import { Logo } from '@/components/logo';
import { buttonVariants } from '@/components/ui/button-variants';
import { isStaleBuildError } from './stale-build';

/**
 * What people see when a page fails to render. Laid out like the 404 page, and works outside the
 * router too (plain links), so the app-wide error boundary can show it.
 */
export function CrashScreen({ error }: { error: unknown }) {
  const stale = isStaleBuildError(error);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center">
      <a href="/" className="mb-12 rounded-md p-1" aria-label="Formyx home">
        <Logo />
      </a>
      <div role="alert" className="flex flex-col items-center">
        <h1 className="text-24 font-semibold tracking-tight">
          {stale ? 'Formyx has been updated' : 'Something went wrong'}
        </h1>
        <p className="mt-2 max-w-sm text-14 text-muted-foreground">
          {stale
            ? 'This page changed since you opened Formyx. Reload to get the latest version; everything you saved is safe.'
            : 'An unexpected error stopped this page from loading. Reloading usually fixes it.'}
        </p>
      </div>
      <div className="mt-6 flex gap-2">
        {/* Plain elements, not Button: this page is in every first download (see button-variants). */}
        <button
          type="button"
          className={buttonVariants()}
          onClick={() => {
            window.location.reload();
          }}
        >
          <RotateCw aria-hidden />
          Reload
        </button>
        <a href="/" className={buttonVariants({ variant: 'secondary' })}>
          Go home
        </a>
      </div>
    </main>
  );
}
