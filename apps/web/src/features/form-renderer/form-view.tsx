import {
  createShuffleSeed,
  displayOrder,
  ENGLISH_LOCALE,
  FORM_LOCALES,
  formPages,
  isAnswered,
  linkAnswers,
  isShownQuestionType,
  presentField,
  QUIZ_PERCENT_VARIABLE,
  QUIZ_SCORE_VARIABLE,
  resolvePiping,
  type AnswerValue,
  type DraftState,
  type FormLocale,
  type FormSchema,
  type FormTheme,
  type SubmissionOutcome,
} from '@formyx/shared';
import { LazyMotion } from 'motion/react';
import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { ClassicForm } from './classic-form';
import type { ConversationProgress } from './conversational/conversational-form';
import { useConversational } from './conversational/load-conversational';
import { FormLogo } from './branding';
import { FileUploadsContext, type FileUploader } from './file-uploads';
import { FormProgress } from './form-progress';
import { FormLocaleContext } from './i18n/form-locale';
import { endScreenModule, saveForLaterModule, useLazyModule } from './lazy-module';
import { questionNumbers } from './numbering';
import { clearSavedProgress, readSavedProgress, useSavedProgress } from './saved-progress';
import { secondaryButton } from './styles';
import { ThemeRenderer, type ThemeVariant } from './theme/theme-renderer';
import { useFormResponse, type SubmitHandler } from './use-form-response';

export type { SendingUpdates, SubmitHandler, SubmitOutcome } from './use-form-response';

/** How far a respondent got: the page shown, the last question answered. */
export interface ResponseProgress {
  pageKey?: string;
  fieldId?: string;
}

/** Answers to carry on from, with where the respondent was. */
export interface ResumeFrom {
  answers: Readonly<Record<string, AnswerValue>>;
  state: DraftState;
}

interface FormViewProps {
  title: string;
  schema: FormSchema;
  theme: FormTheme;
  /** `h1` on the public page; `h2` inside the editor, which has its own heading. */
  titleAs?: 'h1' | 'h2';
  /**
   * Receives the normalised answers once they are all valid. Its outcome (from the server)
   * picks the end screen; without one, it is worked out here.
   */
  onSubmit?: SubmitHandler;
  /** Inputs respondents never see, such as a honeypot for bots. */
  hiddenFields?: ReactNode;
  /** Shown below the form and below the end screen. */
  footer?: ReactNode;
  /** Offers "Submit another response" on the end screen. */
  allowAnotherResponse?: boolean;
  /** Where the form is drawn: its own page (default), a box in the builder, or an embed. */
  variant?: ThemeVariant;
  /** Uploads respondents' files. Without it, file questions turn files away. */
  uploadFile?: FileUploader | undefined;
  /** In conversational forms, shows this step (from 0), for the Studio preview's stepper. */
  previewStep?: number | undefined;
  /** The form link's query string, which fills hidden fields (`?source=instagram`). */
  linkParams?: URLSearchParams | undefined;
  /** A draft to carry on from, such as one saved by email. */
  resume?: ResumeFrom | undefined;
  /** Keeps answers in this browser under this key as the respondent goes. */
  saveProgressKey?: string | undefined;
  /** Saves the answers and emails `email` a link; offered when the form allows it. */
  onSaveDraft?:
    | ((draft: {
        email: string;
        answers: Record<string, AnswerValue>;
        state: DraftState;
      }) => Promise<void>)
    | undefined;
  /** How far the respondent gets, for drop-off analytics. */
  onProgress?: ((progress: ResponseProgress) => void) | undefined;
  /** Follows end screens' redirects (the public form, not the editor's preview). */
  allowRedirect?: boolean;
  /** Shows this end screen straight away, as the editor does while designing one. */
  previewEndScreenId?: string | undefined;
  /** A line for the respondent above the questions, such as an expired link. */
  notice?: string | undefined;
  /** The form's words and formats; English with the usual formats if not given. */
  locale?: FormLocale | undefined;
  /** The private link to change the response, shown on the end screen once sent. */
  editUrl?: string | null | undefined;
  /** Changing an earlier response: says so above the questions, and the button saves. */
  editing?: boolean;
  className?: string;
}

