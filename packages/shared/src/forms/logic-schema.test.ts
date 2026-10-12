import { describe, expect, it } from 'vitest';
import { toValidationIssues } from '../errors.js';
import { requiredLogicFeatures } from '../entitlements/logic-features.js';
import { createEmptyForm, createField, createOption } from './factories.js';
import type { Field } from './fields.js';
import { formSchema, removeBrokenConditions, type FormSchema } from './form-schema.js';
import { createEndScreen, createJump, createRule, createVariable } from './logic-factories.js';
import type { FormLogic, LogicCondition } from './logic-schema.js';
import { migrateFormSchema } from './migrate-form-schema.js';
import { findPublishIssues } from './publish.js';

const free = createOption('Free');
const plan = {
  ...createField('single_choice'),
  id: 'plan',
  label: 'Plan',
  options: [free, createOption('Pro')],
};
const p2 = { ...createField('page_break'), id: 'p2' };
const seats = { ...createField('number'), id: 'seats', label: 'Seats' };
const p3 = { ...createField('page_break'), id: 'p3' };
const note = { ...createField('short_text'), id: 'note', label: 'Note' };
const score = { ...createVariable('score'), id: 'score' };

function form(
  logic: Partial<FormLogic> = {},
  fields: Field[] = [plan, p2, seats, p3, note],
): FormSchema {
  const base = createEmptyForm();
  return { ...base, fields, logic: { ...base.logic, ...logic } };
}

function issues(schema: unknown) {
  const result = formSchema.safeParse(schema);
  return result.success ? [] : toValidationIssues(result.error);
}

const answered = (sourceFieldId: string): LogicCondition => ({
  kind: 'answer',
  sourceFieldId,
  operator: 'is_answered',
});

describe('logic integrity', () => {
  it('accepts sound logic', () => {
    const schema = form({
      variables: [score],
      rules: [
        {
          ...createRule(score.id),
          when: [answered('note')],
          amount: { kind: 'answer', fieldId: 'seats' },
        },
      ],
      pages: {
        start: {
          title: 'Plan',
          shuffleQuestions: true,
          jumps: [{ ...createJump({ kind: 'page', pageKey: 'p3' }), when: [answered('plan')] }],
        },
        p2: { jumps: [createJump({ kind: 'end', endScreenId: 'end_default' })] },
      },
    });
    expect(issues(schema)).toEqual([]);
  });

  it('only lets jumps go forward, to things that exist', () => {
    const schema = form({
      pages: {
        p2: {
          jumps: [
            createJump({ kind: 'page', pageKey: 'start' }),
            createJump({ kind: 'page', pageKey: 'p2' }),
            createJump({ kind: 'page', pageKey: 'gone' }),
            createJump({ kind: 'end', endScreenId: 'gone' }),
          ],
        },
      },
    });
    expect(issues(schema).map((issue) => issue.message)).toEqual([
      'Can only jump to a later page',
      'Can only jump to a later page',
      'Refers to a page that does not exist',
      'Refers to an end screen that does not exist',
    ]);
  });

  it('only lets a jump check answers on its page or before, and never the quiz', () => {
    const schema = form({
      pages: {
        start: {
          jumps: [
            {
              ...createJump({ kind: 'page', pageKey: 'p3' }),
              when: [
                answered('seats'),
                { kind: 'variable', variableId: 'quiz_score', operator: 'at_least', value: 1 },
                { kind: 'quiz', result: 'passed' },
              ],
            },
          ],
        },
      },
    });
    expect(issues(schema)).toEqual([
      {
        path: 'logic.pages.start.jumps.0.when.0.sourceFieldId',
        message: 'Can only check questions on this page or earlier',
      },
      {
        path: 'logic.pages.start.jumps.0.when.1.variableId',
        message: 'Only end screens can use the quiz score',
      },
      {
        path: 'logic.pages.start.jumps.0.when.2.result',
        message: 'Only end screens can check the quiz result',
      },
    ]);
  });

  it('checks rules, quiz answers, page settings and ids', () => {
    const schema = form({
      variables: [score, { ...score }, { ...createVariable(), id: 'quiz_score' }],
      rules: [{ ...createRule('nope'), amount: { kind: 'answer', fieldId: 'note' } }],
      quiz: {
        enabled: true,
        answers: {
          plan: { correct: ['opt_gone'], points: 1 },
          p2: { correct: [], points: 1 },
          seats: { correct: ['ten'], points: 1 },
        },
        showScore: true,
        revealAnswers: false,
      },
      pages: { gone: {}, p2: { title: 'Not here' } },
    });
    expect(issues(schema).map((issue) => `${issue.path}: ${issue.message}`)).toEqual([
      'logic.variables.1.id: Another variable already uses this id',
      'logic.variables.2.id: This id is kept for the quiz score',
      'logic.pages.gone: Refers to a page that no longer exists',
      'logic.pages.p2.title: Later pages take their title from their page break',
      'logic.rules.0.variableId: Refers to a variable that does not exist',
      'logic.rules.0.amount: Use a question whose answer is a number',
      "logic.quiz.answers.plan.correct: Pick from the question's options",
      'logic.quiz.answers.p2: A quiz cannot mark this kind of question',
      'logic.quiz.answers.seats.correct: Enter numbers',
    ]);
  });

  it('keeps at least one end screen', () => {
    expect(issues(form({ endScreens: [] }))).toEqual([
      { path: 'logic.endScreens', message: 'Keep at least one end screen' },
    ]);
  });
});

