import {
  answerErrorsFromIssues,
  DRAFT_TOKEN_PATTERN,
  HONEYPOT_FIELD,
  validationIssueSchema,
  type DraftResponse,
  type PublicForm,
  type SubmittedAnswers,
} from '@formyx/shared';
import { useQuery } from '@tanstack/react-query';
import { FileQuestion, Lock, WifiOff } from 'lucide-react';
import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { usePageTitle } from '@/app/page-title';
import { Button } from '@/components/ui/button';
import {
  FormView,
  type ResponseProgress,
  type SubmitOutcome,
} from '@/features/form-renderer/form-view';
import { preloadFormLayout } from '@/features/form-renderer/conversational/load-conversational';
import { preloadFieldControls } from '@/features/form-renderer/controls/registry';
import { themeFontsReady } from '@/features/form-renderer/theme/fonts';
import { ApiRequestError } from '@/lib/api';
import { isEmbedded } from '@/lib/embed';
import { hostTargetOrigin, postToHost, useReportHeight } from './embed-host';
import {
  answerUploader,
  getPublicForm,
  resumeDraft,
  saveDraft,
  submitResponse,
} from './public-form-api';
import { MadeWithFormyx, PublicFormMessage, PublicFormSkeleton } from './public-form-states';
import { createProgressReporter, recordViewOnce } from './record-view';

/**
 * The token of an emailed "continue later" link, from the page's fragment (where it never
 * reaches a server), which is then cleared from the address bar.
 */
function takeResumeToken(): string | null {
  const match = /(?:^#|&)resume=([^&]+)/.exec(window.location.hash);
  const token = match?.[1] ? decodeURIComponent(match[1]) : null;
  if (!token || !DRAFT_TOKEN_PATTERN.test(token)) return null;
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search,
  );
  return token;
}

