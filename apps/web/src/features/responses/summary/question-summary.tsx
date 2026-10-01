import {
  averageAnswer,
  FIELD_TYPE_LABELS,
  shareOf,
  type ChoiceSummary,
  type NumberSummary,
  type QuestionSummary,
  type RatingSummary,
  type TextSummary,
} from '@formyx/shared';
import { ArrowRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useId } from 'react';
import { Link } from 'react-router';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { formatRelativeTime } from '@/lib/relative-time';
import { cn } from '@/lib/utils';
import { formatCalendarDate, formatCount, formatNumber, formatPercent } from '../format';

/** One answer's share: label, count and percentage, over a thin bar. */
function ShareRow({
  label,
  count,
  share,
  muted = false,
}: {
  label: string;
  count: number;
  share: number;
  muted?: boolean;
}) {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-4 text-14">
        <span className={cn('min-w-0 break-words', muted && 'text-muted-foreground')}>{label}</span>
        <span className="shrink-0 text-13 text-muted-foreground tabular-nums">
          <span className="font-medium text-foreground">{formatPercent(share)}</span>
          <span aria-hidden> · </span>
          <span className="sr-only">, </span>
          {formatCount(count)}
        </span>
      </div>
      {/* Square where the bar starts, rounded where the value ends. */}
      <div aria-hidden className="h-2 w-full rounded-r-[4px] bg-muted">
        <motion.div
          className={cn('h-full rounded-r-[4px]', muted ? 'bg-control' : 'bg-accent')}
          initial={{ width: 0 }}
          animate={{ width: `${share * 100}%` }}
          transition={{ duration: reduceMotion ? 0 : DURATION.slow, ease: EASE_STANDARD }}
        />
      </div>
    </li>
  );
}

function ChoiceBody({ summary }: { summary: ChoiceSummary }) {
  if (summary.answered === 0) return <NoAnswers />;
  return (
    <>
      <ul className="flex flex-col gap-4">
        {summary.options.map((option) => (
          <ShareRow
            key={option.id}
            label={option.label || 'Untitled option'}
            count={option.count}
            share={shareOf(option.count, summary.answered)}
          />
        ))}
        {summary.removed > 0 && (
          <ShareRow
            label="Options removed since"
            count={summary.removed}
            share={shareOf(summary.removed, summary.answered)}
            muted
          />
        )}
      </ul>
      {summary.type === 'multi_choice' && (
        <p className="mt-4 text-12 text-muted-foreground">
          People could pick more than one option, so the percentages add up to more than 100%.
        </p>
      )}
    </>
  );
}

function RatingBody({ summary }: { summary: RatingSummary }) {
  const average = averageAnswer(summary);
  if (average === null) return <NoAnswers />;
  // Highest rating first, as people read a rating scale.
  const ratings = summary.counts.map((count, index) => ({ rating: index + 1, count })).reverse();

  return (
    <div className="flex flex-col gap-5">
      <p className="flex items-baseline gap-2">
        <span className="text-24 font-semibold tracking-tight tabular-nums">
          {formatNumber(average, 1)}
        </span>
        <span className="text-13 text-muted-foreground">average out of {summary.scale}</span>
      </p>
      <ul className="flex flex-col gap-3">
        {ratings.map(({ rating, count }) => (
          <ShareRow
            key={rating}
            label={`${rating} of ${summary.scale}`}
            count={count}
            share={shareOf(count, summary.answered)}
          />
        ))}
      </ul>
    </div>
  );
}

function NumberBody({ summary }: { summary: NumberSummary }) {
  const average = averageAnswer(summary);
  if (average === null || summary.min === null || summary.max === null) return <NoAnswers />;
  const stats = [
    { label: 'Minimum', value: summary.min },
    { label: 'Average', value: average },
    { label: 'Maximum', value: summary.max },
  ];

  return (
    <dl className="grid grid-cols-3 gap-3">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-lg bg-surface px-3 py-2.5">
          <dt className="text-12 text-muted-foreground">{stat.label}</dt>
          <dd className="mt-0.5 truncate text-16 font-semibold tracking-tight tabular-nums">
            {formatNumber(stat.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function TextBody({ summary }: { summary: TextSummary }) {
  if (summary.latest.length === 0) return <NoAnswers />;
  const now = new Date();

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y">
        {summary.latest.map((answer) => (
          <li key={answer.submissionId} className="flex flex-col gap-0.5 py-2.5 first:pt-0">
            <p className="line-clamp-3 text-14 break-words whitespace-pre-line">
              {summary.type === 'date' ? formatCalendarDate(answer.value) : answer.value}
            </p>
            <p className="text-12 text-muted-foreground">
              <time dateTime={answer.createdAt}>{formatRelativeTime(answer.createdAt, now)}</time>
            </p>
          </li>
        ))}
      </ul>
      {/* The table has every answer in full, next to the rest of each response. */}
      <Link
        to={`?tab=responses&answered=${encodeURIComponent(summary.fieldId)}`}
        className="inline-flex w-fit items-center gap-1.5 rounded-md text-13 font-medium text-accent transition-colors duration-150 hover:underline"
      >
        {summary.answered === 1
          ? 'View the answer'
          : `View all ${formatCount(summary.answered)} answers`}
        <ArrowRight aria-hidden />
      </Link>
    </div>
  );
}

function NoAnswers() {
  return <p className="text-14 text-muted-foreground">Nobody has answered this yet.</p>;
}

/** What people answered to one question. */
export function QuestionSummaryCard({
  summary,
  index,
  responses,
}: {
  summary: QuestionSummary;
  /** The question's position among the form's questions, from 1. */
  index: number;
  /** All responses, to say how many answered this one. */
  responses: number;
}) {
  const headingId = useId();
  const type =
    summary.kind === 'rating' ? 'rating' : summary.kind === 'number' ? 'number' : summary.type;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-5 rounded-xl border bg-card p-5 text-card-foreground sm:p-6"
    >
      <header className="flex flex-col gap-1">
        <h3 id={headingId} className="text-14 font-semibold tracking-tight break-words">
          <span className="mr-2 text-muted-foreground tabular-nums">{index}.</span>
          {summary.label || 'Untitled question'}
        </h3>
        <p className="text-13 text-muted-foreground tabular-nums">
          {FIELD_TYPE_LABELS[type]} · {formatCount(summary.answered)} of {formatCount(responses)}{' '}
          answered
        </p>
      </header>
      {summary.kind === 'choice' && <ChoiceBody summary={summary} />}
      {summary.kind === 'rating' && <RatingBody summary={summary} />}
      {summary.kind === 'number' && <NumberBody summary={summary} />}
      {summary.kind === 'text' && <TextBody summary={summary} />}
    </section>
  );
}
