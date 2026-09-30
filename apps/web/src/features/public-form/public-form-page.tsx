import {
  answerErrorsFromIssues,
  closedFormDetailsSchema,
  HONEYPOT_FIELD,
  validationIssueSchema,
  type PublicForm,
  type SubmittedAnswers,
} from '@formyx/shared';
import { useQuery } from '@tanstack/react-query';
import { FileQuestion, Lock, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useParams } from 'react-router';
import { usePageTitle } from '@/app/page-title';
import { Button } from '@/components/ui/button';
import { FormView, type SubmitOutcome } from '@/features/form-renderer/form-view';
import { ApiRequestError } from '@/lib/api';
import { getPublicForm, submitResponse } from './public-form-api';
import { MadeWithFormyx, PublicFormMessage, PublicFormSkeleton } from './public-form-states';
import { recordViewOnce } from './record-view';

/** Missing or closed forms stay that way, so asking again would not help. */
function isFinal(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 404 || error.status === 410);
}

function closedTitleOf(error: unknown): string | undefined {
  if (!(error instanceof ApiRequestError) || error.status !== 410) return undefined;
  return closedFormDetailsSchema.safeParse(error.details).data?.title;
}

/**
 * Left empty by people, who never see it. It sits off-screen rather than hidden, since some
 * bots skip hidden inputs.
 */
function Honeypot({ inputRef }: { inputRef: RefObject<HTMLInputElement> }) {
  return (
    <div aria-hidden className="absolute -left-[10000px] size-px overflow-hidden">
      <label htmlFor="form-website">Website</label>
      <input
        ref={inputRef}
        id="form-website"
        name={HONEYPOT_FIELD}
        type="text"
        tabIndex={-1}
        autoComplete="off"
      />
    </div>
  );
}

function FormClosed({ title }: { title: string | undefined }) {
  return (
    <PublicFormMessage
      icon={Lock}
      eyebrow={title}
      title="This form is closed"
      description="It is no longer accepting responses."
    />
  );
}

function LiveForm({ form, onClosed }: { form: PublicForm; onClosed: () => void }) {
  const [openedAt] = useState(() => Date.now());
  const honeypot = useRef<HTMLInputElement>(null);

  useEffect(() => {
    recordViewOnce(form.slug);
  }, [form.slug]);

  const submit = async (answers: SubmittedAnswers): Promise<SubmitOutcome> => {
    try {
      await submitResponse(form.slug, {
        answers,
        completionTimeMs: Math.max(0, Math.round(Date.now() - openedAt)),
        referrer: document.referrer || undefined,
        [HONEYPOT_FIELD]: honeypot.current?.value || undefined,
      });
      return { ok: true };
    } catch (error) {
      if (!(error instanceof ApiRequestError)) throw error;
      if (error.status === 410) {
        onClosed();
        return { ok: false };
      }
      if (error.code === 'VALIDATION_ERROR') {
        const issues = validationIssueSchema.array().safeParse(error.details).data ?? [];
        return {
          ok: false,
          fieldErrors: answerErrorsFromIssues(issues),
          message: 'Some answers need your attention.',
        };
      }
      if (error.code === 'RATE_LIMITED') return { ok: false, message: error.message };
      return {
        ok: false,
        message: 'Your answers could not be sent. Check your connection and try again.',
      };
    }
  };

  return (
    <FormView
      title={form.title}
      schema={form.schema}
      theme={form.theme}
      onSubmit={submit}
      allowAnotherResponse={false}
      hiddenFields={<Honeypot inputRef={honeypot} />}
      footer={<MadeWithFormyx />}
      className="relative min-h-dvh"
    />
  );
}

/** A published form at `/f/:slug`, for anyone with the link. */
export function PublicFormPage() {
  const { slug = '' } = useParams();
  const [closedWhileOpen, setClosedWhileOpen] = useState(false);
  const query = useQuery({
    queryKey: ['public-form', slug],
    queryFn: () => getPublicForm(slug),
    // The form must not change under someone halfway through it.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: (failures, error) => !isFinal(error) && failures < 1,
  });
  usePageTitle(query.data?.title ?? closedTitleOf(query.error) ?? 'Form');

  if (query.isPending) return <PublicFormSkeleton />;

  if (query.isError) {
    if (query.error instanceof ApiRequestError && query.error.status === 404) {
      return (
        <PublicFormMessage
          icon={FileQuestion}
          title="This form doesn't exist"
          description="The link may be mistyped, or the form was deleted. Check with whoever shared it with you."
        />
      );
    }
    if (query.error instanceof ApiRequestError && query.error.status === 410) {
      return <FormClosed title={closedTitleOf(query.error)} />;
    }
    return (
      <PublicFormMessage
        icon={WifiOff}
        title="The form could not be loaded"
        description="Check your connection and try again."
        action={
          <Button
            variant="secondary"
            disabled={query.isFetching}
            onClick={() => {
              void query.refetch();
            }}
          >
            Try again
          </Button>
        }
      />
    );
  }

  if (closedWhileOpen) return <FormClosed title={query.data.title} />;

  return (
    <LiveForm
      form={query.data}
      onClosed={() => {
        setClosedWhileOpen(true);
      }}
    />
  );
}
