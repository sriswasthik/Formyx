import type { AnswerValue, Field, FormSchema, FormTheme } from '@formyx/shared';
import { ChevronLeft } from 'lucide-react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { fieldIds } from '../field-ids';
import { FieldRenderer } from '../field-renderer';
import { FormButton } from '../form-button';
import { questionNumbers } from '../numbering';
import { secondaryButton } from '../styles';
import type { ThemeVariant } from '../theme/theme-renderer';
import type { FormResponse } from '../use-form-response';
import {
  conversationSteps,
  nextStep,
  previousStep,
  resolveStep,
  shouldAutoAdvance,
  stepKey,
  type AnswerIntent,
} from './steps';
import { useKeyboardInset } from './use-keyboard-inset';

/** Long enough to see the answer picked, short enough to feel like one motion. */
export const AUTO_ADVANCE_DELAY_MS = 350;

export interface ConversationProgress {
  /** The question shown, from 0. */
  current: number;
  total: number;
}

interface ConversationalFormProps {
  schema: FormSchema;
  theme: FormTheme;
  response: FormResponse;
  idPrefix: string;
  /** The title and description, shown above the first question. */
  header: ReactNode;
  variant: ThemeVariant;
  hiddenFields?: ReactNode;
  onProgress: (progress: ConversationProgress) => void;
  /** Shows this step (from 0) without checking answers, as the Studio preview's stepper does. */
  previewStep?: number | undefined;
}

/** Where focus goes on a new step: the answer's control, or the step itself. */
function focusStep(node: HTMLElement, field: Field | undefined, idPrefix: string) {
  if (field && field.type !== 'statement') {
    const control = document.getElementById(fieldIds(idPrefix, field).control);
    const group = control?.closest('fieldset');
    const picked = group?.querySelector<HTMLInputElement>('input:checked');
    const target = picked ?? control;
    if (target) {
      target.focus({ preventScroll: true });
      return;
    }
  }
  node.focus({ preventScroll: true });
}

/**
 * The conversational layout: one question at a time. Enter continues, arrow keys move,
 * single-answer questions move on once answered, and Back returns. Each step is checked
 * before moving on; sending checks them all and returns to the first with a problem.
 */
