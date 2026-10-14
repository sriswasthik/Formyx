import { ONBOARDING_STEPS, type FormSummary, type OnboardingStep } from '@formyx/shared';
import { Check, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STEPS: Record<OnboardingStep, { title: string; description: string }> = {
  create_form: {
    title: 'Create a form',
    description: 'Start from a template or a blank page.',
  },
  customise_design: {
    title: 'Customise the design',
    description: 'Pick a look, then make the colours, fonts and background your own.',
  },
  publish: {
    title: 'Publish it',
    description: 'Get a link to share, a QR code, or code to embed it on your site.',
  },
  first_response: {
    title: 'Get your first response',
    description: 'Share the link and watch answers arrive live.',
  },
};

interface GettingStartedProps {
  steps: Record<OnboardingStep, boolean>;
  /** The workspace's forms, most recently edited first, for the steps' links. */
  forms: readonly FormSummary[];
  onCreateForm: () => void;
  onShare: (form: FormSummary) => void;
  onDismiss: () => void;
}

/** The getting-started checklist on the dashboard, until every step is done or it is hidden. */
export function GettingStarted({
  steps,
  forms,
  onCreateForm,
  onShare,
  onDismiss,
}: GettingStartedProps) {
  const done = ONBOARDING_STEPS.filter((step) => steps[step]).length;
  const latest = forms[0];
  const draft = forms.find((form) => form.status === 'DRAFT') ?? latest;
  const published = forms.find((form) => form.status === 'PUBLISHED');

  const actions: Record<OnboardingStep, ReactNode> = {
    create_form: (
      <Button size="sm" variant="secondary" onClick={onCreateForm}>
        New form
      </Button>
    ),
    customise_design: latest && (
      <Button asChild size="sm" variant="secondary">
        <Link to={`/app/forms/${latest.id}/edit?panel=design`}>Open the Design Studio</Link>
      </Button>
    ),
    publish: draft && (
      <Button asChild size="sm" variant="secondary">
        <Link to={`/app/forms/${draft.id}/edit`}>Open the editor</Link>
      </Button>
    ),
    first_response: published && (
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          onShare(published);
        }}
      >
        Share the link
      </Button>
    ),
  };

  return (
    <section aria-labelledby="getting-started-title" className="rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="getting-started-title" className="text-16 font-semibold tracking-tight">
            Get started with Formyx
          </h2>
          <p className="mt-1 text-13 text-muted-foreground tabular-nums">
            {done} of {ONBOARDING_STEPS.length} done
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Hide the getting-started checklist"
          onClick={onDismiss}
          className="-mt-1 -mr-1"
        >
          <X aria-hidden />
        </Button>
      </div>
      <div
        role="progressbar"
        aria-label="Getting started"
        aria-valuemin={0}
        aria-valuemax={ONBOARDING_STEPS.length}
        aria-valuenow={done}
        className="mt-3 h-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-250 ease-standard motion-reduce:transition-none"
          style={{ width: `${(done / ONBOARDING_STEPS.length) * 100}%` }}
        />
      </div>
      <ol className="mt-4 grid gap-2 @3xl:grid-cols-2">
        {ONBOARDING_STEPS.map((step) => {
          const complete = steps[step];
          return (
            <li key={step} className="flex items-start gap-3 rounded-lg border p-3">
              <span
                className={cn(
                  'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
                  complete && 'border-success bg-success text-background',
                )}
              >
                {complete && <Check className="size-3.5" aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn('block text-14 font-medium', complete && 'text-muted-foreground')}
                >
                  {STEPS[step].title}
                  <span className="sr-only">{complete ? ' (done)' : ' (to do)'}</span>
                </span>
                {!complete && (
                  <span className="mt-0.5 block text-13 text-muted-foreground">
                    {STEPS[step].description}
                  </span>
                )}
                {!complete && actions[step] && <span className="mt-3 flex">{actions[step]}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
