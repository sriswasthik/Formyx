import { describe, expect, it } from 'vitest';
import { createEmptyForm, createField, createOption } from '../forms/factories.js';
import type { Field, FieldOfType } from '../forms/fields.js';
import type { FormSchema } from '../forms/form-schema.js';
import { createJump, createRule, createVariable } from '../forms/logic-factories.js';
import type { FormLogic, LogicCondition } from '../forms/logic-schema.js';
import { validateAnswers } from '../forms/submission.js';
import { resolvePath, sanitizeAnswers } from './navigation.js';

/*
 * A three-page sign-up: plan on page 1; team details on page 2 (Pro only); feedback on
 * page 3. Free plans jump straight to page 3.
 */
const name = { ...createField('short_text'), id: 'name', label: 'Name', required: true };
const free = createOption('Free');
const pro = createOption('Pro');
const plan: FieldOfType<'single_choice'> = {
  ...createField('single_choice'),
  id: 'plan',
  label: 'Plan',
  options: [free, pro],
};
const teamPage = { ...createField('page_break'), id: 'team', label: 'Your team' };
const seats = { ...createField('number'), id: 'seats', label: 'Seats', required: true };
const feedbackPage = { ...createField('page_break'), id: 'feedback', label: 'Feedback' };
const comments = { ...createField('long_text'), id: 'comments', label: 'Comments' };
const source = { ...createField('hidden'), id: 'source', label: 'Source', paramName: 'source' };

const planIs = (optionId: string): LogicCondition => ({
  kind: 'answer',
  sourceFieldId: plan.id,
  operator: 'equals',
  value: optionId,
});

function form(logic: Partial<FormLogic> = {}, fields: Field[] = []): FormSchema {
  const base = createEmptyForm();
  return {
    ...base,
    fields: fields.length ? fields : [name, plan, teamPage, seats, feedbackPage, comments, source],
    logic: { ...base.logic, ...logic },
  };
}

const skipTeamForFree = form({
  pages: {
    start: {
      jumps: [{ ...createJump({ kind: 'page', pageKey: 'feedback' }), when: [planIs(free.id)] }],
    },
  },
});

describe('resolvePath', () => {
  it('goes through every page in order without jumps', () => {
    const path = resolvePath(form(), { name: 'Ada' });
    expect(path.pages).toEqual(['start', 'team', 'feedback']);
    expect(path.endJump).toBeNull();
    expect([...path.active]).toEqual(
      expect.arrayContaining(['name', 'plan', 'team', 'seats', 'feedback', 'comments', 'source']),
    );
  });

  it('keeps a form without page breaks on one page', () => {
    expect(resolvePath(form({}, [name, plan]), {}).pages).toEqual(['start']);
  });

  it('follows a jump to a later page, skipping the pages between', () => {
    const path = resolvePath(skipTeamForFree, { plan: free.id });
    expect(path.pages).toEqual(['start', 'feedback']);
    expect(path.active.has('seats')).toBe(false);
    expect(path.active.has('comments')).toBe(true);
  });

  it('does not jump while the condition does not hold, or has no value yet', () => {
    expect(resolvePath(skipTeamForFree, { plan: pro.id }).pages).toEqual([
      'start',
      'team',
      'feedback',
    ]);
    const unfinished = form({
      pages: {
        start: {
          jumps: [
            {
              ...createJump({ kind: 'page', pageKey: 'feedback' }),
              when: [{ kind: 'answer', sourceFieldId: plan.id, operator: 'equals' }],
            },
          ],
        },
      },
    });
    expect(resolvePath(unfinished, { plan: free.id }).pages).toHaveLength(3);
  });

  it('jumps to an end screen, ending the route there', () => {
    const toEnd = form({
      pages: {
        start: {
          jumps: [
            { ...createJump({ kind: 'end', endScreenId: 'end_default' }), when: [planIs(free.id)] },
          ],
        },
      },
    });
    const path = resolvePath(toEnd, { plan: free.id });
    expect(path.pages).toEqual(['start']);
    expect(path.endJump).toBe('end_default');
  });

  it('takes the first jump that holds, and a jump without conditions always applies', () => {
    const logic = form({
      pages: {
        start: {
          jumps: [
            { ...createJump({ kind: 'page', pageKey: 'feedback' }), when: [planIs(free.id)] },
            createJump({ kind: 'end', endScreenId: 'end_default' }),
          ],
        },
      },
    });
    expect(resolvePath(logic, { plan: free.id }).pages).toEqual(['start', 'feedback']);
    expect(resolvePath(logic, { plan: pro.id })).toMatchObject({
      pages: ['start'],
      endJump: 'end_default',
    });
  });

  it('jumps on calculated values', () => {
    const score = createVariable('score');
    const logic = form({
      variables: [score],
      rules: [
        { ...createRule(score.id), when: [planIs(pro.id)], amount: { kind: 'number', value: 10 } },
      ],
      pages: {
        start: {
          jumps: [
            {
              ...createJump({ kind: 'page', pageKey: 'feedback' }),
              when: [{ kind: 'variable', variableId: score.id, operator: 'at_least', value: 10 }],
            },
          ],
        },
      },
    });
    expect(resolvePath(logic, { plan: pro.id })).toMatchObject({
      pages: ['start', 'feedback'],
      values: { [score.id]: 10 },
    });
    expect(resolvePath(logic, { plan: free.id }).pages).toHaveLength(3);
  });

  it('ignores answers left on pages a jump skips', () => {
    const shownForSeats: Field = {
      ...comments,
      conditions: [{ sourceFieldId: seats.id, operator: 'is_answered' }],
    };
    const logic = form(skipTeamForFree.logic, [
      name,
      plan,
      teamPage,
      seats,
      feedbackPage,
      shownForSeats,
    ]);
    // Went back, switched to Free: the seats answer is still in the browser.
    const path = resolvePath(logic, { plan: free.id, seats: 12 });
    expect(path.active.has('comments')).toBe(false);
  });

  it('counts hidden fields wherever they are', () => {
    const path = resolvePath(skipTeamForFree, { plan: free.id, source: 'newsletter' });
    expect(path.active.has('source')).toBe(true);
  });
});

describe('answers on skipped pages', () => {
  it('are dropped, and the questions there need no answer', () => {
    const answers = { name: 'Ada', plan: free.id, seats: 12, comments: 'Lovely' };
    expect(sanitizeAnswers(skipTeamForFree, answers)).toEqual({
      name: 'Ada',
      plan: free.id,
      comments: 'Lovely',
    });
    // Seats is required, but a free plan never sees it.
    expect(validateAnswers(skipTeamForFree, { name: 'Ada', plan: free.id })).toEqual({});
    expect(validateAnswers(skipTeamForFree, { name: 'Ada', plan: pro.id })).toEqual({
      seats: 'This question is required',
    });
  });
});