describe('repairing logic after questions change', () => {
  it('drops jumps and rules that refer to removed things, and broken end screen conditions', () => {
    const jump = { ...createJump({ kind: 'page', pageKey: 'p3' }), when: [answered('plan')] };
    const screen = createEndScreen({ id: 'pro', when: [answered('plan'), answered('note')] });
    const schema = form({
      variables: [score],
      rules: [{ ...createRule(score.id), when: [answered('plan')] }, createRule(score.id)],
      pages: { start: { jumps: [jump] }, p2: { shuffleQuestions: true } },
      quiz: {
        enabled: true,
        answers: { plan: { correct: [free.id, 'opt_removed'], points: 2 } },
        showScore: true,
        revealAnswers: false,
      },
      endScreens: [...createEmptyForm().logic.endScreens, screen],
    });
    // The plan question and the second page break are deleted.
    const edited = { ...schema, fields: [seats, p3, note] };
    const { form: repaired, removed } = removeBrokenConditions(edited);
    expect(repaired.logic.pages).toEqual({ start: { jumps: [] } });
    expect(repaired.logic.rules).toHaveLength(1);
    expect(repaired.logic.quiz?.answers).toEqual({});
    expect(repaired.logic.endScreens[1]?.when).toEqual([answered('note')]);
    expect(removed).toBe(5);
    expect(issues(repaired)).toEqual([]);
  });

  it('keeps quiz answers that are still options', () => {
    const schema = form({
      quiz: {
        enabled: true,
        answers: { plan: { correct: [free.id], points: 2 } },
        showScore: true,
        revealAnswers: false,
      },
    });
    const withoutFree = { ...plan, options: plan.options.slice(1) };
    const { form: repaired } = removeBrokenConditions({
      ...schema,
      fields: [withoutFree, p2, seats, p3, note],
    });
    expect(repaired.logic.quiz?.answers).toEqual({ plan: { correct: [], points: 2 } });
  });

  it('returns the same form when nothing is broken', () => {
    const schema = form();
    expect(removeBrokenConditions(schema)).toEqual({ form: schema, removed: 0 });
  });
});

