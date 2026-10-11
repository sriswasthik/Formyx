import {
  hiddenFieldValues,
  isAnswered,
  isShownQuestionType,
  type FormSchema,
  type FormTheme,
  type SubmittedAnswers,
} from '@formyx/shared';
import { CircleCheck } from 'lucide-react';
import { LazyMotion, m, useReducedMotion } from 'motion/react';
import { useCallback, useId, useMemo, useState, type ReactNode } from 'react';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { ClassicForm } from './classic-form';
import type { ConversationProgress } from './conversational/conversational-form';
import { useConversational } from './conversational/load-conversational';
import { FormLogo } from './branding';
import { FileUploadsContext, type FileUploader } from './file-uploads';
import { FormProgress } from './form-progress';
import { questionNumbers } from './numbering';
import { ThemeRenderer, type ThemeVariant } from './theme/theme-renderer';
import { useFormResponse, type SubmitOutcome } from './use-form-response';

export type { SubmitOutcome } from './use-form-response';

interface FormViewProps {
  title: string;
  schema: FormSchema;
  theme: FormTheme;
  /** `h1` on the public page; `h2` inside the editor, which has its own heading. */
  titleAs?: 'h1' | 'h2';
  /** Receives the normalised answers to visible questions once they are all valid. */
  onSubmit?: (answers: SubmittedAnswers) => Promise<SubmitOutcome> | SubmitOutcome;
  /** Inputs respondents never see, such as a honeypot for bots. */
  hiddenFields?: ReactNode;
  /** Shown below the form and below the thank-you message. */
  footer?: ReactNode;
  /** Offers "Submit another response" after the thank-you message. */
  allowAnotherResponse?: boolean;
  /** Where the form is drawn: its own page (default), a box in the builder, or an embed. */
  variant?: ThemeVariant;
  /** Uploads respondents' files. Without it, file questions turn files away. */
  uploadFile?: FileUploader | undefined;
  /** In conversational forms, shows this step (from 0), for the Studio preview's stepper. */
  previewStep?: number | undefined;
  /** The form link's query string, which fills hidden fields (`?source=instagram`). */
  linkParams?: URLSearchParams | undefined;
  className?: string;
}

/**
 * Animation code arrives after the form first renders: a form's first paint never waits for
 * it, and questions start out in place (AnimatePresence below skips their entrance).
 */
const loadMotionFeatures = () => import('./motion-features').then((module) => module.default);

/** How the thank-you message arrives, as the theme's page transition says. */
const ENTRANCES = {
  none: { opacity: 1, y: 0 },
  fade: { opacity: 0, y: 0 },
  slide: { opacity: 0, y: 6 },
} as const;

/**
 * A whole form as respondents see it: conditional questions, validation and a thank-you, in
 * the theme's layout (all questions on one page, or one at a time) with its progress bar.
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
  className,
}: FormViewProps) {
  const idPrefix = useId();
  const reduceMotion = useReducedMotion() ?? false;
  // Read once: the link does not change while the form is open.
  const [initialAnswers] = useState(() =>
    linkParams ? hiddenFieldValues(schema, linkParams) : undefined,
  );
  const response = useFormResponse({ schema, onSubmit, uploadFile, initialAnswers });
  const { answers, status, visibleIds, fileUploads } = response;
  const conversational = theme.layout.mode === 'conversational';
  // Only conversational forms download the one-question-at-a-time flow.
  const conversationalModule = useConversational(conversational);
  const [conversation, setConversation] = useState<ConversationProgress | null>(null);
  const onProgress = useCallback((progress: ConversationProgress) => {
    setConversation(progress);
  }, []);

  const visibleFields = useMemo(
    () => schema.fields.filter((field) => visibleIds.has(field.id)),
    [schema.fields, visibleIds],
  );
  const numbering = theme.typography.questionNumbering;
  const numbers = useMemo(
    () => questionNumbers(visibleFields, numbering),
    [visibleFields, numbering],
  );

  const progress = (() => {
    if (status === 'done') return null;
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
    // Classic forms: the visible questions answered so far.
    const questions = visibleFields.filter((field) => isShownQuestionType(field.type));
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
    </header>
  );

  const classic = (
    <ClassicForm
      schema={schema}
      response={response}
      visibleFields={visibleFields}
      idPrefix={idPrefix}
      header={header}
      pageHeadingLevel={Title === 'h1' ? 'h2' : 'h3'}
      numbers={numbers}
      pageTransition={theme.motion.pageTransition}
      hiddenFields={hiddenFields}
    />
  );

  return (
    <LazyMotion features={loadMotionFeatures}>
      <ThemeRenderer
        theme={theme}
        variant={variant}
        footer={footer}
        progress={progress}
        className={className}
      >
        {status === 'done' ? (
          <m.div
            role="status"
            initial={reduceMotion ? ENTRANCES.none : ENTRANCES[theme.motion.pageTransition]}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.slow, ease: EASE_STANDARD }}
            className="flex flex-col items-center gap-4 py-12 text-center"
          >
            <CircleCheck aria-hidden className="size-10 text-(--form-accent)" strokeWidth={1.5} />
            <p className="max-w-md form-text whitespace-pre-wrap">
              {schema.settings.successMessage}
            </p>
            {allowAnotherResponse && (
              <button
                type="button"
                className="mt-2 form-text-sm font-medium text-(--form-accent) underline-offset-4 hover:underline"
                onClick={response.reset}
              >
                Submit another response
              </button>
            )}
          </m.div>
        ) : (
          <FileUploadsContext.Provider value={fileUploads}>
            {conversational ? (
              conversationalModule ? (
                <conversationalModule.ConversationalForm
                  schema={schema}
                  theme={theme}
                  response={response}
                  idPrefix={idPrefix}
                  header={header}
                  variant={variant}
                  hiddenFields={hiddenFields}
                  onProgress={onProgress}
                  previewStep={previewStep}
                />
              ) : (
                // Where it has not been preloaded: the title, where the flow will start.
                <div className="flex min-h-[min(24rem,55dvh)] flex-col justify-center">
                  {header}
                </div>
              )
            ) : (
              classic
            )}
          </FileUploadsContext.Provider>
        )}
      </ThemeRenderer>
    </LazyMotion>
  );
}
