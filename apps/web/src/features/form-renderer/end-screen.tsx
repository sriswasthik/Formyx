import {
  buildRedirectUrl,
  pipedAnswer,
  resolvePiping,
  type AnswerValue,
  type EndScreen,
  type Field,
  type FormSchema,
  type SubmissionOutcome,
} from '@formyx/shared';
import { Check, CircleCheck, X } from 'lucide-react';
import { m, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { RichText } from './rich-text';
import { formButton, secondaryButton } from './styles';
import { useFormTheme } from './theme/theme-context';

/** How the end screen arrives, as the theme's page transition says. */
const ENTRANCES = {
  none: { opacity: 1, y: 0 },
  fade: { opacity: 0, y: 0 },
  slide: { opacity: 0, y: 6 },
} as const;

export interface EndScreenViewProps {
  schema: FormSchema;
  screen: EndScreen;
  outcome: SubmissionOutcome;
  /** The answers given, for piping and the quiz review. */
  answers: Readonly<Record<string, AnswerValue>>;
  titleAs: 'h1' | 'h2';
  /** Follows the end screen's redirect; off in the editor's preview. */
  allowRedirect: boolean;
  /** Offers "Submit another response". */
  onAnotherResponse?: (() => void) | undefined;
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** The right answers to a quiz question, as words. */
function expectedText(field: Field, expected: readonly string[]): string {
  if (field.type === 'yes_no')
    return expected.map((id) => (id === 'yes' ? 'Yes' : 'No')).join(', ');
  if ('options' in field) {
    return expected
      .map((id) => field.options.find((option) => option.id === id)?.label ?? '')
      .filter(Boolean)
      .join(', ');
  }
  return expected.join(' or ');
}

/** "Taking you on in 3 seconds", counting down, then going. */
function Redirect({ url, delaySeconds }: { url: string; delaySeconds: number }) {
  const [left, setLeft] = useState(delaySeconds);
  const gone = useRef(false);
  useEffect(() => {
    if (left <= 0) {
      // Once: a second navigation would cancel the first.
      if (!gone.current) window.location.assign(url);
      gone.current = true;
      return;
    }
    const timer = setTimeout(() => {
      setLeft((seconds) => seconds - 1);
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [left, url]);
  return (
    <p className="form-text-sm text-(--form-muted)" aria-live="polite">
      {left > 0 ? `Taking you on in ${left} second${left === 1 ? '' : 's'}… ` : 'Taking you on… '}
      <a href={url} className="font-medium text-(--form-accent) underline-offset-4 hover:underline">
        Go now
      </a>
    </p>
  );
}

/**
 * What respondents see after sending: the end screen the server picked, with answers and
 * values piped in, the quiz score and review where the form shows them, a button, and the
 * redirect.
 */
export function EndScreenView({
  schema,
  screen,
  outcome,
  answers,
  titleAs: Title,
  allowRedirect,
  onAnotherResponse,
}: EndScreenViewProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const theme = useFormTheme();
  const fieldById = new Map(schema.fields.map((field) => [field.id, field]));
  const piping = {
    fieldById,
    answers,
    values: outcome.values,
    variables: schema.logic.variables,
  };
  const title = resolvePiping(screen.title, piping).trim();
  const message = resolvePiping(screen.message, piping, { richText: true });
  const quiz = outcome.quiz;
  const redirectUrl =
    allowRedirect && screen.redirect
      ? buildRedirectUrl(screen.redirect, { fieldById, answers, values: outcome.values })
      : null;
  const button = screen.button && isHttps(screen.button.url) ? screen.button : null;
  const centered = screen.align === 'center';

  return (
    <m.div
      role="status"
      initial={reduceMotion ? ENTRANCES.none : ENTRANCES[theme.motion.pageTransition]}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.slow, ease: EASE_STANDARD }}
      className={cn(
        'flex flex-col gap-4 py-12',
        centered ? 'items-center text-center' : 'items-start',
      )}
      data-end-screen={screen.id}
    >
      {screen.imageUrl ? (
        <img
          src={screen.imageUrl}
          alt=""
          className="max-h-56 w-full max-w-md rounded-(--form-radius) object-cover"
        />
      ) : (
        !title && (
          <CircleCheck aria-hidden className="size-10 text-(--form-accent)" strokeWidth={1.5} />
        )
      )}
      {title && <Title className="form-title break-words">{title}</Title>}
      {message.trim() && <RichText text={message} className="max-w-md form-text" />}

      {screen.showScore && quiz && (
        <div
          className="flex flex-col gap-1 rounded-(--form-radius) border border-(--form-border) px-5 py-4"
          data-quiz-score
        >
          <p className="form-text-lg font-semibold tabular-nums">
            {quiz.score} out of {quiz.max}
            <span className="font-normal text-(--form-muted)"> ({quiz.percent}%)</span>
          </p>
          {quiz.passed !== null && (
            <p className="form-text-sm text-(--form-muted)">
              {quiz.passed ? 'You passed.' : 'Not a pass this time.'}
            </p>
          )}
        </div>
      )}

      {quiz?.review && quiz.review.length > 0 && (
        <section
          aria-label="Your answers"
          className="flex w-full max-w-md flex-col gap-3 text-left"
        >
          <ol className="flex flex-col gap-3">
            {quiz.review.map((item) => {
              const field = fieldById.get(item.fieldId);
              if (!field) return null;
              const given = pipedAnswer(field, answers[item.fieldId]);
              return (
                <li
                  key={item.fieldId}
                  className="flex gap-3 rounded-(--form-radius) border border-(--form-border) px-4 py-3"
                >
                  {item.correct ? (
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-(--form-accent)" />
                  ) : (
                    <X aria-hidden className="mt-0.5 size-4 shrink-0 text-(--form-danger)" />
                  )}
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="form-text font-medium break-words">
                      {resolvePiping(field.label, piping) || 'Untitled question'}
                    </p>
                    <p className="form-text-sm break-words text-(--form-muted)">
                      <span className="sr-only">{item.correct ? 'Right. ' : 'Not right. '}</span>
                      Your answer: {given || 'none'}
                      {!item.correct && (
                        <>
                          <br />
                          Right answer: {expectedText(field, item.expected)}
                        </>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {button && (
        <a href={button.url} className={cn(formButton(theme.components), 'w-auto no-underline')}>
          {button.label}
        </a>
      )}
      {redirectUrl && screen.redirect && (
        <Redirect url={redirectUrl} delaySeconds={screen.redirect.delaySeconds} />
      )}
      {onAnotherResponse && !redirectUrl && (
        <button type="button" className={cn(secondaryButton, 'mt-2')} onClick={onAnotherResponse}>
          Submit another response
        </button>
      )}
    </m.div>
  );
}
