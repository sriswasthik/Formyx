import { z } from 'zod';
import { dropOffSchema } from './drop-off.js';
import { answerableFields, formatAddress } from './answer-format.js';
import { isAddressAnswer, isDateRangeAnswer, isMatrixAnswer } from './answer-values.js';
import { CHOICE_FIELD_TYPES } from './field-types.js';
import type { Field } from './fields.js';
import { isFileAnswer } from './files.js';
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
  'address',
  'time',
  'date_range',
  'url',
  'signature',
  'color',
  'voice_note',
] as const;

/** Question types counted per option. */
export const CHOICE_SUMMARY_TYPES = [
  ...CHOICE_FIELD_TYPES,
  'picture_choice',
  'yes_no',
  'consent',
] as const;

/** Question types summarised by average, lowest and highest. */
export const NUMBER_SUMMARY_TYPES = ['number', 'slider', 'currency'] as const;

/** How many different values a hidden field's summary counts; the rest count as "other". */
export const MAX_COUNTED_VALUES = 50;

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
  type: z.enum(CHOICE_SUMMARY_TYPES),
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
  type: z.enum(NUMBER_SUMMARY_TYPES),
  sum: z.number(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  /** After the numbers, for sliders ("kg"). */
  unit: z.string().optional(),
  /** ISO 4217, for amounts. */
  currency: z.string().optional(),
});

/** Net Promoter Score: `counts[i]` responses scored `i`, from 0 to 10. */
export const npsSummarySchema = z.object({
  kind: z.literal('nps'),
  ...questionBase,
  counts: z.array(count).length(11),
});

/** An opinion scale: `counts[i]` responses picked `start + i`. */
export const scaleSummarySchema = z.object({
  kind: z.literal('scale'),
  ...questionBase,
  start: z.number().int(),
  end: z.number().int(),
  lowLabel: z.string(),
  highLabel: z.string(),
  counts: z.array(count),
  sum: z.number(),
});

/** A ranking: for each option, the sum of the places it was given and how often. */
export const rankingSummarySchema = z.object({
  kind: z.literal('ranking'),
  ...questionBase,
  options: z.array(
    z.object({ id: z.string(), label: z.string(), rankSum: z.number(), ranked: count }),
  ),
});

/** A matrix: per row, how often each column was picked. */
export const matrixSummarySchema = z.object({
  kind: z.literal('matrix'),
  ...questionBase,
  columns: z.array(z.object({ id: z.string(), label: z.string() })),
  /** `counts[j]` picks of `columns[j]`; `answered` responses answered the row. */
  rows: z.array(
    z.object({ id: z.string(), label: z.string(), answered: count, counts: z.array(count) }),
  ),
});

/** A hidden field: how often each value came in the link, most common first when shown. */
export const valuesSummarySchema = z.object({
  kind: z.literal('values'),
  ...questionBase,
  values: z.array(z.object({ value: z.string(), count })),
  /** Responses with a value beyond the first `MAX_COUNTED_VALUES` different ones. */
  other: count,
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
  npsSummarySchema,
  scaleSummarySchema,
  rankingSummarySchema,
  matrixSummarySchema,
  valuesSummarySchema,
]);
export type QuestionSummary = z.infer<typeof questionSummarySchema>;
export type ChoiceSummary = z.infer<typeof choiceSummarySchema>;
export type RatingSummary = z.infer<typeof ratingSummarySchema>;
export type NumberSummary = z.infer<typeof numberSummarySchema>;
export type TextSummary = z.infer<typeof textSummarySchema>;
export type NpsSummary = z.infer<typeof npsSummarySchema>;
export type ScaleSummary = z.infer<typeof scaleSummarySchema>;
export type RankingSummary = z.infer<typeof rankingSummarySchema>;
export type MatrixSummary = z.infer<typeof matrixSummarySchema>;
export type ValuesSummary = z.infer<typeof valuesSummarySchema>;

