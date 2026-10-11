import { describe, expect, it } from 'vitest';
import type { AnswerValue, Answers } from './answers.js';
import { createEmptyForm, createField } from './factories.js';
import type { Field } from './fields.js';
import { BYTES_PER_MB, type FileAnswer } from './files.js';
import type { FormSchema } from './form-schema.js';
import {
  answerErrorsFromIssues,
  buildSubmissionValidator,
  HONEYPOT_FIELD,
  MAX_COMPLETION_TIME_MS,
  submissionInputSchema,
  toAnswerIssues,
  validateAnswer,
  validateAnswers,
} from './submission.js';

function upload(name: string, size: number): FileAnswer {
  return {
    url: `https://res.cloudinary.com/demo/raw/upload/v1/formyx/${name}`,
    publicId: `formyx/${name}`,
    name,
    size,
    type: 'application/octet-stream',
  };
}

const text = createField('short_text');
const number = createField('number');
const rating = createField('rating');
const date = createField('date');
const single = createField('single_choice');
const dropdown = createField('dropdown');
const multi = createField('multi_choice');
const [optionA = '', optionB = ''] = single.options.map((option) => option.id);
const [dropA = ''] = dropdown.options.map((option) => option.id);
const [multiA = '', multiB = ''] = multi.options.map((option) => option.id);

function form(...fields: Field[]): FormSchema {
  return { ...createEmptyForm(), fields };
}

function required<T extends Field>(field: T): T {
  return { ...field, required: true };
}

function showWhen<T extends Field>(
  field: T,
  sourceFieldId: string,
  condition: { operator: 'equals' | 'is_answered'; value?: string },
): T {
  return { ...field, conditions: [{ sourceFieldId, ...condition }] };
}

/** Parses `answers` with the validator built for them. */
function submit(schema: FormSchema, answers: Answers) {
  return buildSubmissionValidator(schema, answers).safeParse(answers);
}

