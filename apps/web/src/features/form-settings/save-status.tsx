import { AlertCircle, Check, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSaveQueue } from './save-queue-context';

/** Saving…, Saved, or what went wrong with a way to try again. */
export function SaveStatus() {
  const { status, error, retry } = useSaveQueue();
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 text-13">
      {status === 'saving' && (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <LoaderCircle aria-hidden className="motion-safe:animate-spin" />
          Saving…
        </span>
      )}
      {status === 'saved' && (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Check aria-hidden />
          Saved
        </span>
      )}
      {status === 'error' && (
        <span className="flex items-center gap-1.5 text-danger-text">
          <AlertCircle aria-hidden />
          <span className="hidden sm:inline">Couldn&apos;t save{error ? `: ${error}` : ''}</span>
          <span className="sm:hidden">Couldn&apos;t save</span>
          <Button variant="ghost" size="sm" onClick={retry}>
            Retry
          </Button>
        </span>
      )}
    </div>
  );
}
