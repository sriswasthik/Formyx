import { describe, expect, it } from 'vitest';
import { createEmptyForm, createField, createOption } from '../forms/factories.js';
import type { Field } from '../forms/fields.js';
import type { FormSchema } from '../forms/form-schema.js';
import { createEndScreen, createJump } from '../forms/logic-factories.js';
import type { QuizSettings } from '../forms/logic-schema.js';
import { chooseEndScreen, computeOutcome } from './outcome.js';
import { isCorrectAnswer, markQuiz } from './quiz.js';

const mumbai = createOption('Mumbai');
const delhi = createOption('New Delhi');
const capital = {
  ...createField('single_choice'),
  id: 'capital',
  options: [mumbai, delhi],
};
const two = createOption('2');
const four = createOption('4');
const five = createOption('5');
const primes = {
  ...createField('multi_choice'),
  id: 'primes',
  options: [two, four, five],
};
const river = { ...createField('short_text'), id: 'river' };
const answer = { ...createField('number'), id: 'answer' };
const truth = { ...createField('yes_no'), id: 'truth' };

describe('isCorrectAnswer', () => {
  it('marks single choices, yes/no and dropdowns by option', () => {
    expect(isCorrectAnswer(capital, delhi.id, { correct: [delhi.id] })).toBe(true);
    expect(isCorrectAnswer(capital, mumbai.id, { correct: [delhi.id] })).toBe(false);
    expect(isCorrectAnswer(truth, 'yes', { correct: ['yes'] })).toBe(true);
  });

  it('needs exactly the right options on multiple choice', () => {
    const key = { correct: [two.id, five.id] };
    expect(isCorrectAnswer(primes, [five.id, two.id], key)).toBe(true);
    expect(isCorrectAnswer(primes, [two.id], key)).toBe(false);
    expect(isCorrectAnswer(primes, [two.id, four.id, five.id], key)).toBe(false);
  });

  it('accepts any of the answers to text, ignoring case and spacing', () => {
    const key = { correct: ['Ganga', 'Ganges'] };
    expect(isCorrectAnswer(river, '  the ganges ', { correct: ['The Ganges'] })).toBe(true);
    expect(isCorrectAnswer(river, 'GANGA', key)).toBe(true);
    expect(isCorrectAnswer(river, 'Yamuna', key)).toBe(false);
  });

  it('compares numbers as numbers, and nothing is right without a key', () => {
    expect(isCorrectAnswer(answer, 42, { correct: ['42.0'] })).toBe(true);
    expect(isCorrectAnswer(answer, 41, { correct: ['42'] })).toBe(false);
    expect(isCorrectAnswer(capital, delhi.id, { correct: [] })).toBe(false);
    expect(isCorrectAnswer(capital, undefined, { correct: [delhi.id] })).toBe(false);
  });
});

const quiz: QuizSettings = {
  enabled: true,
  answers: {
    capital: { correct: [delhi.id], points: 2 },
    primes: { correct: [two.id, five.id], points: 3 },
    river: { correct: ['Ganga'], points: 1 },
  },
  passPercent: 50,
  showScore: true,
  revealAnswers: true,
};
const fields: Field[] = [capital, primes, river];
const all = new Set(fields.map((field) => field.id));

describe('markQuiz', () => {
  it('adds the points for right answers, out of the points possible', () => {
    const result = markQuiz({ quiz }, fields, { capital: delhi.id, primes: [two.id] }, all);
    expect(result).toMatchObject({ score: 2, max: 6, percent: 33, passed: false });
    expect(result?.review).toEqual([
      { fieldId: 'capital', correct: true, answered: true, points: 2, expected: [delhi.id] },
      { fieldId: 'primes', correct: false, answered: true, points: 3, expected: [two.id, five.id] },
      { fieldId: 'river', correct: false, answered: false, points: 1, expected: ['Ganga'] },
    ]);
  });

  it('leaves out questions the respondent never saw', () => {
    const seen = new Set(['capital']);
    expect(markQuiz({ quiz }, fields, { capital: delhi.id }, seen)).toMatchObject({
      score: 2,
      max: 2,
      percent: 100,
      passed: true,
    });
  });

  it('has no pass mark unless one is set, and nothing when the quiz is off', () => {
    const { passPercent: _passPercent, ...noPassMark } = quiz;
    expect(markQuiz({ quiz: noPassMark }, fields, {}, all)?.passed).toBeNull();
    expect(markQuiz({ quiz: { ...quiz, enabled: false } }, fields, {}, all)).toBeNull();
    expect(markQuiz({}, fields, {}, all)).toBeNull();
  });
});

describe('end screens', () => {
  const base = createEmptyForm();
  const passed = createEndScreen({
    id: 'passed',
    when: [{ kind: 'quiz', result: 'passed' }],
  });
  const high = createEndScreen({
    id: 'high',
    when: [{ kind: 'variable', variableId: 'quiz_percent', operator: 'at_least', value: 90 }],
  });
  const jumpOnly = createEndScreen({ id: 'jumped' });
  const schema: FormSchema = {
    ...base,
    fields,
    logic: { ...base.logic, quiz, endScreens: [...base.logic.endScreens, high, passed, jumpOnly] },
  };

  it('picks the first screen whose conditions hold, or the default', () => {
    expect(
      computeOutcome(schema, { capital: delhi.id, primes: [two.id, five.id], river: 'Ganga' }),
    ).toMatchObject({
      endScreenId: 'high',
      values: { quiz_score: 6, quiz_percent: 100 },
      quiz: { passed: true },
    });
    expect(computeOutcome(schema, { primes: [two.id, five.id] }).endScreenId).toBe('passed');
    expect(computeOutcome(schema, {}).endScreenId).toBe('end_default');
  });

  it('never picks a screen without conditions unless a jump leads there', () => {
    expect(
      chooseEndScreen(schema.logic.endScreens, {
        fieldById: new Map(),
        answers: {},
        values: {},
        endJump: null,
      }).id,
    ).toBe('end_default');
    const jumping: FormSchema = {
      ...schema,
      logic: {
        ...schema.logic,
        pages: { start: { jumps: [createJump({ kind: 'end', endScreenId: 'jumped' })] } },
      },
    };
    expect(computeOutcome(jumping, {})).toMatchObject({ endScreenId: 'jumped', pages: ['start'] });
  });

  it('waits for the server on quiz conditions it cannot decide', () => {
    expect(
      chooseEndScreen(
        [base.logic.endScreens[0], passed].filter((screen) => screen !== undefined),
        {
          fieldById: new Map(),
          answers: {},
          values: {},
          quizPassed: undefined,
          endJump: null,
        },
      ).id,
    ).toBe('end_default');
  });
});
