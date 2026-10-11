import {
  averageAnswer,
  averageRanks,
  FIELD_TYPE_LABELS,
  formatCurrency,
  formatPhone,
  npsBreakdown,
  shareOf,
  type ChoiceSummary,
  type FieldType,
  type MatrixSummary,
  type NpsSummary,
  type NumberSummary,
  type QuestionSummary,
  type RankingSummary,
  type RatingSummary,
  type ScaleSummary,
  type TextSummary,
  type ValuesSummary,
} from '@formyx/shared';
import { ArrowRight } from 'lucide-react';
import { m, useReducedMotion } from 'motion/react';
import { useId } from 'react';
import type * as React from 'react';
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
        <m.div
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
  const picks = summary.options.reduce((total, option) => total + option.count, summary.removed);
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
      {/* Several picks per response (multiple choice, or pictures that allow several). */}
      {picks > summary.answered && (
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

/** A number as asked: an amount in its currency, a slider value with its unit. */
function formatAmount(summary: NumberSummary, value: number): string {
  if (summary.currency) return formatCurrency(value, summary.currency);
  const number = formatNumber(value);
  return summary.unit ? `${number} ${summary.unit}` : number;
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
            {formatAmount(summary, stat.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A headline figure and what it is. */
function Headline({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <p className="flex items-baseline gap-2">
      <span className="text-24 font-semibold tracking-tight tabular-nums">{value}</span>
      <span className="text-13 text-muted-foreground">{children}</span>
    </p>
  );
}

function NpsBody({ summary }: { summary: NpsSummary }) {
  const { promoters, passives, detractors, score } = npsBreakdown(summary);
  if (score === null) return <NoAnswers />;
  const groups = [
    { label: 'Promoters (9–10)', count: promoters },
    { label: 'Passives (7–8)', count: passives },
    { label: 'Detractors (0–6)', count: detractors },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Headline value={score > 0 ? `+${score}` : String(score)}>
        Net Promoter Score, from −100 to +100
      </Headline>
      <ul className="flex flex-col gap-3">
        {groups.map((group) => (
          <ShareRow
            key={group.label}
            label={group.label}
            count={group.count}
            share={shareOf(group.count, summary.answered)}
          />
        ))}
      </ul>
    </div>
  );
}

function ScaleBody({ summary }: { summary: ScaleSummary }) {
  const average = averageAnswer(summary);
  if (average === null) return <NoAnswers />;
  // Highest first, as with ratings; the ends carry their labels.
  const points = summary.counts
    .map((count, index) => {
      const value = summary.start + index;
      const label =
        value === summary.end && summary.highLabel
          ? `${value} · ${summary.highLabel}`
          : value === summary.start && summary.lowLabel
            ? `${value} · ${summary.lowLabel}`
            : String(value);
      return { value, label, count };
    })
    .reverse();

  return (
    <div className="flex flex-col gap-5">
      <Headline value={formatNumber(average, 1)}>
        average, from {summary.start} to {summary.end}
      </Headline>
      <ul className="flex flex-col gap-3">
        {points.map((point) => (
          <ShareRow
            key={point.value}
            label={point.label}
            count={point.count}
            share={shareOf(point.count, summary.answered)}
          />
        ))}
      </ul>
    </div>
  );
}

function RankingBody({ summary }: { summary: RankingSummary }) {
  if (summary.answered === 0) return <NoAnswers />;
  const ranks = averageRanks(summary);

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col divide-y">
        {ranks.map((option, index) => (
          <li key={option.id} className="flex items-baseline gap-3 py-2.5 first:pt-0">
            <span className="w-5 shrink-0 text-13 text-muted-foreground tabular-nums">
              {index + 1}.
            </span>
            <span className="min-w-0 flex-1 text-14 break-words">
              {option.label || 'Untitled option'}
            </span>
            <span className="shrink-0 text-13 text-muted-foreground tabular-nums">
              {option.average === null
                ? 'Not ranked'
                : `Average place ${formatNumber(option.average, 1)}`}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-12 text-muted-foreground">Ordered by average place; 1 is ranked first.</p>
    </div>
  );
}

function MatrixBody({ summary }: { summary: MatrixSummary }) {
  if (summary.answered === 0) return <NoAnswers />;

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-max text-13">
        <thead>
          <tr className="border-b">
            <th scope="col" className="py-2 pr-4 text-left font-medium text-muted-foreground">
              <span className="sr-only">Row</span>
            </th>
            {summary.columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className="px-2 py-2 text-right font-medium text-muted-foreground"
              >
                {column.label || 'Untitled'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((row) => {
            const top = Math.max(0, ...row.counts);
            return (
              <tr key={row.id} className="border-b last:border-b-0">
                <th scope="row" className="max-w-56 py-2.5 pr-4 text-left font-normal break-words">
                  {row.label || 'Untitled row'}
                </th>
                {row.counts.map((count, index) => (
                  <td
                    key={summary.columns[index]?.id ?? index}
                    className={cn(
                      'px-2 py-2.5 text-right tabular-nums',
                      count > 0 && count === top
                        ? 'font-medium text-foreground'
                        : 'text-muted-foreground',
                    )}
                  >
                    {formatPercent(shareOf(count, row.answered))}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-12 text-muted-foreground">
        Each row's share of the people who answered it; the most picked is in bold.
      </p>
    </div>
  );
}

function ValuesBody({ summary }: { summary: ValuesSummary }) {
  if (summary.answered === 0) return <NoAnswers />;
  const values = [...summary.values].sort((a, b) => b.count - a.count);

  return (
    <ul className="flex flex-col gap-4">
      {values.map((entry) => (
        <ShareRow
          key={entry.value}
          label={entry.value}
          count={entry.count}
          share={shareOf(entry.count, summary.answered)}
        />
      ))}
      {summary.other > 0 && (
        <ShareRow
          label="Other values"
          count={summary.other}
          share={shareOf(summary.other, summary.answered)}
          muted
        />
      )}
    </ul>
  );
}

/** A latest answer as people read it: dates in words, phone numbers spaced. */
function textAnswer(type: TextSummary['type'], value: string): string {
  if (type === 'date') return formatCalendarDate(value);
  if (type === 'phone' && value.startsWith('+')) return formatPhone(value);
  if (type === 'date_range') {
    const [start, end] = value.split(' to ');
    if (start && end) return `${formatCalendarDate(start)} – ${formatCalendarDate(end)}`;
  }
  return value;
}

function TextBody({ summary }: { summary: TextSummary }) {
  if (summary.latest.length === 0) return <NoAnswers />;
  const now = new Date();

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y">
        {summary.latest.map((answer) => (
          <li key={answer.submissionId} className="flex flex-col gap-0.5 py-2.5 first:pt-0">
            <p className="line-clamp-3 flex items-center gap-2 text-14 break-words whitespace-pre-line">
              {summary.type === 'color' && (
                <span
                  aria-hidden
                  className="size-4 shrink-0 rounded-sm border"
                  style={{ backgroundColor: answer.value }}
                />
              )}
              {textAnswer(summary.type, answer.value)}
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

/** The question type a summary is of, for its caption. */
function summaryType(summary: QuestionSummary): FieldType {
  switch (summary.kind) {
    case 'choice':
    case 'number':
    case 'text':
      return summary.type;
    case 'rating':
      return 'rating';
    case 'nps':
      return 'nps';
    case 'scale':
      return 'opinion_scale';
    case 'ranking':
      return 'ranking';
    case 'matrix':
      return 'matrix';
    case 'values':
      return 'hidden';
  }
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
  const type = summaryType(summary);

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
      {summary.kind === 'nps' && <NpsBody summary={summary} />}
      {summary.kind === 'scale' && <ScaleBody summary={summary} />}
      {summary.kind === 'ranking' && <RankingBody summary={summary} />}
      {summary.kind === 'matrix' && <MatrixBody summary={summary} />}
      {summary.kind === 'values' && <ValuesBody summary={summary} />}
    </section>
  );
}
