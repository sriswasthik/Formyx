import {
  isAnswerableFieldType,
  isAnswered,
  type FormSchema,
  type FormTheme,
  type SubmittedAnswers,
} from '@formyx/shared';
import { CircleCheck } from 'lucide-react';
import { AnimatePresence, LazyMotion, m, useReducedMotion } from 'motion/react';
import { lazy, Suspense, useCallback, useId, useMemo, useState, type ReactNode } from 'react';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import type { ConversationProgress } from './conversational/conversational-form';
import { fieldIds } from './field-ids';
import { FieldRenderer } from './field-renderer';
import { FormLogo } from './branding';
import { FileUploadsContext, type FileUploader } from './file-uploads';
import { FormButton } from './form-button';
import { FormProgress } from './form-progress';
import { questionNumbers } from './numbering';
import { ThemeRenderer, type ThemeVariant } from './theme/theme-renderer';
import { useFormResponse, type SubmitOutcome } from './use-form-response';

export type { SubmitOutcome } from './use-form-response';

/** Only conversational forms download the one-question-at-a-time flow. */
const ConversationalForm = lazy(() =>
  import('./conversational/conversational-form').then((module) => ({
    default: module.ConversationalForm,
  })),
);

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
  className,
}: FormViewProps) {
  const idPrefix = useId();
  const reduceMotion = useReducedMotion() ?? false;
  const response = useFormResponse({ schema, onSubmit, uploadFile });
  const { answers, errors, formError, status, visibleIds, fileUploads, handleChange } = response;
  const conversational = theme.layout.mode === 'conversational';
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
  const errorCount = Object.keys(errors).length;
  // Questions that appear or go away open and close smoothly, or at once with less motion.
  const reveal = reduceMotion ? { duration: 0 } : { duration: DURATION.base, ease: EASE_STANDARD };

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
    const questions = visibleFields.filter((field) => isAnswerableFieldType(field.type));
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

  const submitClassic = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await response.submit();
    if (result.ok) return;
    const firstInvalid = schema.fields.find((field) => field.id in result.problems);
    if (firstInvalid) document.getElementById(fieldIds(idPrefix, firstInvalid).control)?.focus();
  };

  const classic = (
    <form noValidate onSubmit={(event) => void submitClassic(event)} className="flex flex-col">
      {header}
      <AnimatePresence initial={false}>
        {visibleFields.map((field) => (
          <m.div
            key={field.id}
            // Clipped only while opening or closing, so focus rings show otherwise.
            initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
            animate={{
              height: 'auto',
              opacity: 1,
              transitionEnd: { overflow: 'visible' },
            }}
            exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
            transition={reveal}
          >
            <div className="pb-8">
              <FieldRenderer
                field={field}
                mode="respondent"
                idPrefix={idPrefix}
                number={numbers.get(field.id)}
                value={answers[field.id]}
                error={errors[field.id]}
                onChange={handleChange}
              />
            </div>
          </m.div>
        ))}
      </AnimatePresence>
      {hiddenFields}
      <div className="flex flex-col items-start gap-3">
        <FormButton type="submit" busy={status === 'submitting'} disabled={status === 'submitting'}>
          {schema.settings.submitButtonText}
        </FormButton>
        <p role="alert" className="form-text-sm text-(--form-danger) empty:hidden">
          {formError ??
            (errorCount > 0 &&
              (errorCount === 1
                ? '1 question needs your attention.'
                : `${errorCount} questions need your attention.`))}
        </p>
      </div>
    </form>
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
              <Suspense
                fallback={
                  <div className="flex flex-col">
                    {header}
                    <div className="min-h-[min(28rem,60dvh)]" />
                  </div>
                }
              >
                <ConversationalForm
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
              </Suspense>
            ) : (
              classic
            )}
          </FileUploadsContext.Provider>
        )}
      </ThemeRenderer>
    </LazyMotion>
  );
}
