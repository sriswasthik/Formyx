import {
  answerErrorsFromIssues,
  DRAFT_TOKEN_PATTERN,
  formatDateTime,
  formLocale,
  HONEYPOT_FIELD,
  validationIssueSchema,
  type DraftResponse,
  type EditLoadResponse,
  type FormLocale,
  type FormMessages,
  type PublicForm,
  type SubmittedAnswers,
} from '@formyx/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, FileQuestion, Lock, WifiOff } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type RefObject,
} from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { usePageTitle } from '@/app/page-title';
import { buttonVariants } from '@/components/ui/button-variants';
import {
  FormView,
  type ResponseProgress,
  type SubmitOutcome,
} from '@/features/form-renderer/form-view';
import { preloadFormLayout } from '@/features/form-renderer/conversational/load-conversational';
import { preloadFieldControls } from '@/features/form-renderer/controls/registry';
import { loadFormMessages } from '@/features/form-renderer/i18n/load-messages';
import { lazyModule, useLazyModule } from '@/features/form-renderer/lazy-module';
import { RichText } from '@/features/form-renderer/rich-text';
import { themeFontsReady } from '@/features/form-renderer/theme/fonts';
import { ApiRequestError } from '@/lib/api';
import { isEmbedded } from '@/lib/embed';
import type { PasswordGate } from './access-screens';
import { hostTargetOrigin, postToHost, useReportHeight } from './embed-host';
import {
  editLink,
  hasResponded,
  markResponded,
  readEditToken,
  readVerifiedEmail,
  storeAccessToken,
  storeVerifiedEmail,
} from './form-access';
import {
  answerUploader,
  checkVerificationCode,
  getPublicForm,
  loadEdit,
  resumeDraft,
  saveDraft,
  sendVerificationCode,
  submitResponse,
  unlockForm,
} from './public-form-api';
import { MadeWithFormyx, PublicFormMessage, PublicFormSkeleton } from './public-form-states';
import { createProgressReporter, recordViewOnce } from './record-view';

// The password, email and "already responded" screens: only for forms that need them.
const accessScreens = lazyModule(() => import('./access-screens'));

/**
 * The token of an emailed "continue later" link, from the page's fragment (where it never
 * reaches a server). Only reads it: `useClearFragment` then takes it out of the address bar.
 */
function readResumeToken(): string | null {
  const match = /(?:^#|&)resume=([^&]+)/.exec(window.location.hash);
  const token = match?.[1] ? decodeURIComponent(match[1]) : null;
  return token && DRAFT_TOKEN_PATTERN.test(token) ? token : null;
}

/** Clears a link's token from the address bar once it has been read. */
function useClearFragment(token: string | null) {
  useEffect(() => {
    if (token === null) return;
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    );
  }, [token]);
}

