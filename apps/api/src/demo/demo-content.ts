import {
  buildSubmissionValidator,
  sanitizeAnswers,
  type FormSchema,
  type FormTheme,
  type SubmissionMetadata,
  type SubmittedAnswers,
} from '@formyx/shared';
import { demoForms, type DemoForm } from './demo-forms.js';
import { createRandom, type Random } from './random.js';
import { createPeople, respondentMetadata } from './respondents.js';

/** Same seed, same data: every reset looks alike, shifted to end at the time it runs. */
export const DEMO_SEED = 20_261_114;

/** How far back responses go. */
export const DEMO_DAYS = 30;

const SECOND_MS = 1000;
const HOUR_MS = 60 * 60 * SECOND_MS;
const DAY_MS = 24 * HOUR_MS;

/** Responses by hour of the day (UTC): mostly working hours, some evenings, few at night. */
const HOUR_WEIGHTS: readonly (readonly [number, number])[] = Array.from(
  { length: 24 },
  (_, hour) => [
    hour,
    hour < 7 ? 0.15 : hour < 9 ? 0.6 : hour < 13 ? 1 : hour < 18 ? 1.1 : hour < 22 ? 0.8 : 0.35,
  ],
);

/** Fewer responses at weekends. */
function weekdayFactor(day: Date): number {
  const weekday = day.getUTCDay();
  return weekday === 6 ? 0.5 : weekday === 0 ? 0.4 : 1;
}

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** `count` moments in the last DEMO_DAYS days, spread by `dayWeight`, oldest first. */
function momentsBefore(
  random: Random,
  now: Date,
  count: number,
  dayWeight: (daysAgo: number) => number,
): Date[] {
  const today = startOfUtcDay(now);
  const days = Array.from({ length: DEMO_DAYS }, (_, daysAgo) => {
    const weight = dayWeight(daysAgo) * weekdayFactor(new Date(today - daysAgo * DAY_MS));
    return [daysAgo, weight] as const;
  });
  // Nothing may land in the future, nor in the last minute.
  const latest = now.getTime() - 60 * SECOND_MS;

  const moments: Date[] = [];
  while (moments.length < count) {
    const daysAgo = random.weighted(days);
    const time =
      today -
      daysAgo * DAY_MS +
      random.weighted(HOUR_WEIGHTS) * HOUR_MS +
      random.int(0, HOUR_MS / SECOND_MS - 1) * SECOND_MS;
    if (time <= latest) moments.push(new Date(time));
  }
  return moments.sort((a, b) => a.getTime() - b.getTime());
}

/** Around `medianSeconds`, sometimes much longer, never under ten seconds. */
function completionTimeMs(random: Random, medianSeconds: number): number {
  const seconds = Math.max(10, medianSeconds * Math.exp(random.normal() * 0.45));
  return Math.round(seconds * SECOND_MS);
}

export interface DemoSubmission {
  createdAt: Date;
  answers: SubmittedAnswers;
  completionTimeMs: number;
  metadata: SubmissionMetadata;
}

export interface DemoFormContent {
  title: string;
  schema: FormSchema;
  theme: FormTheme;
  createdAt: Date;
  publishedAt: Date;
  submissions: DemoSubmission[];
  /** One per visit, including the visits that led to each response. */
  views: Date[];
}

function formContent(form: DemoForm, random: Random, now: Date): DemoFormContent {
  const nextPerson = createPeople(random);

  const submissions = momentsBefore(random, now, form.responses, form.dayWeight).map(
    (createdAt): DemoSubmission => {
      const raw = sanitizeAnswers(form.schema, form.answer(random, nextPerson(), createdAt));
      // The same check real responses pass, so the demo can never hold an impossible answer.
      const answers = buildSubmissionValidator(form.schema, raw).parse(raw);
      return {
        createdAt,
        answers,
        completionTimeMs: completionTimeMs(random, form.medianSeconds),
        metadata: respondentMetadata(random, form.referrers),
      };
    },
  );

  const visitsWithoutResponse = Math.round(form.responses / form.completionRate) - form.responses;
  const views = [
    ...submissions.map(
      ({ createdAt, completionTimeMs: spent }) =>
        new Date(createdAt.getTime() - spent - random.int(2, 30) * SECOND_MS),
    ),
    ...momentsBefore(random, now, visitsWithoutResponse, form.dayWeight),
  ].sort((a, b) => a.getTime() - b.getTime());

  return {
    title: form.title,
    schema: form.schema,
    theme: form.theme,
    createdAt: new Date(now.getTime() - form.createdDaysAgo * DAY_MS),
    publishedAt: new Date(now.getTime() - form.publishedDaysAgo * DAY_MS),
    submissions,
    views,
  };
}

/** The demo workspace's forms with a month of responses and views, ending at `now`. */
export function buildDemoContent(now: Date, seed = DEMO_SEED): DemoFormContent[] {
  const random = createRandom(seed);
  return demoForms().map((form) => formContent(form, random, now));
}
