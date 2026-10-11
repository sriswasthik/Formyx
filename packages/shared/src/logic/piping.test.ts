import { describe, expect, it } from 'vitest';
import { createField, createOption } from '../forms/factories.js';
import type { Field } from '../forms/fields.js';
import { createVariable } from '../forms/logic-factories.js';
import {
  findPipeTokens,
  pipeToken,
  pipeTokenProblem,
  pipedAnswer,
  resolvePiping,
  type PipingContext,
} from './piping.js';

const name = { ...createField('short_text'), id: 'name' };
const email = createOption('Email');
const phone = createOption('Phone');
const plan = {
  ...createField('multi_choice'),
  id: 'plan',
  options: [email, phone],
};
const budget = { ...createField('currency'), id: 'budget' };
const weight = { ...createField('slider'), id: 'weight', unit: 'kg' };
const statement = { ...createField('statement'), id: 'intro' };
const fields: Field[] = [name, plan, budget, weight, statement];
const total = { ...createVariable('price'), id: 'total', currency: 'INR' };
const score = { ...createVariable('score'), id: 'score' };

const context = (answers: PipingContext['answers'], values = {}): PipingContext => ({
  fieldById: new Map(fields.map((field) => [field.id, field])),
  answers,
  values,
  variables: [total, score],
});

describe('piping', () => {
  it('finds the tokens in text', () => {
    expect(
      findPipeTokens(`Hi ${pipeToken('field', 'name')}, ${pipeToken('var', 'score')}!`),
    ).toEqual([
      { kind: 'field', id: 'name', raw: '{{field:name}}' },
      { kind: 'var', id: 'score', raw: '{{var:score}}' },
    ]);
    expect(findPipeTokens('{{field:has space}} {{other:x}} {name}')).toEqual([]);
  });

  it('puts answers in as words', () => {
    expect(resolvePiping('Thanks, {{field:name}}!', context({ name: ' Ada ' }))).toBe(
      'Thanks, Ada!',
    );
    expect(resolvePiping('By {{field:plan}}', context({ plan: [email.id, phone.id] }))).toBe(
      'By Email, Phone',
    );
    expect(pipedAnswer(budget, 125000)).toBe('₹1,25,000');
    expect(pipedAnswer(weight, 12.5)).toBe('12.5 kg');
  });

  it('puts calculated values in, prices in their currency', () => {
    expect(
      resolvePiping(
        '{{var:total}} for {{var:score}} points',
        context({}, { total: 1500, score: 7.25 }),
      ),
    ).toBe('₹1,500 for 7.25 points');
  });

  it('leaves nothing for missing answers and things that no longer exist', () => {
    expect(resolvePiping('Hi {{field:name}}.', context({}))).toBe('Hi .');
    expect(resolvePiping('{{field:gone}}{{var:gone}}{{field:intro}}', context({}))).toBe('');
  });

  it('escapes answers going into rich text', () => {
    expect(
      resolvePiping('Hi {{field:name}}', context({ name: '*bold*' }), { richText: true }),
    ).toBe('Hi \\*bold\\*');
    expect(resolvePiping('Hi {{field:name}}', context({ name: '*bold*' }))).toBe('Hi *bold*');
  });
});

describe('pipeTokenProblem', () => {
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const check = (kind: 'field' | 'var', id: string, earlier: string[] = [], quiz = false) =>
    pipeTokenProblem({ kind, id, raw: '' }, fieldById, new Set(earlier), [total], { quiz });

  it('allows answers to earlier questions and existing variables', () => {
    expect(check('field', 'name', ['name'])).toBeNull();
    expect(check('var', 'total')).toBeNull();
    expect(check('var', 'quiz_score', [], true)).toBeNull();
  });

  it('says what is wrong otherwise', () => {
    expect(check('field', 'name')).toBe('Can only show answers to earlier questions');
    expect(check('field', 'gone')).toBe('Refers to a question that no longer exists');
    expect(check('field', 'intro', ['intro'])).toBe('Refers to something with no answer');
    expect(check('var', 'gone')).toBe('Refers to a variable that no longer exists');
    expect(check('var', 'quiz_score')).toBe('The quiz score can only be shown on end screens');
  });
});