export function ConversationalForm({
  schema,
  theme,
  response,
  idPrefix,
  header,
  variant,
  hiddenFields,
  onProgress,
  previewStep,
}: ConversationalFormProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const { answers, errors, formError, status, visibleIds, handleChange, checkField, submit } =
    response;
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const intent = useRef<AnswerIntent | null>(null);
  const focusPending = useRef(false);
  const autoAdvance = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyboardInset = useKeyboardInset(variant === 'page');

  const steps = useMemo(
    () => conversationSteps(schema.fields, visibleIds),
    [schema.fields, visibleIds],
  );
  const shownId = resolveStep(schema.fields, visibleIds, currentId);
  const index = steps.findIndex((step) => step.id === shownId);
  const field = steps[index];
  const isLast = index === steps.length - 1 || steps.length === 0;
  const numbering = theme.typography.questionNumbering;
  const numbers = useMemo(() => questionNumbers(steps, numbering), [steps, numbering]);

  useEffect(() => {
    onProgress({ current: Math.max(index, 0), total: steps.length });
  }, [index, steps.length, onProgress]);

  const cancelAutoAdvance = useCallback(() => {
    if (autoAdvance.current) clearTimeout(autoAdvance.current);
    autoAdvance.current = null;
  }, []);
  useEffect(() => cancelAutoAdvance, [cancelAutoAdvance]);

  const goTo = useCallback(
    (id: string | null, towards: 1 | -1) => {
      cancelAutoAdvance();
      if (id === null) return;
      setDirection(towards);
      setCurrentId(id);
      focusPending.current = true;
    },
    [cancelAutoAdvance],
  );

  // The Studio preview's stepper jumps straight to a step, when it moves.
  const [shownPreviewStep, setShownPreviewStep] = useState(previewStep);
  if (previewStep !== shownPreviewStep) {
    setShownPreviewStep(previewStep);
    const target =
      previewStep === undefined ? undefined : steps[Math.min(previewStep, steps.length - 1)];
    if (target) setCurrentId(target.id);
  }

  const focusControl = useCallback(
    (id: string) => {
      const target = steps.find((step) => step.id === id);
      if (target) document.getElementById(fieldIds(idPrefix, target).control)?.focus();
    },
    [steps, idPrefix],
  );

  const sendAll = useCallback(async () => {
    const result = await submit();
    if (result.ok) return;
    const firstProblem = steps.find((step) => step.id in result.problems);
    if (!firstProblem) return;
    if (firstProblem.id === shownId) focusControl(firstProblem.id);
    else goTo(firstProblem.id, -1);
  }, [submit, steps, shownId, focusControl, goTo]);

  const advance = useCallback(() => {
    if (status === 'submitting') return;
    if (shownId === null || isLast) {
      if (shownId !== null && checkField(shownId)) {
        focusControl(shownId);
        return;
      }
      void sendAll();
      return;
    }
    if (checkField(shownId)) {
      cancelAutoAdvance();
      focusControl(shownId);
      return;
    }
    goTo(nextStep(steps, shownId), 1);
  }, [status, shownId, isLast, checkField, focusControl, sendAll, cancelAutoAdvance, goTo, steps]);

  const back = useCallback(() => {
    if (shownId !== null) goTo(previousStep(steps, shownId), -1);
  }, [shownId, steps, goTo]);

  // The timer calls the latest `advance`, which sees the answer that started it.
  const advanceRef = useRef(advance);
  useLayoutEffect(() => {
    advanceRef.current = advance;
  });

  const onAnswer = useCallback(
    (fieldId: string, value: AnswerValue) => {
      handleChange(fieldId, value);
      const answered = steps.find((step) => step.id === fieldId);
      if (!answered) return;
      cancelAutoAdvance();
      if (
        shouldAutoAdvance({
          type: answered.type,
          intent: intent.current,
          enabled: theme.layout.autoAdvance,
          isLast: steps.at(-1)?.id === fieldId,
          answered: value !== null,
        })
      ) {
        autoAdvance.current = setTimeout(() => {
          autoAdvance.current = null;
          advanceRef.current();
        }, AUTO_ADVANCE_DELAY_MS);
      }
    },
    [handleChange, steps, cancelAutoAdvance, theme.layout.autoAdvance],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    const { key } = event;
    if (key === 'Enter' || key === ' ') intent.current = 'key';
    else if (key.startsWith('Arrow')) intent.current = 'arrow';
    const target = event.target as HTMLElement & { type?: string };
    const action = stepKey(event, target);
    if (action === null) return;
    event.preventDefault();
    if (action === 'next') advance();
    else back();
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    advance();
  };

  // Moves focus into a step once it is in place (after the previous one has left).
  const stepRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !focusPending.current) return;
      focusPending.current = false;
      focusStep(node, field, idPrefix);
    },
    [field, idPrefix],
  );

  const animate = !reduceMotion && theme.motion.pageTransition !== 'none';
  const slide = theme.motion.pageTransition === 'slide' ? 24 : 0;
  const transition = animate ? { duration: DURATION.slow, ease: EASE_STANDARD } : { duration: 0 };
  const longText = field?.type === 'long_text';
  const busy = status === 'submitting';

  return (
    // Shortcuts for the whole step: key presses and taps on the controls inside bubble here.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <form
      noValidate
      onSubmit={onSubmit}
      onKeyDown={onKeyDown}
      onPointerDown={() => {
        intent.current = 'pointer';
      }}
      data-conversational
      className="flex flex-col"
    >
      <p aria-live="polite" className="sr-only">
        {steps.length > 0 && `Question ${index + 1} of ${steps.length}`}
      </p>
      {/* The title and the question are centred together; after the first question the
          title stays the page's heading for screen readers only. */}
      <div className="flex min-h-[min(24rem,55dvh)] flex-col justify-center">
        <div className={cn(index > 0 && 'sr-only')}>{header}</div>
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <m.div
            key={shownId ?? 'empty'}
            ref={stepRef}
            tabIndex={-1}
            data-step={shownId ?? undefined}
            className="outline-none"
            initial={animate ? { opacity: 0, y: slide * direction } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={animate ? { opacity: 0, y: -slide * direction } : { opacity: 1 }}
            transition={transition}
          >
            {field && (
              <FieldRenderer
                field={field}
                mode="respondent"
                idPrefix={idPrefix}
                size="large"
                number={numbers.get(field.id)}
                value={answers[field.id]}
                error={errors[field.id]}
                onChange={onAnswer}
              />
            )}
          </m.div>
        </AnimatePresence>
      </div>
      {hiddenFields}
      <div
        data-step-nav
        className={cn(
          'flex flex-col gap-3 pt-8',
          // On phones the buttons stay in reach, above the on-screen keyboard.
          variant === 'page' &&
            '@max-xl:sticky @max-xl:bottom-0 @max-xl:pb-[max(1rem,env(safe-area-inset-bottom))]',
        )}
        style={keyboardInset > 0 ? { bottom: keyboardInset } : undefined}
      >
        <div className="flex items-center gap-3">
          {index > 0 && (
            <button type="button" className={secondaryButton} onClick={back} disabled={busy}>
              <ChevronLeft aria-hidden />
              Back
            </button>
          )}
          <FormButton
            type="submit"
            busy={busy}
            disabled={busy}
            className={cn(!theme.components.buttonFullWidth && 'ml-auto @xl:ml-0')}
          >
            {isLast ? schema.settings.submitButtonText : 'Next'}
          </FormButton>
          {steps.length > 0 && (
            <span className="hidden form-text-sm text-(--form-muted) @xl:inline">
              {longText ? 'or press Ctrl + Enter' : 'or press Enter'}
            </span>
          )}
        </div>
        <p role="alert" className="form-text-sm text-(--form-danger) empty:hidden">
          {formError}
        </p>
      </div>
    </form>
  );
}