describe('publishing logic', () => {
  const paths = (schema: FormSchema) =>
    findPublishIssues(schema)
      .filter(
        (issue) =>
          issue.path.startsWith('logic') ||
          issue.message.includes('earlier') ||
          issue.message.includes('exists'),
      )
      .map((issue) => `${issue.path}: ${issue.message}`);

  it('needs names, condition values, end screen content and working links', () => {
    const screen = createEndScreen({
      id: 'next',
      when: [{ kind: 'variable', variableId: score.id, operator: 'at_least' }],
      button: { label: '', url: 'http://example.com' },
      redirect: {
        url: 'ftp://files',
        delaySeconds: 0,
        params: [
          { name: 'has space', source: { kind: 'answer', fieldId: 'note' } },
          { name: 'ok', source: { kind: 'variable', variableId: score.id } },
          { name: 'ok', source: { kind: 'answer', fieldId: 'note' } },
        ],
      },
    });
    const schema = form({
      variables: [{ ...score, name: ' ' }],
      endScreens: [...createEmptyForm().logic.endScreens, screen],
    });
    expect(paths(schema)).toEqual([
      'logic.variables.0.name: Name this variable',
      'logic.endScreens.1.when.0.value: Choose a value for this condition',
      'logic.endScreens.1.message: Write a title or a message',
      'logic.endScreens.1.button.label: Write the button text',
      'logic.endScreens.1.button.url: Use an https:// link',
      'logic.endScreens.1.redirect.url: Use an https:// link',
      'logic.endScreens.1.redirect.params.0.name: Use letters, digits, -, _ and . for the parameter',
      'logic.endScreens.1.redirect.params.2.name: Another parameter has this name',
    ]);
  });

  it('needs the quiz answered, and pipes only earlier answers', () => {
    const schema = form(
      {
        quiz: { enabled: true, answers: {}, showScore: true, revealAnswers: true },
        endScreens: [
          createEndScreen({
            id: 'end_default',
            message: 'Thanks {{field:note}}, {{var:quiz_score}}',
          }),
        ],
      },
      [
        { ...plan, label: 'Hi {{field:note}}' },
        p2,
        seats,
        p3,
        { ...note, description: '{{var:gone}}' },
      ],
    );
    expect(paths(schema)).toEqual([
      'logic.quiz: Mark the right answer to at least one question',
      'fields.0.label: Can only show answers to earlier questions',
      'fields.4.description: Refers to a variable that no longer exists',
    ]);
  });
});

describe('schema v3', () => {
  it('turns a v2 thank-you message into the default end screen', () => {
    const v2 = {
      version: 2,
      fields: [],
      settings: { submitButtonText: 'Send', successMessage: 'Thanks *so* much' },
    };
    const v3 = migrateFormSchema(v2);
    expect(v3.version).toBe(3);
    expect(v3.settings).toEqual({ submitButtonText: 'Send', saveProgress: 'browser' });
    expect(v3.logic).toMatchObject({ pages: {}, variables: [], rules: [] });
    expect(v3.logic.endScreens).toEqual([
      expect.objectContaining({ id: 'end_default', message: 'Thanks \\*so\\* much', when: [] }),
    ]);
  });
});

describe('requiredLogicFeatures', () => {
  it('keeps pages, piping and saving in the browser free', () => {
    expect(
      requiredLogicFeatures(form({ pages: { start: { title: 'Hi', shuffleQuestions: true } } })),
    ).toEqual([]);
  });

  it('needs advanced logic for jumps, values, more end screens, redirects and email', () => {
    const base = form();
    expect(
      requiredLogicFeatures(
        form({ pages: { start: { jumps: [createJump({ kind: 'page', pageKey: 'p2' })] } } }),
      ),
    ).toEqual(['advanced_logic']);
    expect(requiredLogicFeatures(form({ variables: [score] }))).toEqual(['advanced_logic']);
    expect(
      requiredLogicFeatures(form({ endScreens: [...base.logic.endScreens, createEndScreen()] })),
    ).toEqual(['advanced_logic']);
    expect(
      requiredLogicFeatures({ ...base, settings: { ...base.settings, saveProgress: 'email' } }),
    ).toEqual(['advanced_logic']);
  });

  it('needs quizzes for a quiz', () => {
    expect(
      requiredLogicFeatures(
        form({ quiz: { enabled: true, answers: {}, showScore: true, revealAnswers: false } }),
      ),
    ).toEqual(['quiz_mode']);
  });
});