describe('validateAnswer', () => {
  it.each<[string, AnswerValue | undefined]>([
    ['missing', undefined],
    ['null', null],
    ['empty text', ''],
    ['blank text', '   '],
    ['an empty selection', []],
  ])('requires an answer to required questions: %s', (_case, value) => {
    expect(validateAnswer(required(text), value)).toBe('This question is required');
    expect(validateAnswer(required(multi), value)).toBe('This question is required');
    expect(validateAnswer(text, value)).toBeNull();
  });

  it('never asks statements for an answer', () => {
    expect(validateAnswer(createField('statement'), undefined)).toBeNull();
  });

  it.each<[string, Field, AnswerValue, string | null]>([
    [
      'text too short',
      { ...text, validation: { minLength: 3 } },
      'ab',
      'Use at least 3 characters',
    ],
    [
      'text measured trimmed',
      { ...text, validation: { minLength: 3 } },
      ' ab ',
      'Use at least 3 characters',
    ],
    ['text too long', { ...text, validation: { maxLength: 1 } }, 'ab', 'Use 1 character or fewer'],
    ['text in range', { ...text, validation: { minLength: 2, maxLength: 4 } }, 'abc', null],
    ['short text default limit', text, 'x'.repeat(1001), 'Use 1000 characters or fewer'],
    ['long text default limit', createField('long_text'), 'x'.repeat(10_000), null],
    ['text that is not text', text, 42, 'Enter text'],
    ['email without domain', createField('email'), 'ada@example', 'Enter a valid email address'],
    ['email with spaces around', createField('email'), ' ada@example.com ', null],
    ['email that is a number', createField('email'), 5, 'Enter a valid email address'],
    [
      'phone too short',
      createField('phone'),
      '12',
      'Enter a valid phone number with its country code',
    ],
    [
      'phone with letters',
      createField('phone'),
      '555-CALL-NOW',
      'Enter a valid phone number with its country code',
    ],
    ['phone with punctuation', createField('phone'), '+44 (20) 7946-0958', null],
    ['number from text', number, 'abc', 'Enter a number'],
    ['number with trailing text', number, '12abc', 'Enter a number'],
    ['hex is not a number', number, '0x10', 'Enter a number'],
    ['decimal text', number, '-12.5', null],
    ['exponent text', number, '1e3', null],
    [
      'number below the minimum',
      { ...number, validation: { min: 1, max: 5 } },
      0,
      'Enter a number of at least 1',
    ],
    [
      'number above the maximum',
      { ...number, validation: { min: 1, max: 5 } },
      6,
      'Enter a number of at most 5',
    ],
    ['number text in range', { ...number, validation: { min: 1, max: 5 } }, '3', null],
    ['rating above the scale', rating, 6, 'Pick a rating from 1 to 5'],
    ['rating below the scale', rating, 0, 'Pick a rating from 1 to 5'],
    ['fractional rating', rating, 2.5, 'Pick a rating from 1 to 5'],
    ['rating as text', rating, '3', 'Pick a rating from 1 to 5'],
    ['rating on the scale', rating, 5, null],
    ['date that does not exist', date, '2026-02-30', 'Enter a valid date'],
    ['date in another format', date, '30/09/2026', 'Enter a valid date'],
    ['leap day', date, '2028-02-29', null],
    ['unknown option', single, 'opt_unknown', 'Choose an option'],
    ['option as a number', single, 1, 'Choose an option'],
    ['known option', single, optionB, null],
    ['dropdown option', dropdown, dropA, null],
    ['dropdown unknown option', dropdown, 'opt_unknown', 'Choose an option'],
    ['one unknown checkbox', multi, [multiA, 'opt_unknown'], 'Choose from the options'],
    ['checkboxes that are not a list', multi, multiA, 'Choose from the options'],
    ['known checkboxes', multi, [multiA], null],
    ['an uploaded file', createField('file'), upload('cv.pdf', 2 * BYTES_PER_MB), null],
    ['a bare file name', createField('file'), 'cv.pdf', 'Upload the file again'],
    [
      'a file over the limit',
      createField('file'),
      upload('cv.pdf', 11 * BYTES_PER_MB),
      'This file is too big. The limit is 10 MB',
    ],
    [
      'a type the question does not take',
      createField('file'),
      upload('notes.docx', 1000),
      'This type of file isn’t accepted here',
    ],
  ])('%s', (_case, field, value, expected) => {
    expect(validateAnswer(field, value)).toBe(expected);
  });
});

describe('buildSubmissionValidator', () => {
  it('returns the answers normalised: trimmed, numbers as numbers, no empties', () => {
    const email = createField('email');
    const schema = form(text, email, number, multi, date);
    const result = submit(schema, {
      [text.id]: '  Ada  ',
      [email.id]: ' ada@example.com',
      [number.id]: '42',
      [multi.id]: [multiB, multiA, multiB],
      [date.id]: '',
    });

    expect(result.success && result.data).toEqual({
      [text.id]: 'Ada',
      [email.id]: 'ada@example.com',
      [number.id]: 42,
      [multi.id]: [multiB, multiA],
    });
  });

  it('accepts a form left empty when nothing is required', () => {
    const result = submit(form(text, number, single), {});
    expect(result.success && result.data).toEqual({});
  });

  it('reports every problem by field id', () => {
    const email = required(createField('email'));
    const schema = form(required(text), email, rating);
    const result = submit(schema, { [email.id]: 'nope', [rating.id]: 9 });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => [issue.path, issue.message])).toEqual([
      [[text.id], 'This question is required'],
      [[email.id], 'Enter a valid email address'],
      [[rating.id], 'Pick a rating from 1 to 5'],
    ]);
  });

  it('skips hidden questions, even required ones', () => {
    const reason = required(
      showWhen(createField('long_text'), single.id, { operator: 'equals', value: optionA }),
    );
    const schema = form(single, reason);

    expect(submit(schema, { [single.id]: optionB }).success).toBe(true);
    const shown = submit(schema, { [single.id]: optionA });
    expect(shown.error?.issues[0]?.path).toEqual([reason.id]);
  });

  it('strips answers to hidden, unknown and statement questions', () => {
    const reason = showWhen(createField('long_text'), single.id, {
      operator: 'equals',
      value: optionA,
    });
    const statement = createField('statement');
    const schema = form(single, reason, statement);

    const result = submit(schema, {
      [single.id]: optionB,
      [reason.id]: 'Typed before the choice changed',
      [statement.id]: 'x',
      fld_unknown: 'x',
    });
    expect(result.success && result.data).toEqual({ [single.id]: optionB });
  });

  it('does not validate answers to hidden questions', () => {
    const age = showWhen({ ...number, validation: { min: 18 } }, single.id, {
      operator: 'equals',
      value: optionA,
    });
    const result = submit(form(single, age), { [single.id]: optionB, [age.id]: 3 });
    expect(result.success).toBe(true);
  });

  it('follows chains: a question depending on a hidden one stays hidden', () => {
    const company = showWhen(createField('short_text'), single.id, {
      operator: 'equals',
      value: optionA,
    });
    const workEmail = required(
      showWhen(createField('email'), company.id, { operator: 'is_answered' }),
    );
    const schema = form(single, company, workEmail);

    // The company answer is left over from before the choice changed, so it does not count.
    const answers = { [single.id]: optionB, [company.id]: 'Acme' };
    const result = submit(schema, answers);
    expect(result.success && result.data).toEqual({ [single.id]: optionB });

    const employed = submit(schema, { ...answers, [single.id]: optionA });
    expect(employed.error?.issues.map((issue) => issue.path)).toEqual([[workEmail.id]]);
  });
});

