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
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { fieldIds } from './field-ids';
import { FieldRenderer } from './field-renderer';
import { FormCover, FormLogo } from './branding';
import { FormThemeScope } from './form-theme';

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
  className?: string;
}

type Status = 'filling' | 'submitting' | 'done';

const primaryButton = cn(
  'inline-flex h-11 items-center justify-center gap-2 rounded-(--form-radius) px-5 text-16 font-medium',
  'bg-(--form-accent) text-(--form-accent-fg) transition-opacity duration-150 ease-standard',
  'hover:not-disabled:opacity-90 active:not-disabled:opacity-80 disabled:opacity-60',
);

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
  className,
}: FormViewProps) {
  const idPrefix = useId();
  const reduceMotion = useReducedMotion() ?? false;
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('filling');

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

  const showErrors = (problems: Record<string, string>) => {
    setErrors(problems);
    const firstInvalid = schema.fields.find((field) => field.id in problems);
    if (firstInvalid) document.getElementById(fieldIds(idPrefix, firstInvalid).control)?.focus();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problems = validateAnswers(schema, answers);
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
    <FormThemeScope theme={theme} className={cn('flex min-h-full flex-col', className)}>
      <FormCover theme={theme} />
      <div className="mx-auto w-full max-w-[640px] flex-1 px-6 py-10 sm:py-14">
        {status === 'done' ? (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.slow, ease: EASE_STANDARD }}
            className="flex flex-col items-center gap-4 py-12 text-center"
          >
            <CircleCheck aria-hidden className="size-10 text-(--form-accent)" strokeWidth={1.5} />
            <p className="max-w-md text-16 whitespace-pre-wrap">{schema.settings.successMessage}</p>
            {allowAnotherResponse && (
              <button
                type="button"
                className="mt-2 text-14 font-medium text-(--form-accent) underline-offset-4 hover:underline"
                onClick={() => {
                  setAnswers({});
                  setErrors({});
                  setStatus('filling');
                }}
              >
                Submit another response
              </button>
            )}
          </motion.div>
        ) : (
          <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col">
            <header className="flex flex-col gap-3 pb-8">
              <FormLogo theme={theme} className="mb-3" />
              <Title className="text-24 font-semibold tracking-tight break-words sm:text-32">
                {title}
              </Title>
              {schema.description && (
                <p className="text-16 break-words whitespace-pre-wrap text-(--form-muted)">
                  {schema.description}
                </p>
              )}
            </header>
            <AnimatePresence initial={false}>
              {schema.fields
                .filter((field) => visibleIds.has(field.id))
                .map((field) => (
                  <motion.div
                    key={field.id}
                    // Clipped only while opening or closing, so focus rings show otherwise.
                    initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
                    animate={{ height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }}
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
                  </motion.div>
                ))}
            </AnimatePresence>
            {hiddenFields}
            <div className="flex flex-col items-start gap-3">
              <button type="submit" className={primaryButton} disabled={status === 'submitting'}>
                {status === 'submitting' && (
                  <LoaderCircle className="motion-safe:animate-spin" aria-hidden />
                )}
                {schema.settings.submitButtonText}
              </button>
              <p role="alert" className="text-14 text-(--form-danger) empty:hidden">
                {formError ??
                  (errorCount > 0 &&
                    (errorCount === 1
                      ? '1 question needs your attention.'
                      : `${errorCount} questions need your attention.`))}
              </p>
            </div>
          </form>
        )}
      </div>
      {footer}
    </FormThemeScope>
  );
}
