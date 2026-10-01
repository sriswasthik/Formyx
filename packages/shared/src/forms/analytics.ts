import { z } from 'zod';
import { answerableFields } from './answer-format.js';
import { CHOICE_FIELD_TYPES } from './field-types.js';
import type { Field } from './fields.js';
import type { FormSchema } from './form-schema.js';

/*
 * A form's analytics: totals, responses per day and a summary of each question. Summaries
 * hold raw tallies (counts, sums, extremes) rather than averages or percentages, so one
 * function can fold a response into them: the server folds every response to build them,
 * and the dashboard folds in responses that arrive live. Derived numbers come from the
 * helpers at the end of this file.
 */

export const ANALYTICS_RANGES = ['7d', '30d', '90d'] as const;
export const analyticsRangeSchema = z.enum(ANALYTICS_RANGES);
export type AnalyticsRange = z.infer<typeof analyticsRangeSchema>;

export const ANALYTICS_RANGE_DAYS: Record<AnalyticsRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export const ANALYTICS_RANGE_LABELS: Record<AnalyticsRange, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
};

/** Whether `value` is an IANA time zone this runtime knows, such as "Europe/London". */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Query string of `GET /api/forms/:formId/analytics`. */
export const analyticsQuerySchema = z.object({
  /** How far back responses per day go. Totals and question summaries cover all time. */
  range: analyticsRangeSchema.default('30d'),
  /** Days start at midnight in this time zone: the viewer's, so the chart matches their calendar. */
  tz: z
    .string()
    .max(100)
    .refine(isTimeZone, 'Use an IANA time zone, such as Europe/London')
    .default('UTC'),
});
export type AnalyticsQuery = z.input<typeof analyticsQuerySchema>;

/** How many recent answers a text question's summary keeps. */
export const LATEST_ANSWERS_COUNT = 5;
/** Recent answers are previews: longer ones are cut, and the full text is in the response. */
export const ANSWER_PREVIEW_LENGTH = 300;

/** Question types summarised by their latest answers. */
export const TEXT_SUMMARY_TYPES = [
  'short_text',
  'long_text',
  'email',
  'phone',
  'date',
  'file',
] as const;

const count = z.number().int().min(0);
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export const analyticsTotalsSchema = z.object({
  /** Visits to the public form, counted once per browser session. */
  views: count,
  responses: count,
  /** Responses whose browser reported how long they took, and the sum of those times. */
  timedResponses: count,
  totalCompletionTimeMs: z.number().min(0),
});
export type AnalyticsTotals = z.infer<typeof analyticsTotalsSchema>;

export const responsesPerDaySchema = z.object({
  range: analyticsRangeSchema,
  timeZone: z.string(),
  /** Every day of the range, oldest first, including days without responses. */
  days: z.array(z.object({ date: z.string().regex(DATE_KEY), responses: count })),
});
export type ResponsesPerDay = z.infer<typeof responsesPerDaySchema>;

const questionBase = {
  fieldId: z.string(),
  label: z.string(),
  /** Responses with a usable answer to this question. */
  answered: count,
};

export const choiceSummarySchema = z.object({
  kind: z.literal('choice'),
  ...questionBase,
  type: z.enum(CHOICE_FIELD_TYPES),
  options: z.array(z.object({ id: z.string(), label: z.string(), count })),
  /** Picks of options that have since been removed from the form. */
  removed: count,
});

export const ratingSummarySchema = z.object({
  kind: z.literal('rating'),
  ...questionBase,
  scale: z.number().int().min(1),
  /** `counts[i]` responses rated `i + 1`. */
  counts: z.array(count),
  sum: z.number(),
});

export const numberSummarySchema = z.object({
  kind: z.literal('number'),
  ...questionBase,
  sum: z.number(),
  min: z.number().nullable(),
  max: z.number().nullable(),
});

export const latestAnswerSchema = z.object({
  submissionId: z.string(),
  createdAt: z.iso.datetime(),
  value: z.string(),
});
export type LatestAnswer = z.infer<typeof latestAnswerSchema>;

export const textSummarySchema = z.object({
  kind: z.literal('text'),
  ...questionBase,
  type: z.enum(TEXT_SUMMARY_TYPES),
  /** The most recent answers, newest first. */
  latest: z.array(latestAnswerSchema),
});

export const questionSummarySchema = z.discriminatedUnion('kind', [
  choiceSummarySchema,
  ratingSummarySchema,
  numberSummarySchema,
  textSummarySchema,
]);
export type QuestionSummary = z.infer<typeof questionSummarySchema>;
export type ChoiceSummary = z.infer<typeof choiceSummarySchema>;
export type RatingSummary = z.infer<typeof ratingSummarySchema>;
export type NumberSummary = z.infer<typeof numberSummarySchema>;
export type TextSummary = z.infer<typeof textSummarySchema>;

/** What `GET /api/forms/:formId/analytics` returns. */
export const formAnalyticsSchema = z.object({
  totals: analyticsTotalsSchema,
  responsesPerDay: responsesPerDaySchema,
  /** One per question of the published form, in form order. */
  questions: z.array(questionSummarySchema),
});
export type FormAnalytics = z.infer<typeof formAnalyticsSchema>;

/** The parts of a response that analytics read. */
export interface AnalyzableSubmission {
  id: string;
  /** ISO 8601, as `Date#toISOString` writes it. */
  createdAt: string;
  completionTimeMs: number | null;
  answers: Readonly<Record<string, unknown>>;
}