describe('validateAnswers', () => {
  it('gives the first problem for each question, or nothing when all is well', () => {
    const email = required(createField('email'));
    const schema = form(required(text), email);

    expect(validateAnswers(schema, { [email.id]: 'x' })).toEqual({
      [text.id]: 'This question is required',
      [email.id]: 'Enter a valid email address',
    });
    expect(validateAnswers(schema, { [text.id]: 'Ada', [email.id]: 'ada@example.com' })).toEqual(
      {},
    );
  });
});

describe('submissionInputSchema', () => {
  it('accepts answers with metadata and the honeypot', () => {
    const input = submissionInputSchema.parse({
      answers: { [text.id]: 'Ada', [multi.id]: [multiA], [number.id]: 3, [date.id]: null },
      completionTimeMs: 12_345,
      referrer: 'https://example.com/newsletter',
      [HONEYPOT_FIELD]: '',
    });
    expect(input.completionTimeMs).toBe(12_345);
  });

  it('caps the completion time and shortens long referrers', () => {
    const input = submissionInputSchema.parse({
      answers: {},
      completionTimeMs: MAX_COMPLETION_TIME_MS * 3,
      referrer: `https://example.com/${'a'.repeat(3000)}`,
    });
    expect(input.completionTimeMs).toBe(MAX_COMPLETION_TIME_MS);
    expect(input.referrer).toHaveLength(2048);
  });

  it.each([
    ['answers that are not keyed by field id', { answers: { 'bad id!': 'x' } }],
    ['answers that are objects', { answers: { [text.id]: { nested: true } } }],
    ['a negative completion time', { answers: {}, completionTimeMs: -1 }],
    ['no answers at all', {}],
  ])('rejects %s', (_case, body) => {
    expect(submissionInputSchema.safeParse(body).success).toBe(false);
  });
});

describe('answer issues', () => {
  it('round-trips validator problems to the field errors forms show', () => {
    const schema = form(required(text), rating);
    const result = submit(schema, { [rating.id]: 99 });
    if (result.success) throw new Error('expected problems');

    const issues = toAnswerIssues(result.error);
    expect(issues.map((issue) => issue.path)).toEqual([
      `answers.${text.id}`,
      `answers.${rating.id}`,
    ]);
    expect(answerErrorsFromIssues([...issues, { path: 'completionTimeMs', message: 'x' }])).toEqual(
      {
        [text.id]: 'This question is required',
        [rating.id]: 'Pick a rating from 1 to 5',
      },
    );
  });
});