/** Fonts for scripts most theme fonts lack; loaded with their languages' catalogs. */
const SCRIPT_FONTS: Partial<Record<FormLocale['format']['language'], string>> = {
  te: "'Noto Sans Telugu'",
  hi: "'Noto Sans Devanagari'",
};

/**
 * Animation code arrives after the form first renders: a form's first paint never waits for
 * it, and questions start out in place (AnimatePresence below skips their entrance).
 */
const loadMotionFeatures = () => import('./motion-features').then((module) => module.default);

/** A sample outcome for previewing an end screen in the editor. */
function previewOutcome(
  schema: FormSchema,
  endScreenId: string,
  values: Record<string, number>,
): SubmissionOutcome {
  const quiz = schema.logic.quiz?.enabled
    ? {
        score: 8,
        max: 10,
        percent: 80,
        passed: schema.logic.quiz.passPercent === undefined ? null : true,
      }
    : null;
  return {
    endScreenId,
    values: {
      ...values,
      ...(quiz && { [QUIZ_SCORE_VARIABLE]: quiz.score, [QUIZ_PERCENT_VARIABLE]: quiz.percent }),
    },
    quiz,
  };
}

/**
 * A whole form as respondents see it: their route through the pages, conditional questions,
 * answers piped into the text, validation, and the end screen, in the theme's layout (all
 * questions on a page, or one at a time) with its progress bar. Answers can be kept in the
 * browser and saved to finish later.
 */