function emptySummary(field: Field): QuestionSummary {
  const base = { fieldId: field.id, label: field.label, answered: 0 };
  switch (field.type) {
    case 'single_choice':
    case 'multi_choice':
    case 'dropdown':
      return {
        kind: 'choice',
        ...base,
        type: field.type,
        options: field.options.map(({ id, label }) => ({ id, label, count: 0 })),
        removed: 0,
      };
    case 'rating':
      return {
        kind: 'rating',
        ...base,
        scale: field.ratingScale,
        counts: Array.from({ length: field.ratingScale }, () => 0),
        sum: 0,
      };
    case 'number':
      return { kind: 'number', ...base, sum: 0, min: null, max: null };
    case 'statement':
      throw new Error('Statements take no answer to summarise');
    default:
      return { kind: 'text', ...base, type: field.type, latest: [] };
  }
}

/** A summary with nothing counted yet for each question of `schema` that takes an answer. */
export function createQuestionSummaries(schema: FormSchema): QuestionSummary[] {
  return answerableFields(schema).map(emptySummary);
}

function addChoice(summary: ChoiceSummary, value: unknown): void {
  const picked = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
  const ids = new Set(picked.filter((id): id is string => typeof id === 'string' && id !== ''));
  if (ids.size === 0) return;

  summary.answered += 1;
  for (const id of ids) {
    const option = summary.options.find((candidate) => candidate.id === id);
    if (option) option.count += 1;
    else summary.removed += 1;
  }
}

function addRating(summary: RatingSummary, value: unknown): void {
  // A rating outside the scale was given before the scale shrank; it no longer fits.
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > summary.scale) {
    return;
  }
  summary.answered += 1;
  summary.sum += value;
  summary.counts[value - 1] = (summary.counts[value - 1] ?? 0) + 1;
}

function addNumber(summary: NumberSummary, value: unknown): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) return;
  summary.answered += 1;
  summary.sum += value;
  summary.min = summary.min === null ? value : Math.min(summary.min, value);
  summary.max = summary.max === null ? value : Math.max(summary.max, value);
}

/** Newest first; ties (same millisecond) by id, so the order never depends on arrival. */
function isNewer(a: LatestAnswer, b: LatestAnswer): boolean {
  return a.createdAt === b.createdAt ? a.submissionId > b.submissionId : a.createdAt > b.createdAt;
}

function preview(text: string): string {
  return text.length > ANSWER_PREVIEW_LENGTH
    ? `${text.slice(0, ANSWER_PREVIEW_LENGTH - 1).trimEnd()}…`
    : text;
}

function addText(summary: TextSummary, value: unknown, submission: AnalyzableSubmission): void {
  const text =
    typeof value === 'string'
      ? value.trim()
      : typeof value === 'number' && Number.isFinite(value)
        ? String(value)
        : '';
  if (text === '') return;

  summary.answered += 1;
  if (summary.latest.some((answer) => answer.submissionId === submission.id)) return;
  const answer = {
    submissionId: submission.id,
    createdAt: submission.createdAt,
    value: preview(text),
  };
  const index = summary.latest.findIndex((existing) => isNewer(answer, existing));
  summary.latest.splice(index === -1 ? summary.latest.length : index, 0, answer);
  summary.latest.length = Math.min(summary.latest.length, LATEST_ANSWERS_COUNT);
}

/**
 * Counts one response into `summaries`, **in place**. Answers that no longer fit their
 * question (the form changed since) are skipped; picks of removed options are counted as
 * `removed`. Responses can be added in any order.
 */
export function addSubmissionToSummaries(
  summaries: QuestionSummary[],
  submission: AnalyzableSubmission,
): void {
  for (const summary of summaries) {
    const value = submission.answers[summary.fieldId];
    if (value === undefined || value === null) continue;
    switch (summary.kind) {
      case 'choice':
        addChoice(summary, value);
        break;
      case 'rating':
        addRating(summary, value);
        break;
      case 'number':
        addNumber(summary, value);
        break;
      case 'text':
        addText(summary, value, submission);
        break;
    }
  }
}

/** The calendar day (YYYY-MM-DD) that `iso` falls on in `timeZone`. */
export function dateKey(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * Counts one new response into all of `analytics`, **in place**. Views are not touched: a
 * response does not say when its view was recorded. A response on a day past the end of the
 * chart (the page stayed open over midnight) is left for the next refresh to place.
 */
export function addSubmissionToAnalytics(
  analytics: FormAnalytics,
  submission: AnalyzableSubmission,
): void {
  const { totals, responsesPerDay } = analytics;
  totals.responses += 1;
  if (submission.completionTimeMs !== null) {
    totals.timedResponses += 1;
    totals.totalCompletionTimeMs += submission.completionTimeMs;
  }

  const day = dateKey(submission.createdAt, responsesPerDay.timeZone);
  const bucket = responsesPerDay.days.find((candidate) => candidate.date === day);
  if (bucket) bucket.responses += 1;

  addSubmissionToSummaries(analytics.questions, submission);
}

/** Responses per view, at most 1 (views are counted per session, so a few go uncounted). */
export function completionRate(totals: AnalyticsTotals): number | null {
  return totals.views === 0 ? null : Math.min(1, totals.responses / totals.views);
}

export function averageCompletionTimeMs(totals: AnalyticsTotals): number | null {
  return totals.timedResponses === 0 ? null : totals.totalCompletionTimeMs / totals.timedResponses;
}

/** The average answer to a rating or number question, or `null` before the first answer. */
export function averageAnswer(summary: RatingSummary | NumberSummary): number | null {
  return summary.answered === 0 ? null : summary.sum / summary.answered;
}

/** `part` as a share of `whole` (0–1), or 0 when there is no whole. */
export function shareOf(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}
