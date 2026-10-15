import type { FormTemplateId } from '@formyx/shared';
import { ArrowRight, LayoutTemplate, LoaderCircle } from 'lucide-react';
import { GALLERY } from '@/features/templates/gallery';
import { TemplateThumbnail } from '@/features/templates/template-thumbnail';
import { cn } from '@/lib/utils';

/** Three kinds of form most workspaces need early on: with "Browse all", one row of four. */
const STARTS: readonly FormTemplateId[] = [
  'event_registration',
  'feedback_survey',
  'job_application',
];

const STARTERS = STARTS.flatMap((id) => GALLERY.filter((template) => template.id === id));

const cardClass =
  'flex h-full w-full flex-col gap-3 rounded-xl border bg-card p-2 text-left transition-[border-color,opacity] duration-150 ease-standard hover:not-disabled:border-border-strong active:not-disabled:bg-pressed disabled:opacity-60';

interface StartFasterProps {
  onCreate: (templateId: FormTemplateId) => void;
  /** The template being created from, while that request is in flight. */
  pendingTemplate: FormTemplateId | null;
  onBrowse: () => void;
}

/** Under a short list of forms: ready-made ones to start the next from. */
export function StartFaster({ onCreate, pendingTemplate, onBrowse }: StartFasterProps) {
  return (
    <section aria-labelledby="start-faster-title" className="flex flex-col gap-4 pt-4">
      <div>
        <h2 id="start-faster-title" className="text-16 font-semibold tracking-tight">
          Start faster
        </h2>
        <p className="mt-0.5 text-14 text-muted-foreground">
          Forms with their questions written and their look chosen.
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-4 @3xl:grid-cols-4">
        {STARTERS.map((template) => {
          const pending = pendingTemplate === template.id;
          return (
            <li key={template.id}>
              <button
                type="button"
                disabled={pendingTemplate !== null}
                aria-busy={pending || undefined}
                onClick={() => {
                  onCreate(template.id);
                }}
                className={cardClass}
              >
                <TemplateThumbnail template={template} className="border" />
                <span className="flex items-center gap-2 px-1 pb-1">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-14 font-medium">{template.name}</span>
                    <span className="block truncate text-12 text-muted-foreground">
                      {template.description}
                    </span>
                  </span>
                  {pending && (
                    <LoaderCircle
                      className="shrink-0 text-muted-foreground motion-safe:animate-spin"
                      aria-hidden
                    />
                  )}
                </span>
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onBrowse}
            disabled={pendingTemplate !== null}
            className={cn(cardClass, 'items-center justify-center border-dashed p-6 text-center')}
          >
            <span className="flex size-9 items-center justify-center rounded-lg border bg-surface text-muted-foreground">
              <LayoutTemplate aria-hidden />
            </span>
            <span className="text-14 font-medium">Browse all templates</span>
            <span className="inline-flex items-center gap-1 text-12 text-muted-foreground">
              Every kind of form, ready to use
              <ArrowRight className="size-3.5" aria-hidden />
            </span>
          </button>
        </li>
      </ul>
    </section>
  );
}
