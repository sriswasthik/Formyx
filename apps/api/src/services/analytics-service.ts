import {
  addSubmissionToSummaries,
  ANALYTICS_RANGE_DAYS,
  createQuestionSummaries,
  type AnalyticsRange,
  type AnalyticsTotals,
  type FormAnalytics,
  type ResponsesPerDay,
} from '@formyx/shared';
import { AppError } from '../lib/app-error.js';
import type { Database } from '../lib/prisma.js';
import { submissionBatches, type SubmissionService } from './submission-service.js';

/** Responses are summarised this many at a time, so memory stays flat however many there are. */
const SUMMARY_BATCH_SIZE = 1000;

export interface AnalyticsService {
  /**
   * Totals and question summaries over all responses, and responses per day for `range`,
   * with days starting at midnight in `timeZone`.
   */
  get(formId: string, options: { range: AnalyticsRange; timeZone: string }): Promise<FormAnalytics>;
}

export function createAnalyticsService(
  prisma: Database,
  submissions: Pick<SubmissionService, 'published'>,
): AnalyticsService {
  async function totals(formId: string): Promise<AnalyticsTotals> {
    const [row] = await prisma.$queryRaw<
      { views: number; responses: number; timed: number; total_ms: number }[]
    >`
      SELECT
        (SELECT count(*)::int FROM form_views WHERE form_id = ${formId}) AS views,
        count(*)::int AS responses,
        count(completion_time_ms)::int AS timed,
        coalesce(sum(completion_time_ms), 0)::float8 AS total_ms
      FROM submissions
      WHERE form_id = ${formId}
    `;
    return {
      views: row?.views ?? 0,
      responses: row?.responses ?? 0,
      timedResponses: row?.timed ?? 0,
      totalCompletionTimeMs: row?.total_ms ?? 0,
    };
  }

  /**
   * Every day of the range, oldest first, counted on the viewer's calendar. `created_at`
   * holds UTC, so it is read as UTC and then moved into the viewer's zone. The range's start
   * goes the other way (local midnight to UTC), so the index on (form_id, created_at) applies.
   */
  async function responsesPerDay(
    formId: string,
    range: AnalyticsRange,
    timeZone: string,
  ): Promise<ResponsesPerDay> {
    const days = ANALYTICS_RANGE_DAYS[range];
    const rows = await prisma.$queryRaw<{ date: string; responses: number }[]>`
      WITH bounds AS (
        SELECT
          (now() AT TIME ZONE ${timeZone})::date - ${days - 1}::int AS first_day,
          (now() AT TIME ZONE ${timeZone})::date AS last_day
      ),
      days AS (
        SELECT generate_series(first_day, last_day, interval '1 day')::date AS day FROM bounds
      ),
      counts AS (
        SELECT ((s.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date AS day,
               count(*)::int AS responses
        FROM submissions s, bounds
        WHERE s.form_id = ${formId}
          AND s.created_at >= (bounds.first_day::timestamp AT TIME ZONE ${timeZone}) AT TIME ZONE 'UTC'
        GROUP BY 1
      )
      SELECT to_char(days.day, 'YYYY-MM-DD') AS date, coalesce(counts.responses, 0)::int AS responses
      FROM days LEFT JOIN counts USING (day)
      ORDER BY days.day
    `;
    return { range, timeZone, days: rows };
  }

  /**
   * The query schema accepts zones the JavaScript runtime knows; Postgres has its own list.
   * Answers are cached: only valid IANA names get this far, so the cache stays small.
   */
  const knownTimeZones = new Map<string, boolean>();
  async function assertKnownTimeZone(timeZone: string): Promise<void> {
    let known = knownTimeZones.get(timeZone);
    if (known === undefined) {
      const [row] = await prisma.$queryRaw<{ known: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = ${timeZone}) AS known
      `;
      known = row?.known ?? false;
      knownTimeZones.set(timeZone, known);
    }
    if (!known) {
      const message = 'This time zone is not supported';
      throw new AppError(400, 'VALIDATION_ERROR', message, { details: [{ path: 'tz', message }] });
    }
  }

  return {
    async get(formId, { range, timeZone }) {
      await assertKnownTimeZone(timeZone);
      const { schema } = await submissions.published(formId);
      const [formTotals, perDay] = await Promise.all([
        totals(formId),
        responsesPerDay(formId, range, timeZone),
      ]);

      // A form that was never published has no questions anyone answered.
      const questions = schema ? createQuestionSummaries(schema) : [];
      if (questions.length > 0 && formTotals.responses > 0) {
        for await (const batch of submissionBatches(prisma, formId, {
          order: 'oldest',
          size: SUMMARY_BATCH_SIZE,
        })) {
          for (const submission of batch) addSubmissionToSummaries(questions, submission);
        }
      }

      return { totals: formTotals, responsesPerDay: perDay, questions };
    },
  };
}
