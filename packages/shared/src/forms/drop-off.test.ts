import { describe, expect, it } from 'vitest';
import { biggestDrop, buildDropOff, type VisitProgress } from './drop-off.js';
import { createEmptyForm, createField } from './factories.js';
import type { Field } from './fields.js';
import type { FormSchema } from './form-schema.js';

const name = { ...createField('short_text'), id: 'name', label: 'Your name' };
const email = { ...createField('email'), id: 'email', label: 'Email for {{field:name}}' };
const intro = { ...createField('statement'), id: 'intro', label: 'Hello' };
const rating = { ...createField('rating'), id: 'rating', label: '' };
const details = { ...createField('page_break'), id: 'details', label: 'Details' };

function form(fields: Field[]): FormSchema {
  return { ...createEmptyForm(), fields };
}

const visit = (props: Partial<VisitProgress> = {}): VisitProgress => ({
  furthestPage: null,
  furthestField: null,
  completed: false,
  ...props,
});

describe('buildDropOff', () => {
  it('counts questions on single-page forms: a visit reached the one after its last answer', () => {
    const dropOff = buildDropOff(form([name, intro, email, rating]), [
      visit(),
      visit({ furthestField: 'name' }),
      visit({ furthestField: 'name' }),
      visit({ furthestField: 'email' }),
      visit({ completed: true, furthestField: 'name' }),
    ]);
    expect(dropOff).toEqual({
      unit: 'question',
      started: 5,
      steps: [
        { key: 'name', label: 'Your name', reached: 5 },
        { key: 'email', label: 'Email for …', reached: 4 },
        { key: 'rating', label: 'Question 3', reached: 2 },
      ],
      completed: 1,
    });
  });

  it('counts pages on forms with page breaks', () => {
    const dropOff = buildDropOff(form([name, details, email]), [
      visit({ furthestPage: 'start' }),
      visit({ furthestPage: 'details' }),
      visit({ furthestPage: 'gone' }),
      visit({ completed: true }),
    ]);
    expect(dropOff).toMatchObject({
      unit: 'page',
      steps: [
        { key: 'start', label: 'Page 1', reached: 4 },
        { key: 'details', label: 'Details', reached: 2 },
      ],
      completed: 1,
    });
  });

  it('weighs grouped visits by their count', () => {
    const dropOff = buildDropOff(form([name, email]), [
      visit({ count: 3 }),
      visit({ furthestField: 'name', count: 2 }),
    ]);
    expect(dropOff.started).toBe(5);
    expect(dropOff.steps.map((step) => step.reached)).toEqual([5, 2]);
  });
});

describe('biggestDrop', () => {
  it('finds the step most visitors left before', () => {
    const dropOff = buildDropOff(form([name, email, rating]), [
      visit(),
      visit({ furthestField: 'name' }),
      visit({ furthestField: 'name' }),
      visit({ furthestField: 'name' }),
      visit({ furthestField: 'email' }),
      visit({ completed: true }),
    ]);
    // 6 started, 6 reached name, 5 email, 2 rating, 1 finished.
    expect(biggestDrop(dropOff)).toEqual({ index: 2, lost: 3 });
  });

  it('is null when nobody left', () => {
    expect(biggestDrop(buildDropOff(form([name]), [visit({ completed: true })]))).toBeNull();
    expect(biggestDrop(buildDropOff(form([name]), []))).toBeNull();
  });
});
