import {
  buildSubmissionValidator,
  evaluateVisibility,
  validateAnswers,
  type AnswerValue,
  type FormSchema,
  type FormTheme,
  type SubmittedAnswers,
} from '@formyx/shared';
import { CircleCheck, LoaderCircle } from 'lucide-react';
import { AnimatePresence, LazyMotion, m, useReducedMotion } from 'motion/react';
import { useCallback, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { fieldIds } from './field-ids';
import { FieldRenderer } from './field-renderer';
import { FormLogo } from './branding';
import { FileUploadsContext, type FileUploader, type FileUploads } from './file-uploads';
import { submitButton } from './styles';
import { ThemeRenderer, type ThemeVariant } from './theme/theme-renderer';

/** How a handed-over submission went. Problems keep the form open to fix them. */
export type SubmitOutcome =
  | { ok: true }
  | {
      ok: false;
      /** Problems with particular answers, by field id, shown under those questions. */
      fieldErrors?: Record<string, string>;
      /** A problem with the whole submission, shown by the submit button. */
      message?: string;
    };

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
  className?: string;
}

type Status = 'filling' | 'submitting' | 'done';

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

/** A whole form as respondents see it: conditional questions, validation and a thank-you. */
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
  className,
}: FormViewProps) {
  const idPrefix = useId();
  const reduceMotion = useReducedMotion() ?? false;
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('filling');
  /** Questions whose file is still on its way to storage. */
  const [uploading, setUploadingIds] = useState<ReadonlySet<string>>(() => new Set());

  const visibleIds = useMemo(() => evaluateVisibility(schema, answers), [schema, answers]);
  const errorCount = Object.keys(errors).length;
  // Questions that appear or go away open and close smoothly, or at once with less motion.
  const reveal = reduceMotion ? { duration: 0 } : { duration: DURATION.base, ease: EASE_STANDARD };

  const handleChange = useCallback((fieldId: string, value: AnswerValue) => {
    setAnswers((current) => ({ ...current, [fieldId]: value }));
    setErrors((current) => {
      if (!(fieldId in current)) return current;
      const { [fieldId]: _fixed, ...rest } = current;
      return rest;
    });
  }, []);

  const setUploading = useCallback((fieldId: string, busy: boolean) => {
    setUploadingIds((current) => {
      if (current.has(fieldId) === busy) return current;
      const next = new Set(current);
      if (busy) next.add(fieldId);
      else next.delete(fieldId);
      return next;
    });
  }, []);

  const reportProblem = useCallback((fieldId: string, message: string) => {
    setErrors((current) => ({ ...current, [fieldId]: message }));
  }, []);

  const fileUploads = useMemo<FileUploads>(
    () => ({ upload: uploadFile ?? null, setUploading, reportProblem }),
    [uploadFile, setUploading, reportProblem],
  );

  const showErrors = (problems: Record<string, string>) => {
    setErrors(problems);
    const firstInvalid = schema.fields.find((field) => field.id in problems);
    if (firstInvalid) document.getElementById(fieldIds(idPrefix, firstInvalid).control)?.focus();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problems = validateAnswers(schema, answers);
    for (const field of schema.fields) {
      if (uploading.has(field.id) && visibleIds.has(field.id)) {
        problems[field.id] = 'Wait for the file to finish uploading';
      }
    }
    if (Object.keys(problems).length > 0) {
      setFormError(null);
      showErrors(problems);
      return;
    }

    setStatus('submitting');
    setFormError(null);
    try {
      const submitted = buildSubmissionValidator(schema, answers).parse(answers);
      const outcome = onSubmit ? await onSubmit(submitted) : { ok: true as const };
      if (!outcome.ok) {
        setStatus('filling');
        setFormError(outcome.message ?? null);
        if (outcome.fieldErrors) showErrors(outcome.fieldErrors);
        return;
      }
      setStatus('done');
    } catch {
      setStatus('filling');
      setFormError('Your answers could not be sent. Check your connection and try again.');
    }
  };

  return (
    <LazyMotion features={loadMotionFeatures}>
      <ThemeRenderer theme={theme} variant={variant} footer={footer} className={className}>
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
                onClick={() => {
                  setAnswers({});
                  setErrors({});
                  setStatus('filling');
                }}
              >
                Submit another response
              </button>
            )}
          </m.div>
        ) : (
          <FileUploadsContext.Provider value={fileUploads}>
            <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col">
              <header className="flex flex-col gap-3 pb-8 [text-align:var(--form-text-align)]">
                <FormLogo theme={theme} placement="header" className="mb-3" />
                <Title className="form-title break-words @xl:form-title-lg">{title}</Title>
                {schema.description && (
                  <p className="form-text break-words whitespace-pre-wrap text-(--form-muted)">
                    {schema.description}
                  </p>
                )}
              </header>
              <AnimatePresence initial={false}>
                {schema.fields
                  .filter((field) => visibleIds.has(field.id))
                  .map((field) => (
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
                <button type="submit" className={submitButton} disabled={status === 'submitting'}>
                  {status === 'submitting' && (
                    <LoaderCircle className="motion-safe:animate-spin" aria-hidden />
                  )}
                  {schema.settings.submitButtonText}
                </button>
                <p role="alert" className="form-text-sm text-(--form-danger) empty:hidden">
                  {formError ??
                    (errorCount > 0 &&
                      (errorCount === 1
                        ? '1 question needs your attention.'
                        : `${errorCount} questions need your attention.`))}
                </p>
              </div>
            </form>
          </FileUploadsContext.Provider>
        )}
      </ThemeRenderer>
    </LazyMotion>
  );
}
