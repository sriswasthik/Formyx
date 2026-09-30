import type { FormTemplateId } from '@formyx/shared';
import { FileText, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { questionCountLabel } from './format';
import { TEMPLATE_OPTIONS } from './templates';

interface FormsEmptyStateProps {
  canCreate: boolean;
  onCreate: (templateId: FormTemplateId) => void;
  /** The template being created from, while that request is in flight. */
  pendingTemplate: FormTemplateId | null;
}

/** First run: nothing in the workspace yet, so offer the templates as one-click starts. */
export function FormsEmptyState({ canCreate, onCreate, pendingTemplate }: FormsEmptyStateProps) {
  return (
    <section
      aria-labelledby="forms-empty-title"
      className="rounded-xl border border-dashed px-6 py-12 text-center sm:px-10"
    >
      <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-lg border bg-background text-muted-foreground">
        <FileText aria-hidden />
      </div>
      <h2 id="forms-empty-title" className="text-16 font-semibold tracking-tight">
        {canCreate ? 'Create your first form' : 'No forms yet'}
      </h2>
      <p className="mx-auto mt-1 max-w-md text-14 text-muted-foreground">
        {canCreate
          ? 'Start from a template or a blank form. You can change everything later.'
          : 'Forms created in this workspace will appear here. Ask an editor to create one.'}
      </p>

      {canCreate && (
        <ul className="mx-auto mt-8 grid max-w-3xl gap-3 text-left sm:grid-cols-3">
          {TEMPLATE_OPTIONS.map(({ id, name, description, icon: Icon, questionCount }) => {
            const pending = pendingTemplate === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  disabled={pendingTemplate !== null}
                  aria-busy={pending || undefined}
                  onClick={() => {
                    onCreate(id);
                  }}
                  className={cn(
                    'flex h-full w-full flex-col items-start gap-3 rounded-xl border bg-card p-4 text-left',
                    'transition-[border-color,background-color,opacity] duration-150 ease-standard',
                    'hover:not-disabled:border-border-strong active:not-disabled:bg-pressed',
                    'disabled:opacity-60',
                  )}
                >
                  <span className="flex size-8 items-center justify-center rounded-lg border bg-surface text-muted-foreground">
                    {pending ? (
                      <LoaderCircle className="motion-safe:animate-spin" aria-hidden />
                    ) : (
                      <Icon aria-hidden />
                    )}
                  </span>
                  <span>
                    <span className="block text-14 font-medium">{name}</span>
                    <span className="mt-0.5 block text-13 text-muted-foreground">
                      {description}
                    </span>
                  </span>
                  {id !== 'blank' && (
                    <span className="mt-auto text-12 text-muted-foreground tabular-nums">
                      {questionCountLabel(questionCount)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
