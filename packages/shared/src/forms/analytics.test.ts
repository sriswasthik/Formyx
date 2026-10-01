import { describe, expect, it } from 'vitest';
import {
  addSubmissionToAnalytics,
  addSubmissionToSummaries,
  analyticsQuerySchema,
  ANSWER_PREVIEW_LENGTH,
  averageAnswer,
  averageCompletionTimeMs,
  completionRate,
  createQuestionSummaries,
  dateKey,
  shareOf,
  type AnalyzableSubmission,
  type ChoiceSummary,
  type FormAnalytics,
  type NumberSummary,
  type QuestionSummary,
  type RatingSummary,
  type TextSummary,
} from './analytics.js';
import { createEmptyForm, createField } from './factories.js';
import type { Field } from './fields.js';
import type { FormSchema } from './form-schema.js';

const color: Field = {
  ...createField('single_choice'),
  id: 'color',
  label: 'Favourite colour',
  options: [
    { id: 'red', label: 'Red' },
    { id: 'blue', label: 'Blue' },
  ],
};
const toppings: Field = {
  ...createField('multi_choice'),
  id: 'toppings',
  label: 'Toppings',
  options: [
    { id: 'cheese', label: 'Cheese' },
    { id: 'olives', label: 'Olives' },
    { id: 'basil', label: 'Basil' },
  ],
};
const stars: Field = { ...createField('rating'), id: 'stars', label: 'Rating', ratingScale: 5 };
const age: Field = { ...createField('number'), id: 'age', label: 'Age' };
const comment: Field = { ...createField('long_text'), id: 'comment', label: 'Comments' };
const intro: Field = { ...createField('statement'), id: 'intro', label: 'Welcome' };

const schema: FormSchema = {
  ...createEmptyForm(),
  fields: [intro, color, toppings, stars, age, comment],
};

let sequence = 0;

/** A response at `createdAt` (default: one second after the previous). */
function response(
  answers: Record<string, unknown>,
  overrides: Partial<AnalyzableSubmission> = {},
): AnalyzableSubmission {
  sequence += 1;
  return {
    id: `sub_${String(sequence).padStart(3, '0')}`,
    createdAt: new Date(Date.UTC(2026, 8, 30, 12, 0, sequence)).toISOString(),
    completionTimeMs: null,
    answers,
    ...overrides,
  };
}

function summarize(...responses: AnalyzableSubmission[]): QuestionSummary[] {
  const summaries = createQuestionSummaries(schema);
  for (const submission of responses) addSubmissionToSummaries(summaries, submission);
  return summaries;
}

function find<K extends QuestionSummary['kind']>(
  summaries: QuestionSummary[],
  fieldId: string,
  kind: K,
): Extract<QuestionSummary, { kind: K }> {
  const summary = summaries.find((candidate) => candidate.fieldId === fieldId);
  if (summary?.kind !== kind) throw new Error(`No ${kind} summary for ${fieldId}`);
  return summary as Extract<QuestionSummary, { kind: K }>;
}

const counts = (summary: ChoiceSummary) =>
  Object.fromEntries(summary.options.map((option) => [option.id, option.count]));

describe('createQuestionSummaries', () => {
  it('has one empty summary per answerable question, in form order', () => {
    const summaries = createQuestionSummaries(schema);

    expect(summaries.map((summary) => [summary.fieldId, summary.kind])).toEqual([
      ['color', 'choice'],
      ['toppings', 'choice'],
      ['stars', 'rating'],
      ['age', 'number'],
      ['comment', 'text'],
    ]);
    expect(find(summaries, 'stars', 'rating')).toMatchObject({
      label: 'Rating',
      scale: 5,
      counts: [0, 0, 0, 0, 0],
      answered: 0,
    });
    expect(find(summaries, 'color', 'choice').options).toEqual([
      { id: 'red', label: 'Red', count: 0 },
      { id: 'blue', label: 'Blue', count: 0 },
    ]);
  });
});

