import { LayoutTemplate, LoaderCircle, Plus } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

interface FormsEmptyStateProps {
  canCreate: boolean;
  /** Creates a blank form and opens it. */
  onBlank: () => void;
  /** Opens the templates to choose from. */
  onBrowse: () => void;
  pending: boolean;
}

/** No forms in the workspace yet: one line, and the two ways to start. */
export function FormsEmptyState({ canCreate, onBlank, onBrowse, pending }: FormsEmptyStateProps) {
  return (
    <section
      aria-labelledby="forms-empty-title"
      className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center"
    >
      <Logo variant="mark" size={40} decorative className="text-subtle-foreground" />
      <h2 id="forms-empty-title" className="mt-5 text-16 font-semibold tracking-tight">
        {canCreate ? 'Create your first form' : 'No forms yet'}
      </h2>
      <p className="mt-1 max-w-sm text-14 text-muted-foreground">
        {canCreate
          ? 'Start from a blank form or a template. You can change everything later.'
          : 'Forms made in this workspace will show here. Ask an editor to create one.'}
      </p>
      {canCreate && (
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button onClick={onBlank} disabled={pending} aria-busy={pending || undefined}>
            {pending ? (
              <LoaderCircle className="motion-safe:animate-spin" aria-hidden />
            ) : (
              <Plus aria-hidden />
            )}
            New form
          </Button>
          <Button variant="secondary" onClick={onBrowse} disabled={pending}>
            <LayoutTemplate aria-hidden />
            Browse templates
          </Button>
        </div>
      )}
    </section>
  );
}