/** Keeps search engines away from forms not meant to be listed. */
function useNoIndex(noIndex: boolean) {
  useEffect(() => {
    if (!noIndex) return;
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.append(meta);
    return () => {
      meta.remove();
    };
  }, [noIndex]);
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

function FormClosed({
  title,
  messages,
  message,
}: {
  title: string;
  messages: FormMessages;
  message?: string | undefined;
}) {
  return (
    <PublicFormMessage
      icon={Lock}
      eyebrow={title}
      title={messages.access.closedTitle}
      description={message ? <RichText text={message} /> : messages.access.closedText}
      madeWith={messages.nav.madeWith}
    />
  );
}

/** Who is responding, when the form asks before its questions. */
interface Respondent {
  email: string;
  /** Proof the address was confirmed, for forms taking one response per person. */
  token?: string;
}

interface LiveFormProps {
  form: PublicForm;
  locale: FormLocale;
  onClosed: () => void;
  /** The form's access changed under the respondent (locked again, not open): look again. */
  onAccessChanged: () => void;
  /** Set when embedded in another site: tells that page when a response was sent. */
  hostOrigin: string | null;
  /** The link's query string, for hidden fields and prefilled answers. */
  linkParams: URLSearchParams;
  /** A draft from an emailed link, with its token; or that the link no longer works. */
  draft: { token: string; saved: DraftResponse } | 'expired' | null;
  /** A response to change, with its link's token; or that the link no longer works. */
  edit: { token: string; saved: EditLoadResponse } | 'expired' | null;
}

/** Query parameters the embed adds for itself, which never fill hidden fields. */
const EMBED_PARAMS = ['embed', 'parent'];

function LiveForm({
  form,
  locale,
  onClosed,
  onAccessChanged,
  hostOrigin,
  linkParams,
  draft,
  edit,
}: LiveFormProps) {
  const { messages } = locale;
  const embedded = hostOrigin !== null;
  const variant = embedded ? 'embed' : 'page';
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
  const editing = edit !== null && edit !== 'expired' ? edit : null;
  const { access } = form;

  const [respondent, setRespondent] = useState<Respondent | null>(() => {
    const verified = access.emailStep === 'verify' ? readVerifiedEmail(form.slug) : null;
    return verified && { email: verified.email, token: verified.token };
  });
  const [responded, setResponded] = useState(
    () => access.oneResponsePerBrowser && hasResponded(form.slug) && editing === null,
  );
  const [editUrl, setEditUrl] = useState<string | null>(null);
  const needsScreens = responded || (access.emailStep !== 'none' && respondent === null);
  const screens = useLazyModule(accessScreens, needsScreens);
  const footer =
    embedded || !form.theme.branding.showFormyxBadge ? undefined : (
      <MadeWithFormyx label={messages.nav.madeWith} slug={form.slug} />
    );
  const frame = { title: form.title, theme: form.theme, locale, variant, footer } as const;

  const submit = async (answers: SubmittedAnswers): Promise<SubmitOutcome> => {
    try {
      const sent = await submitResponse(form.slug, {
        answers,
        completionTimeMs: Math.max(0, Math.round(Date.now() - openedAt)),
        referrer: document.referrer || undefined,
        [HONEYPOT_FIELD]: honeypot.current?.value || undefined,
        viewToken: (await visit) ?? undefined,
        resumeToken: saved?.token,
        editToken: editing?.token,
        ...(editing === null && respondent && access.emailStep === 'ask'
          ? { respondentEmail: respondent.email }
          : {}),
        ...(editing === null && respondent?.token ? { verificationToken: respondent.token } : {}),
      });
      if (hostOrigin !== null) postToHost({ type: 'submitted', slug: form.slug }, hostOrigin);
      if (access.oneResponsePerBrowser) markResponded(form.slug);
      // A confirmed address counts once: the next visit confirms again.
      storeVerifiedEmail(form.slug, null);
      const token = sent.editToken ?? editing?.token;
      if (access.allowEdits && token) setEditUrl(editLink(form.slug, token));
      return { ok: true, outcome: sent.outcome };
    } catch (error) {
      if (!(error instanceof ApiRequestError)) throw error;
      if (error.status === 410) {
        onClosed();
        return { ok: false };
      }
      if (error.code === 'FORM_LOCKED' || error.code === 'FORM_NOT_OPEN') {
        onAccessChanged();
        return { ok: false };
      }
      if (error.code === 'ALREADY_RESPONDED') {
        setResponded(true);
        return { ok: false };
      }
      if (error.code === 'VERIFICATION_REQUIRED') {
        storeVerifiedEmail(form.slug, null);
        setRespondent(null);
        return { ok: false };
      }
      if (error.code === 'VALIDATION_ERROR') {
        const issues = validationIssueSchema.array().safeParse(error.details).data ?? [];
        return {
          ok: false,
          fieldErrors: answerErrorsFromIssues(issues),
          message: messages.check.fixAnswers,
        };
      }
      if (error.code === 'RATE_LIMITED') return { ok: false, message: error.message };
      return { ok: false, message: messages.check.sendFailed };
    }
  };

  const onSaveDraft = async (input: Parameters<typeof saveDraft>[1]) => {
    try {
      await saveDraft(form.slug, input);
    } catch (error) {
      throw new Error(
        error instanceof ApiRequestError && error.code === 'RATE_LIMITED'
          ? error.message
          : messages.check.saveFailed,
        { cause: error },
      );
    }
  };

  if (needsScreens) {
    if (!screens) return <PublicFormSkeleton />;
    if (responded) return <screens.AlreadyResponded {...frame} />;
    return (
      <screens.EmailStep
        {...frame}
        verify={access.emailStep === 'verify'}
        onSendCode={(email) => sendVerificationCode(form.slug, email)}
        onCheckCode={async (email, code) => {
          try {
            const token = await checkVerificationCode(form.slug, email, code);
            storeVerifiedEmail(form.slug, { email, token });
            setRespondent({ email, token });
          } catch (error) {
            // Confirmed, and it has responded before: say so in full, not as a field error.
            if (error instanceof ApiRequestError && error.code === 'ALREADY_RESPONDED') {
              setResponded(true);
              return;
            }
            throw error;
          }
        }}
        onDone={(email) => {
          setRespondent({ email });
        }}
      />
    );
  }

  const notice =
    edit === 'expired'
      ? messages.access.editUnavailable
      : draft === 'expired'
        ? messages.save.linkExpired
        : undefined;

  return (
    <FormView
      title={form.title}
      schema={form.schema}
      theme={form.theme}
      locale={locale}
      onSubmit={submit}
      allowAnotherResponse={false}
      uploadFile={uploadFile}
      linkParams={linkParams}
      resume={
        editing ? { answers: editing.saved.answers, state: {} } : saved ? saved.saved : undefined
      }
      editing={editing !== null}
      editUrl={editUrl}
      saveProgressKey={
        form.schema.settings.saveProgress === 'off' || editing ? undefined : form.slug
      }
      onSaveDraft={editing ? undefined : onSaveDraft}
      onProgress={onProgress}
      allowRedirect
      notice={notice}
      hiddenFields={<Honeypot inputRef={honeypot} />}
      variant={variant}
      // Embedded, the form is a card on the host's page rather than a page of its own.
      footer={footer}
      className={embedded ? 'overflow-clip rounded-(--form-radius)' : undefined}
    />
  );
}

/** How long a public form waits for its fonts before showing in the fallbacks. */
const FONT_WAIT_MS = 1200;

/** A published form at `/f/:slug`, for anyone with the link. */
export function PublicFormPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [embedded] = useState(isEmbedded);
  const hostOrigin = embedded ? hostTargetOrigin(searchParams.get('parent')) : null;
  // Fills hidden fields (?source=instagram) and prefills questions; embedded, embed.js
  // passes on the host page's.
  const [linkParams] = useState(() => {
    const params = new URLSearchParams(searchParams);
    for (const name of EMBED_PARAMS) params.delete(name);
    return params;
  });
  const [closedWhileOpen, setClosedWhileOpen] = useState(false);
  const [resumeToken] = useState(readResumeToken);
  const [editToken] = useState(readEditToken);
  useClearFragment(resumeToken ?? editToken);
  const query = useQuery({
    queryKey: ['public-form', slug],
    queryFn: async () => {
      const form = await getPublicForm(slug);
      const settings = form.status === 'open' ? form.schema.settings : form.locale;
      // The form's own words: English comes with the page, other languages load here.
      const messages = await loadFormMessages(settings.language);
      // The skeleton stays a moment longer so the form's text never jumps as fonts arrive,
      // and a conversational form's flow and the question types' controls are ready to draw.
      if (form.status === 'open') {
        await Promise.all([
          themeFontsReady(form.theme, FONT_WAIT_MS),
          preloadFormLayout(form.theme),
          preloadFieldControls(form.schema),
        ]);
      } else if (form.status === 'locked') {
        await themeFontsReady(form.theme, FONT_WAIT_MS);
      }
      return { form, locale: formLocale(settings, messages) };
    },
    // The form must not change under someone halfway through it.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: (failures, error) => !isNotFound(error) && failures < 1,
  });
  const open = query.data?.form.status === 'open' ? query.data.form : null;
  // An emailed "continue later" link brings its saved answers.
  const draftQuery = useQuery({
    queryKey: ['public-form-draft', slug, resumeToken],
    queryFn: () => resumeDraft(slug, resumeToken ?? ''),
    enabled: resumeToken !== null && open !== null,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
  // A link to change a response brings that response's answers.
  const editQuery = useQuery({
    queryKey: ['public-form-edit', slug, editToken],
    queryFn: () => loadEdit(slug, editToken ?? ''),
    enabled: editToken !== null && open?.access.allowEdits === true,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
  usePageTitle(query.data?.form.title ?? 'Form');
  useReportHeight({
    enabled: embedded,
    slug,
    title: query.data?.form.title,
    targetOrigin: hostOrigin ?? '*',
  });
  useNoIndex(query.data !== undefined && !(open?.access.indexable ?? false));

  // An old address: carry on at the form's current one, keeping the query string.
  const currentSlug = query.data?.form.slug;
  useEffect(() => {
    if (currentSlug && currentSlug !== slug) {
      void navigate(`/f/${encodeURIComponent(currentSlug)}${window.location.search}`, {
        replace: true,
      });
    }
  }, [currentSlug, slug, navigate]);

  const refetch = () => {
    void query.refetch();
  };

  if (
    query.isPending ||
    (resumeToken !== null && open !== null && draftQuery.isPending) ||
    (editToken !== null && open?.access.allowEdits === true && editQuery.isPending)
  ) {
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
          // A plain button, not Button: Button's tailwind-merge stays out of public forms.
          <button
            type="button"
            className={buttonVariants({ variant: 'secondary' })}
            disabled={query.isFetching}
            onClick={refetch}
          >
            Try again
          </button>
        }
      />
    );
  }

  const { form, locale } = query.data;
  const { messages } = locale;

  if (form.status === 'closed' || closedWhileOpen) {
    return (
      <FormClosed
        title={form.title}
        messages={messages}
        message={form.status === 'closed' ? form.message : undefined}
      />
    );
  }

  if (form.status === 'not_open') {
    return (
      <PublicFormMessage
        icon={CalendarClock}
        eyebrow={form.title}
        title={messages.access.notOpenTitle}
        description={messages.access.opensAt(
          formatDateTime(form.opensAt, form.timeZone, locale.format),
        )}
        madeWith={messages.nav.madeWith}
      />
    );
  }

  if (form.status === 'locked') {
    return (
      <PasswordScreen
        title={form.title}
        theme={form.theme}
        locale={locale}
        variant={embedded ? 'embed' : 'page'}
        onUnlock={async (password) => {
          storeAccessToken(form.slug, await unlockForm(form.slug, password));
          await query.refetch();
        }}
      />
    );
  }

  return (
    <LiveForm
      form={form}
      locale={locale}
      hostOrigin={hostOrigin}
      linkParams={linkParams}
      draft={
        resumeToken === null
          ? null
          : draftQuery.data
            ? { token: resumeToken, saved: draftQuery.data }
            : 'expired'
      }
      edit={
        editToken === null
          ? null
          : editQuery.data
            ? { token: editToken, saved: editQuery.data }
            : 'expired'
      }
      onClosed={() => {
        setClosedWhileOpen(true);
      }}
      onAccessChanged={() => {
        // Locked again (the password changed) or not open after all: ask afresh.
        storeAccessToken(form.slug, null);
        refetch();
      }}
    />
  );
}

/** The password screen, once its chunk has loaded. */
function PasswordScreen(props: ComponentProps<typeof PasswordGate>) {
  const screens = useLazyModule(accessScreens, true);
  return screens ? <screens.PasswordGate {...props} /> : <PublicFormSkeleton />;
}