export function FormView({
  title,
  schema,
  theme,
  titleAs: Title = 'h1',
  onSubmit,
  hiddenFields,
  footer,
  allowAnotherResponse = true,
  uploadFile,
  variant = 'page',
  previewStep,
  linkParams,
  resume,
  saveProgressKey,
  onSaveDraft,
  onProgress,
  allowRedirect = false,
  previewEndScreenId,
  notice,
  locale = ENGLISH_LOCALE,
  editUrl,
  editing = false,
  className,
}: FormViewProps) {
  const idPrefix = useId();
  const messages = locale.messages;
  // Read once: the link and what was saved do not change while the form is open. The link
  // fills hidden fields, and prefills questions it names.
  const [hiddenValues] = useState(() => (linkParams ? linkAnswers(schema, linkParams) : undefined));
  const [start] = useState<ResumeFrom | null>(() => {
    if (resume) return resume;
    const saved = saveProgressKey ? readSavedProgress(saveProgressKey) : null;
    return saved && { answers: saved.answers, state: { pageKey: saved.pageKey, seed: saved.seed } };
  });
  const [seed, setSeed] = useState(() => start?.state.seed ?? createShuffleSeed());
  const [pageKey, setPageKey] = useState<string | undefined>(start?.state.pageKey);
  const [welcomeBack, setWelcomeBack] = useState(start !== null);
  /** Remounts the layout to start over, or for another response. */
  const [attempt, setAttempt] = useState(0);

  const response = useFormResponse({
    schema,
    onSubmit,
    uploadFile,
    initialAnswers: hiddenValues,
    startFrom: start?.answers,
    locale,
  });
  const { answers, status, path, activeIds, fileUploads, outcome } = response;
  const conversational = theme.layout.mode === 'conversational';
  // Only conversational forms download the one-question-at-a-time flow.
  const conversationalModule = useConversational(conversational);
  const [conversation, setConversation] = useState<ConversationProgress | null>(null);

  // The form as this respondent sees it: their order, answers piped in.
  const ordered = useMemo(() => displayOrder(schema, seed), [schema, seed]);
  // Changing a response: the last button saves the changes, whatever the form calls it.
  const sendingSchema = useMemo(
    () =>
      editing
        ? {
            ...schema,
            settings: { ...schema.settings, submitButtonText: messages.access.saveChanges },
          }
        : schema,
    [editing, schema, messages],
  );
  const fieldById = useMemo(
    () => new Map(schema.fields.map((field) => [field.id, field])),
    [schema.fields],
  );
  const piping = useMemo(() => {
    const seen: Record<string, AnswerValue> = {};
    for (const id of activeIds) {
      const value = answers[id];
      if (value !== undefined) seen[id] = value;
    }
    return {
      fieldById,
      answers: seen,
      values: path.values,
      variables: schema.logic.variables,
      locale,
    };
  }, [fieldById, answers, activeIds, path.values, schema.logic.variables, locale]);
  const presented = useMemo(
    () => ordered.map((field) => presentField(field, { piping, seed })),
    [ordered, piping, seed],
  );
  const pipeText = useCallback((text: string) => resolvePiping(text, piping), [piping]);
  const shownFields = useMemo(
    () => presented.filter((field) => activeIds.has(field.id)),
    [presented, activeIds],
  );
  const numbering = theme.typography.questionNumbering;
  const numbers = useMemo(() => questionNumbers(shownFields, numbering), [shownFields, numbering]);

  // Kept in the browser as they go (hidden fields come from the link, so they are left out).
  const ownAnswers = useMemo(() => {
    const kept: Record<string, AnswerValue> = {};
    for (const [id, value] of Object.entries(answers)) {
      if (fieldById.get(id)?.type !== 'hidden') kept[id] = value;
    }
    return kept;
  }, [answers, fieldById]);
  useSavedProgress(status === 'filling' ? (saveProgressKey ?? null) : null, {
    answers: ownAnswers,
    pageKey,
    seed,
  });
  useEffect(() => {
    if (status === 'done' && saveProgressKey) clearSavedProgress(saveProgressKey);
  }, [status, saveProgressKey]);

  // How far they got, for drop-off: the page shown and the furthest question answered.
  const pageOfField = useMemo(() => {
    const pages = new Map<string, string>();
    for (const page of formPages(schema.fields)) {
      for (const field of page.fields) pages.set(field.id, page.key);
    }
    return pages;
  }, [schema.fields]);
  const conversationPage = conversation?.stepId ? pageOfField.get(conversation.stepId) : undefined;
  const reachedPage = conversational ? conversationPage : pageKey;
  useEffect(() => {
    if (reachedPage) onProgress?.({ pageKey: reachedPage });
  }, [reachedPage, onProgress]);
  const furthestAnswered = useMemo(
    () =>
      schema.fields.findLast(
        (field) =>
          isShownQuestionType(field.type) &&
          activeIds.has(field.id) &&
          isAnswered(answers[field.id]),
      )?.id,
    [schema.fields, activeIds, answers],
  );
  useEffect(() => {
    if (furthestAnswered) onProgress?.({ fieldId: furthestAnswered });
  }, [furthestAnswered, onProgress]);

  // The end screen's code arrives while they answer, so it shows at once on sending.
  const endScreen = useLazyModule(
    endScreenModule,
    status !== 'filling' || previewEndScreenId !== undefined || Object.keys(ownAnswers).length > 0,
  );
  const offerSaving =
    schema.settings.saveProgress === 'email' && onSaveDraft !== undefined && status === 'filling';
  const saving = useLazyModule(saveForLaterModule, offerSaving);

  const startOver = () => {
    if (saveProgressKey) clearSavedProgress(saveProgressKey);
    response.reset();
    setPageKey(undefined);
    setSeed(createShuffleSeed());
    setWelcomeBack(false);
    setConversation(null);
    setAttempt((count) => count + 1);
  };

  const progress = (() => {
    if (status === 'done' || previewEndScreenId !== undefined) return null;
    if (conversational) {
      return (
        conversation && (
          <FormProgress
            theme={theme}
            value={conversation.current}
            total={conversation.total}
            current={conversation.current}
          />
        )
      );
    }
    // Classic forms: the questions on their route answered so far.
    const questions = shownFields.filter((field) => isShownQuestionType(field.type));
    const answered = questions.filter((field) => isAnswered(answers[field.id])).length;
    return <FormProgress theme={theme} value={answered} total={questions.length} />;
  })();

  const header = (
    <header className="flex flex-col gap-3 pb-8 [text-align:var(--form-text-align)]">
      <FormLogo theme={theme} placement="header" className="mb-3" />
      <Title className="form-title break-words @xl:form-title-lg">{title}</Title>
      {schema.description && (
        <p className="form-text break-words whitespace-pre-wrap text-(--form-muted)">
          {schema.description}
        </p>
      )}
      {notice && (
        <p role="status" className="form-text-sm text-(--form-muted)">
          {notice}
        </p>
      )}
      {editing && (
        <div role="status" className="flex flex-col gap-1 form-text-sm text-(--form-muted)">
          <p className="font-medium text-(--form-fg)">{messages.access.editingTitle}</p>
          <p>{messages.access.editingText}</p>
        </div>
      )}
      {welcomeBack && !editing && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 form-text-sm text-(--form-muted)"
        >
          {messages.nav.welcomeBack}
          <button type="button" className={secondaryButton} onClick={startOver}>
            {messages.nav.startOver}
          </button>
        </p>
      )}
    </header>
  );

  const actions =
    offerSaving && saving ? (
      <saving.SaveForLater
        onSave={(email) => onSaveDraft({ email, answers: ownAnswers, state: { pageKey, seed } })}
      />
    ) : null;

  const shownOutcome =
    previewEndScreenId !== undefined
      ? previewOutcome(schema, previewEndScreenId, path.values)
      : status === 'done'
        ? outcome
        : null;
  const screen =
    shownOutcome &&
    (schema.logic.endScreens.find((candidate) => candidate.id === shownOutcome.endScreenId) ??
      schema.logic.endScreens[0]);

  let body: ReactNode;
  if (shownOutcome && screen) {
    body = endScreen ? (
      <endScreen.EndScreenView
        schema={schema}
        screen={screen}
        outcome={shownOutcome}
        answers={piping.answers}
        titleAs={Title}
        allowRedirect={allowRedirect && previewEndScreenId === undefined}
        onAnotherResponse={
          allowAnotherResponse && previewEndScreenId === undefined ? startOver : undefined
        }
        editUrl={previewEndScreenId === undefined ? (editUrl ?? null) : null}
      />
    ) : (
      <p role="status" className="py-12 text-center form-text">
        {messages.nav.thankYou}
      </p>
    );
  } else if (conversational) {
    body = conversationalModule ? (
      <conversationalModule.ConversationalForm
        key={attempt}
        schema={sendingSchema}
        fields={presented}
        theme={theme}
        response={response}
        idPrefix={idPrefix}
        header={header}
        variant={variant}
        hiddenFields={hiddenFields}
        actions={actions}
        onProgress={setConversation}
        previewStep={previewStep}
      />
    ) : (
      // Where it has not been preloaded: the title, where the flow will start.
      <div className="flex min-h-[min(24rem,55dvh)] flex-col justify-center">{header}</div>
    );
  } else {
    body = (
      <ClassicForm
        key={attempt}
        schema={sendingSchema}
        fields={presented}
        response={response}
        idPrefix={idPrefix}
        header={header}
        pageHeadingLevel={Title === 'h1' ? 'h2' : 'h3'}
        numbers={numbers}
        pageTransition={theme.motion.pageTransition}
        pipeText={pipeText}
        initialPageKey={attempt === 0 ? start?.state.pageKey : undefined}
        onPageChange={setPageKey}
        actions={actions}
        hiddenFields={hiddenFields}
      />
    );
  }

  return (
    <LazyMotion features={loadMotionFeatures}>
      <FormLocaleContext.Provider value={locale}>
        <ThemeRenderer
          theme={theme}
          variant={variant}
          footer={footer}
          progress={progress}
          className={className}
          scriptFont={SCRIPT_FONTS[locale.format.language]}
          lang={FORM_LOCALES[locale.format.language]}
        >
          <FileUploadsContext.Provider value={fileUploads}>{body}</FileUploadsContext.Provider>
        </ThemeRenderer>
      </FormLocaleContext.Provider>
    </LazyMotion>
  );
}
