import {
  evaluateVisibility,
  validateAnswers,
  type AnswerValue,
  type Answers,
  type FormSchema,
  type FormTheme,
} from '@formyx/shared';
import { CircleCheck, LoaderCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useId, useMemo, useState, type FormEvent } from 'react';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { fieldIds } from './field-ids';
import { FieldRenderer } from './field-renderer';
import { FormThemeScope } from './form-theme';

interface FormViewProps {
  title: string;
  schema: FormSchema;
  theme: FormTheme;
  /** `h1` on the public page; `h2` inside the editor, which has its own heading. */
  titleAs?: 'h1' | 'h2';
  /** Receives the answers to visible questions once they are all valid. */
  onSubmit?: (answers: Answers) => void | Promise<void>;
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
  className,
}: FormViewProps) {
  const idPrefix = useId();
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>('filling');

  const visibleIds = useMemo(() => evaluateVisibility(schema, answers), [schema, answers]);
  const errorCount = Object.keys(errors).length;

  const handleChange = useCallback((fieldId: string, value: AnswerValue) => {
    setAnswers((current) => ({ ...current, [fieldId]: value }));
    setErrors((current) => {
      if (!(fieldId in current)) return current;
      const { [fieldId]: _fixed, ...rest } = current;
      return rest;
    });
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problems = validateAnswers(schema, answers);
    const firstInvalid = schema.fields.find((field) => field.id in problems);
    if (firstInvalid) {
      setErrors(problems);
      document.getElementById(fieldIds(idPrefix, firstInvalid).control)?.focus();
      return;
    }

    setStatus('submitting');
    const visibleAnswers = Object.fromEntries(
      Object.entries(answers).filter(([fieldId]) => visibleIds.has(fieldId)),
    );
    try {
      await onSubmit?.(visibleAnswers);
      setStatus('done');
    } catch {
      setStatus('filling');
    }
  };

  return (
    <FormThemeScope theme={theme} className={cn('min-h-full', className)}>
      <div className="mx-auto w-full max-w-xl px-6 py-10 sm:py-14">
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
          </motion.div>
        ) : (
          <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-8">
            <header className="flex flex-col gap-3">
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
                    layout="position"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: DURATION.fast } }}
                    transition={{ duration: DURATION.base, ease: EASE_STANDARD }}
                  >
                    <FieldRenderer
                      field={field}
                      mode="respondent"
                      idPrefix={idPrefix}
                      value={answers[field.id]}
                      error={errors[field.id]}
                      onChange={handleChange}
                    />
                  </motion.div>
                ))}
            </AnimatePresence>
            <motion.div layout="position" className="flex flex-col items-start gap-3">
              <button type="submit" className={primaryButton} disabled={status === 'submitting'}>
                {status === 'submitting' && (
                  <LoaderCircle className="motion-safe:animate-spin" aria-hidden />
                )}
                {schema.settings.submitButtonText}
              </button>
              <p role="alert" className="text-14 text-(--form-danger) empty:hidden">
                {errorCount > 0 &&
                  (errorCount === 1
                    ? '1 question needs your attention.'
                    : `${errorCount} questions need your attention.`)}
              </p>
            </motion.div>
          </form>
        )}
      </div>
    </FormThemeScope>
  );
}