describe('addSubmissionToSummaries: choices', () => {
  it('counts single choices per option', () => {
    const summary = find(
      summarize(
        response({ color: 'red' }),
        response({ color: 'red' }),
        response({ color: 'blue' }),
      ),
      'color',
      'choice',
    );

    expect(counts(summary)).toEqual({ red: 2, blue: 1 });
    expect(summary.answered).toBe(3);
    expect(shareOf(summary.options[0]?.count ?? 0, summary.answered)).toBeCloseTo(2 / 3);
  });

  it('counts each pick of a multiple choice, and the response once', () => {
    const summary = find(
      summarize(
        response({ toppings: ['cheese', 'olives'] }),
        response({ toppings: ['cheese'] }),
        // A repeated pick counts once.
        response({ toppings: ['basil', 'basil'] }),
      ),
      'toppings',
      'choice',
    );

    expect(counts(summary)).toEqual({ cheese: 2, olives: 1, basil: 1 });
    expect(summary.answered).toBe(3);
  });

  it('counts picks of options removed since as removed', () => {
    const summaries = summarize(
      response({ color: 'green' }),
      response({ toppings: ['cheese', 'ham'] }),
    );
    const single = find(summaries, 'color', 'choice');
    const multi = find(summaries, 'toppings', 'choice');

    expect(single).toMatchObject({ answered: 1, removed: 1 });
    expect(counts(single)).toEqual({ red: 0, blue: 0 });
    expect(multi).toMatchObject({ answered: 1, removed: 1 });
    expect(counts(multi)).toEqual({ cheese: 1, olives: 0, basil: 0 });
  });

  it('skips empty and malformed choices', () => {
    const summary = find(
      summarize(response({ color: 42 }), response({ toppings: [] }), response({ color: '' })),
      'color',
      'choice',
    );
    expect(summary.answered).toBe(0);
    expect(find(summarize(response({ toppings: [] })), 'toppings', 'choice').answered).toBe(0);
  });
});

describe('addSubmissionToSummaries: ratings and numbers', () => {
  it('builds the rating distribution and its average', () => {
    const summary = find(
      summarize(response({ stars: 5 }), response({ stars: 4 }), response({ stars: 5 })),
      'stars',
      'rating',
    );

    expect(summary.counts).toEqual([0, 0, 0, 1, 2]);
    expect(averageAnswer(summary)).toBeCloseTo(14 / 3);
  });

  it('skips ratings that are off the scale or not whole numbers', () => {
    const summary = find(
      summarize(response({ stars: 7 }), response({ stars: 0 }), response({ stars: 2.5 })),
      'stars',
      'rating',
    );

    expect(summary.answered).toBe(0);
    expect(averageAnswer(summary)).toBeNull();
  });

  it('tracks the minimum, average and maximum of numbers', () => {
    const summary = find(
      summarize(response({ age: 30 }), response({ age: -2 }), response({ age: 41.5 })),
      'age',
      'number',
    );

    expect(summary).toMatchObject<Partial<NumberSummary>>({ min: -2, max: 41.5, answered: 3 });
    expect(averageAnswer(summary)).toBeCloseTo(69.5 / 3);
  });

  it('skips numbers that are not numbers', () => {
    const summary = find(summarize(response({ age: 'thirty' })), 'age', 'number');
    expect(summary).toMatchObject({ answered: 0, min: null, max: null });
  });
});

describe('addSubmissionToSummaries: text', () => {
  it('keeps the five most recent answers, newest first, in any order of arrival', () => {
    const responses = Array.from({ length: 7 }, (_, index) =>
      response({ comment: `Answer ${index + 1}` }),
    );
    const shuffled = [3, 6, 0, 5, 1, 2, 4].flatMap((index) => responses[index] ?? []);

    const summary = find(summarize(...shuffled), 'comment', 'text');

    expect(summary.answered).toBe(7);
    expect(summary.latest.map((answer) => answer.value)).toEqual([
      'Answer 7',
      'Answer 6',
      'Answer 5',
      'Answer 4',
      'Answer 3',
    ]);
    expect(summary.latest[0]).toMatchObject({
      submissionId: responses[6]?.id,
      createdAt: responses[6]?.createdAt,
    });
  });

  it('orders answers from the same millisecond by id', () => {
    const createdAt = '2026-09-30T12:00:00.000Z';
    const summary = find(
      summarize(
        response({ comment: 'first' }, { id: 'sub_a', createdAt }),
        response({ comment: 'second' }, { id: 'sub_b', createdAt }),
      ),
      'comment',
      'text',
    );
    expect(summary.latest.map((answer) => answer.submissionId)).toEqual(['sub_b', 'sub_a']);
  });

  it('trims answers, skips blank ones and shortens long ones', () => {
    const long = 'x'.repeat(ANSWER_PREVIEW_LENGTH + 50);
    const summary = find(
      summarize(
        response({ comment: '  Hello  ' }),
        response({ comment: '   ' }),
        response({ comment: long }),
      ),
      'comment',
      'text',
    );

    expect(summary.answered).toBe(2);
    expect(summary.latest[1]?.value).toBe('Hello');
    expect(summary.latest[0]?.value).toHaveLength(ANSWER_PREVIEW_LENGTH);
    expect(summary.latest[0]?.value.endsWith('…')).toBe(true);
  });

  it('lists each response once', () => {
    const submission = response({ comment: 'Hi' });
    const summary = find(summarize(submission, submission), 'comment', 'text');
    expect(summary.latest).toHaveLength(1);
  });
});