/** What `GET /api/forms/:formId/analytics` returns. */
export const formAnalyticsSchema = z.object({
  totals: analyticsTotalsSchema,
  responsesPerDay: responsesPerDaySchema,
  /** One per question of the published form, in form order. */
  questions: z.array(questionSummarySchema),
  dropOff: dropOffSchema,
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
    case 'picture_choice':
      return {
        kind: 'choice',
        ...base,
        type: field.type,
        options: field.options.map(({ id, label }) => ({ id, label, count: 0 })),
        removed: 0,
      };
    case 'yes_no':
      return {
        kind: 'choice',
        ...base,
        type: field.type,
        options: [
          { id: 'yes', label: 'Yes', count: 0 },
          { id: 'no', label: 'No', count: 0 },
        ],
        removed: 0,
      };
    case 'consent':
      return {
        kind: 'choice',
        ...base,
        type: field.type,
        options: [{ id: 'agreed', label: 'Agreed', count: 0 }],
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
    case 'nps':
      return { kind: 'nps', ...base, counts: Array.from({ length: 11 }, () => 0) };
    case 'opinion_scale':
      return {
        kind: 'scale',
        ...base,
        start: field.start,
        end: field.end,
        lowLabel: field.lowLabel,
        highLabel: field.highLabel,
        counts: Array.from({ length: field.end - field.start + 1 }, () => 0),
        sum: 0,
      };
    case 'number':
      return { kind: 'number', ...base, type: field.type, sum: 0, min: null, max: null };
    case 'slider':
      return {
        kind: 'number',
        ...base,
        type: field.type,
        sum: 0,
        min: null,
        max: null,
        ...(field.unit.trim() !== '' && { unit: field.unit.trim() }),
      };
    case 'currency':
      return {
        kind: 'number',
        ...base,
        type: field.type,
        sum: 0,
        min: null,
        max: null,
        currency: field.currency,
      };
    case 'ranking':
      return {
        kind: 'ranking',
        ...base,
        options: field.options.map(({ id, label }) => ({ id, label, rankSum: 0, ranked: 0 })),
      };
    case 'matrix':
      return {
        kind: 'matrix',
        ...base,
        columns: field.columns.map(({ id, label }) => ({ id, label })),
        rows: field.rows.map(({ id, label }) => ({
          id,
          label,
          answered: 0,
          counts: field.columns.map(() => 0),
        })),
      };
    case 'hidden':
      return { kind: 'values', ...base, values: [], other: 0 };
    case 'statement':
    case 'image':
    case 'video':
    case 'divider':
    case 'page_break':
      throw new Error('Content blocks take no answer to summarise');
    default:
      return { kind: 'text', ...base, type: field.type, latest: [] };
  }
}

/** A summary with nothing counted yet for each question of `schema` that takes an answer. */
export function createQuestionSummaries(schema: FormSchema): QuestionSummary[] {
  return answerableFields(schema).map(emptySummary);
}

function addChoice(summary: ChoiceSummary, value: unknown): void {
  const picked =
    value === true
      ? ['agreed']
      : typeof value === 'string'
        ? [value]
        : Array.isArray(value)
          ? value
          : [];
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

function addNps(summary: NpsSummary, value: unknown): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10) return;
  summary.answered += 1;
  summary.counts[value] = (summary.counts[value] ?? 0) + 1;
}

function addScale(summary: ScaleSummary, value: unknown): void {
  // A value outside the scale was given before the scale changed; it no longer fits.
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < summary.start ||
    value > summary.end
  ) {
    return;
  }
  summary.answered += 1;
  summary.sum += value;
  const index = value - summary.start;
  summary.counts[index] = (summary.counts[index] ?? 0) + 1;
}

function addRanking(summary: RankingSummary, value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) return;
  summary.answered += 1;
  value.forEach((id, index) => {
    const option = summary.options.find((candidate) => candidate.id === id);
    if (!option) return;
    option.rankSum += index + 1;
    option.ranked += 1;
  });
}

function addMatrix(summary: MatrixSummary, value: unknown): void {
  if (!isMatrixAnswer(value)) return;
  let any = false;
  for (const row of summary.rows) {
    const picked = value[row.id];
    const ids = picked === undefined ? [] : Array.isArray(picked) ? picked : [picked];
    if (ids.length === 0) continue;
    any = true;
    row.answered += 1;
    for (const id of new Set(ids)) {
      const column = summary.columns.findIndex((candidate) => candidate.id === id);
      if (column !== -1) row.counts[column] = (row.counts[column] ?? 0) + 1;
    }
  }
  if (any) summary.answered += 1;
}

function addValue(summary: ValuesSummary, value: unknown): void {
  if (typeof value !== 'string' || value.trim() === '') return;
  const text = value.trim();
  summary.answered += 1;
  const existing = summary.values.find((entry) => entry.value === text);
  if (existing) existing.count += 1;
  else if (summary.values.length < MAX_COUNTED_VALUES)
    summary.values.push({ value: text, count: 1 });
  else summary.other += 1;
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
        : isFileAnswer(value)
          ? value.name
          : isAddressAnswer(value)
            ? formatAddress(value)
            : isDateRangeAnswer(value)
              ? `${value.start} to ${value.end}`
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
      case 'nps':
        addNps(summary, value);
        break;
      case 'scale':
        addScale(summary, value);
        break;
      case 'ranking':
        addRanking(summary, value);
        break;
      case 'matrix':
        addMatrix(summary, value);
        break;
      case 'values':
        addValue(summary, value);
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

/** The average answer to a rating, scale or number question, or `null` before the first. */
export function averageAnswer(
  summary: RatingSummary | NumberSummary | ScaleSummary,
): number | null {
  return summary.answered === 0 ? null : summary.sum / summary.answered;
}

export interface NpsBreakdown {
  /** Scores of 9 and 10. */
  promoters: number;
  /** Scores of 7 and 8. */
  passives: number;
  /** Scores of 0 to 6. */
  detractors: number;
  /** % promoters minus % detractors, from -100 to 100; `null` before the first answer. */
  score: number | null;
}

/** The Net Promoter Score and its parts. */
export function npsBreakdown(summary: Pick<NpsSummary, 'counts'>): NpsBreakdown {
  const sum = (from: number, to: number) =>
    summary.counts.slice(from, to + 1).reduce((total, value) => total + value, 0);
  const promoters = sum(9, 10);
  const passives = sum(7, 8);
  const detractors = sum(0, 6);
  const total = promoters + passives + detractors;
  return {
    promoters,
    passives,
    detractors,
    score: total === 0 ? null : Math.round(((promoters - detractors) / total) * 100),
  };
}

/** Options by their average place (1 is first), best first; unranked options last. */
export function averageRanks(
  summary: RankingSummary,
): { id: string; label: string; average: number | null }[] {
  return summary.options
    .map(({ id, label, rankSum, ranked }) => ({
      id,
      label,
      average: ranked === 0 ? null : rankSum / ranked,
    }))
    .sort((a, b) => (a.average ?? Infinity) - (b.average ?? Infinity));
}

/** `part` as a share of `whole` (0–1), or 0 when there is no whole. */
export function shareOf(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}