/** A missing form stays missing, so asking again would not help. */
function isNotFound(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
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

function FormClosed({ title }: { title: string }) {
  return (
    <PublicFormMessage
      icon={Lock}
      eyebrow={title}
      title="This form is closed"
      description="It is no longer accepting responses."
    />
  );
}

interface LiveFormProps {
  form: PublicForm;
  onClosed: () => void;
  /** Set when embedded in another site: tells that page when a response was sent. */
  hostOrigin: string | null;
  /** The link's query string, for hidden fields. */
  linkParams: URLSearchParams;
  /** A draft from an emailed link, with its token; or that the link no longer works. */
  draft: { token: string; saved: DraftResponse } | 'expired' | null;
}

/** Query parameters the embed adds for itself, which never fill hidden fields. */
const EMBED_PARAMS = ['embed', 'parent'];

function LiveForm({ form, onClosed, hostOrigin, linkParams, draft }: LiveFormProps) {
  const embedded = hostOrigin !== null;
  const [openedAt] = useState(() => Date.now());
  const honeypot = useRef<HTMLInputElement>(null);
  const uploadFile = useMemo(() => answerUploader(form.slug), [form.slug]);
  // One visit, counted once per browser session; its token carries the progress reports.
  const [visit] = useState(() => recordViewOnce(form.slug));
  const [report] = useState(() => createProgressReporter(form.slug, visit));
  const onProgress = useCallback(
    (progress: ResponseProgress) => {
      report(progress);
    },
    [report],
  );
  const saved = draft !== null && draft !== 'expired' ? draft : null;

  const submit = async (answers: SubmittedAnswers): Promise<SubmitOutcome> => {
    try {
      const sent = await submitResponse(form.slug, {
        answers,
        completionTimeMs: Math.max(0, Math.round(Date.now() - openedAt)),
        referrer: document.referrer || undefined,
        [HONEYPOT_FIELD]: honeypot.current?.value || undefined,
        viewToken: (await visit) ?? undefined,
        resumeToken: saved?.token,
      });
      if (hostOrigin !== null) postToHost({ type: 'submitted', slug: form.slug }, hostOrigin);
      return { ok: true, outcome: sent.outcome };
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

  const onSaveDraft = async (input: Parameters<typeof saveDraft>[1]) => {
    try {
      await saveDraft(form.slug, input);
    } catch (error) {
      throw new Error(
        error instanceof ApiRequestError && error.code === 'RATE_LIMITED'
          ? error.message
          : 'Your answers could not be saved. Check your connection and try again.',
        { cause: error },
      );
    }
  };

  return (
    <FormView
      title={form.title}
      schema={form.schema}
      theme={form.theme}
      onSubmit={submit}
      allowAnotherResponse={false}
      uploadFile={uploadFile}
      linkParams={linkParams}
      resume={saved ? saved.saved : undefined}
      saveProgressKey={form.schema.settings.saveProgress === 'off' ? undefined : form.slug}
      onSaveDraft={onSaveDraft}
      onProgress={onProgress}
      allowRedirect
      notice={
        draft === 'expired'
          ? 'This link has expired or was already used, so the form starts afresh.'
          : undefined
      }
      hiddenFields={<Honeypot inputRef={honeypot} />}
      variant={embedded ? 'embed' : 'page'}
      // Embedded, the form is a card on the host's page rather than a page of its own.
      footer={embedded || !form.theme.branding.showFormyxBadge ? undefined : <MadeWithFormyx />}
      className={embedded ? 'overflow-clip rounded-(--form-radius)' : undefined}
    />
  );
}

/** How long a public form waits for its fonts before showing in the fallbacks. */
const FONT_WAIT_MS = 1200;

/** A published form at `/f/:slug`, for anyone with the link. */
export function PublicFormPage() {
  const { slug = '' } = useParams();
  const [searchParams] = useSearchParams();
  const [embedded] = useState(isEmbedded);
  const hostOrigin = embedded ? hostTargetOrigin(searchParams.get('parent')) : null;
  // Fills hidden fields (?source=instagram); embedded, embed.js passes on the host page's.
  const [linkParams] = useState(() => {
    const params = new URLSearchParams(searchParams);
    for (const name of EMBED_PARAMS) params.delete(name);
    return params;
  });
  const [closedWhileOpen, setClosedWhileOpen] = useState(false);
  const [resumeToken] = useState(takeResumeToken);
  const query = useQuery({
    queryKey: ['public-form', slug],
    queryFn: async () => {
      const form = await getPublicForm(slug);
      // The skeleton stays a moment longer so the form's text never jumps as fonts arrive,
      // and a conversational form's flow and the question types' controls are ready to draw.
      if (form.status === 'open') {
        await Promise.all([
          themeFontsReady(form.theme, FONT_WAIT_MS),
          preloadFormLayout(form.theme),
          preloadFieldControls(form.schema),
        ]);
      }
      return form;
    },
    // The form must not change under someone halfway through it.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: (failures, error) => !isNotFound(error) && failures < 1,
  });
  // An emailed "continue later" link brings its saved answers.
  const draftQuery = useQuery({
    queryKey: ['public-form-draft', slug, resumeToken],
    queryFn: () => resumeDraft(slug, resumeToken ?? ''),
    enabled: resumeToken !== null,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
  usePageTitle(query.data?.title ?? 'Form');
  useReportHeight({
    enabled: embedded,
    slug,
    title: query.data?.title,
    targetOrigin: hostOrigin ?? '*',
  });

  if (query.isPending || (resumeToken !== null && draftQuery.isPending)) {
    return <PublicFormSkeleton />;
  }

  if (query.isError) {
    if (isNotFound(query.error)) {
      return (
        <PublicFormMessage
          icon={FileQuestion}
          title="This form doesn't exist"
          description="The link may be mistyped, or the form was deleted. Check with whoever shared it with you."
        />
      );
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

  if (query.data.status === 'closed' || closedWhileOpen) {
    return <FormClosed title={query.data.title} />;
  }

  return (
    <LiveForm
      form={query.data}
      hostOrigin={hostOrigin}
      linkParams={linkParams}
      draft={
        resumeToken === null
          ? null
          : draftQuery.data
            ? { token: resumeToken, saved: draftQuery.data }
            : 'expired'
      }
      onClosed={() => {
        setClosedWhileOpen(true);
      }}
    />
  );
}