describe('addSubmissionToAnalytics', () => {
  function analytics(timeZone = 'UTC'): FormAnalytics {
    return {
      totals: { views: 10, responses: 2, timedResponses: 1, totalCompletionTimeMs: 60_000 },
      responsesPerDay: {
        range: '7d',
        timeZone,
        days: [
          { date: '2026-09-30', responses: 2 },
          { date: '2026-10-01', responses: 0 },
        ],
      },
      questions: createQuestionSummaries(schema),
    };
  }

  it('counts the response, its time, its day and its answers', () => {
    const current = analytics();
    addSubmissionToAnalytics(
      current,
      response(
        { color: 'blue', stars: 3 },
        { createdAt: '2026-10-01T09:00:00.000Z', completionTimeMs: 30_000 },
      ),
    );

    expect(current.totals).toEqual({
      views: 10,
      responses: 3,
      timedResponses: 2,
      totalCompletionTimeMs: 90_000,
    });
    expect(current.responsesPerDay.days).toEqual([
      { date: '2026-09-30', responses: 2 },
      { date: '2026-10-01', responses: 1 },
    ]);
    expect(counts(find(current.questions, 'color', 'choice'))).toEqual({ red: 0, blue: 1 });
    expect((find(current.questions, 'stars', 'rating') satisfies RatingSummary).sum).toBe(3);
  });

  it("places the response on the viewer's calendar day", () => {
    // 20:00 in New York on 30 September is already 1 October in UTC.
    const current = analytics('America/New_York');
    addSubmissionToAnalytics(current, response({}, { createdAt: '2026-10-01T00:00:00.000Z' }));
    expect(current.responsesPerDay.days[0]).toEqual({ date: '2026-09-30', responses: 3 });
  });

  it('leaves untimed responses out of the average time, and later days for the next refresh', () => {
    const current = analytics();
    addSubmissionToAnalytics(current, response({}, { createdAt: '2026-10-02T09:00:00.000Z' }));

    expect(current.totals).toMatchObject({ responses: 3, timedResponses: 1 });
    expect(current.responsesPerDay.days.map((day) => day.responses)).toEqual([2, 0]);
  });
});

describe('derived numbers', () => {
  const totals = { views: 0, responses: 0, timedResponses: 0, totalCompletionTimeMs: 0 };

  it('has no completion rate or average time without data', () => {
    expect(completionRate(totals)).toBeNull();
    expect(averageCompletionTimeMs(totals)).toBeNull();
  });

  it('divides responses by views, never above 100%', () => {
    expect(completionRate({ ...totals, views: 8, responses: 2 })).toBe(0.25);
    expect(completionRate({ ...totals, views: 3, responses: 5 })).toBe(1);
  });

  it('averages the completion time of timed responses', () => {
    expect(
      averageCompletionTimeMs({ ...totals, timedResponses: 4, totalCompletionTimeMs: 100_000 }),
    ).toBe(25_000);
  });

  it('gives a zero share of nothing', () => {
    expect(shareOf(0, 0)).toBe(0);
    expect(shareOf(1, 4)).toBe(0.25);
  });
});

describe('dateKey', () => {
  it('names the calendar day in the time zone', () => {
    const instant = '2026-09-30T20:30:00.000Z';
    expect(dateKey(instant, 'UTC')).toBe('2026-09-30');
    expect(dateKey(instant, 'Asia/Kolkata')).toBe('2026-10-01');
    expect(dateKey(instant, 'Pacific/Honolulu')).toBe('2026-09-30');
  });
});

describe('analyticsQuerySchema', () => {
  it('defaults to 30 days in UTC', () => {
    expect(analyticsQuerySchema.parse({})).toEqual({ range: '30d', tz: 'UTC' });
  });

  it('accepts IANA time zones and refuses anything else', () => {
    expect(analyticsQuerySchema.safeParse({ tz: 'Europe/London' }).success).toBe(true);
    expect(analyticsQuerySchema.safeParse({ tz: 'Mars/Olympus_Mons' }).success).toBe(false);
    expect(analyticsQuerySchema.safeParse({ range: '1y' }).success).toBe(false);
  });
});

describe('summary types', () => {
  it('summarise text-like questions by their answers', () => {
    const email: Field = { ...createField('email'), id: 'email', label: 'Email' };
    const [summary] = createQuestionSummaries({ ...createEmptyForm(), fields: [email] });
    expect(summary).toEqual<TextSummary>({
      kind: 'text',
      fieldId: 'email',
      label: 'Email',
      type: 'email',
      answered: 0,
      latest: [],
    });
  });
});
