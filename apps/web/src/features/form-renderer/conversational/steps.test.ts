import { describe, expect, it } from 'vitest';
import {
  conversationSteps,
  nextStep,
  previousStep,
  resolveStep,
  shouldAutoAdvance,
  stepKey,
  stepVisibleIds,
} from './steps';

const fields = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
const all = new Set(['a', 'b', 'c', 'd']);

describe('conversationSteps', () => {
  it('keeps the visible questions in order', () => {
    expect(conversationSteps(fields, new Set(['d', 'b'])).map((step) => step.id)).toEqual([
      'b',
      'd',
    ]);
  });
});

describe('resolveStep', () => {
  it('starts at the first visible question', () => {
    expect(resolveStep(fields, new Set(['b', 'c']), null)).toBe('b');
    expect(resolveStep(fields, new Set(), null)).toBeNull();
  });

  it('stays on the current question while it shows', () => {
    expect(resolveStep(fields, all, 'c')).toBe('c');
  });

  it('moves on to the next visible question when the current one is hidden', () => {
    expect(resolveStep(fields, new Set(['a', 'd']), 'b')).toBe('d');
  });

  it('falls back to the last one before it at the end', () => {
    expect(resolveStep(fields, new Set(['a', 'b']), 'd')).toBe('b');
  });
});

describe('nextStep and previousStep', () => {
  it('walk the steps and stop at either end', () => {
    expect(nextStep(fields, 'a')).toBe('b');
    expect(nextStep(fields, 'd')).toBeNull();
    expect(previousStep(fields, 'b')).toBe('a');
    expect(previousStep(fields, 'a')).toBeNull();
  });
});

describe('shouldAutoAdvance', () => {
  const answer = {
    type: 'single_choice',
    intent: 'pointer',
    enabled: true,
    isLast: false,
    answered: true,
  } as const;

  it('moves on after a click, tap or Enter/Space on a single choice or rating', () => {
    expect(shouldAutoAdvance(answer)).toBe(true);
    expect(shouldAutoAdvance({ ...answer, intent: 'key' })).toBe(true);
    expect(shouldAutoAdvance({ ...answer, type: 'rating' })).toBe(true);
  });

  it('waits when the answer came from arrow keys, which only move between options', () => {
    expect(shouldAutoAdvance({ ...answer, intent: 'arrow' })).toBe(false);
    expect(shouldAutoAdvance({ ...answer, type: 'dropdown', intent: 'key' })).toBe(false);
    expect(shouldAutoAdvance({ ...answer, type: 'dropdown' })).toBe(true);
  });

  it('never moves on by itself from questions with several answers, or the last step', () => {
    expect(shouldAutoAdvance({ ...answer, type: 'multi_choice' })).toBe(false);
    expect(shouldAutoAdvance({ ...answer, type: 'short_text' })).toBe(false);
    expect(shouldAutoAdvance({ ...answer, isLast: true })).toBe(false);
    expect(shouldAutoAdvance({ ...answer, enabled: false })).toBe(false);
    expect(shouldAutoAdvance({ ...answer, answered: false })).toBe(false);
  });
});

describe('stepVisibleIds', () => {
  it('gives questions and content blocks a step, not hidden fields, page breaks or dividers', () => {
    const typed = [
      { id: 'q', type: 'short_text' },
      { id: 'h', type: 'hidden' },
      { id: 'p', type: 'page_break' },
      { id: 'd', type: 'divider' },
      { id: 'i', type: 'image' },
      { id: 'x', type: 'email' },
    ] as const;
    const shown = new Set(['q', 'h', 'p', 'd', 'i']);
    expect([...stepVisibleIds(typed, shown)]).toEqual(['q', 'i']);
  });
});

describe('shouldAutoAdvance for newer question types', () => {
  const answer = {
    type: 'yes_no',
    intent: 'pointer',
    enabled: true,
    isLast: false,
    answered: true,
  } as const;

  it('moves on from one-answer scales and yes/no', () => {
    for (const type of ['yes_no', 'nps', 'opinion_scale', 'picture_choice'] as const) {
      expect(shouldAutoAdvance({ ...answer, type })).toBe(true);
    }
  });

  it('waits on picture choices that take several pictures, and on sliders', () => {
    expect(shouldAutoAdvance({ ...answer, type: 'picture_choice', multiple: true })).toBe(false);
    expect(shouldAutoAdvance({ ...answer, type: 'slider' })).toBe(false);
    expect(shouldAutoAdvance({ ...answer, type: 'matrix' })).toBe(false);
  });
});

describe('stepKey', () => {
  const key = (value: string, modifiers: Partial<KeyboardEvent> = {}) => ({
    key: value,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...modifiers,
  });
  const input = (type: string) => ({ tagName: 'INPUT', type });

  it('continues on Enter, except on buttons and in text areas', () => {
    expect(stepKey(key('Enter'), input('text'))).toBe('next');
    expect(stepKey(key('Enter'), input('radio'))).toBe('next');
    expect(stepKey(key('Enter'), { tagName: 'BUTTON' })).toBeNull();
    expect(stepKey(key('Enter'), { tagName: 'TEXTAREA' })).toBeNull();
    expect(stepKey(key('Enter', { ctrlKey: true }), { tagName: 'TEXTAREA' })).toBe('next');
    expect(stepKey(key('Enter', { metaKey: true }), { tagName: 'TEXTAREA' })).toBe('next');
    expect(stepKey(key('Enter', { shiftKey: true }), input('text'))).toBeNull();
  });

  it('moves with arrow keys where the control does not use them', () => {
    expect(stepKey(key('ArrowDown'), { tagName: 'DIV' })).toBe('next');
    expect(stepKey(key('ArrowUp'), { tagName: 'BUTTON' })).toBe('previous');
    expect(stepKey(key('ArrowDown'), input('checkbox'))).toBe('next');
    expect(stepKey(key('PageUp'), input('text'))).toBe('previous');
  });

  it('leaves arrow keys to text fields, radios and selects, unless Alt is held', () => {
    expect(stepKey(key('ArrowDown'), input('radio'))).toBeNull();
    expect(stepKey(key('ArrowUp'), input('text'))).toBeNull();
    expect(stepKey(key('ArrowDown'), { tagName: 'SELECT' })).toBeNull();
    expect(stepKey(key('ArrowDown', { altKey: true }), input('radio'))).toBe('next');
  });

  it('leaves arrow keys to sliders and time and web address boxes', () => {
    expect(stepKey(key('ArrowUp'), input('range'))).toBeNull();
    expect(stepKey(key('ArrowDown'), input('time'))).toBeNull();
    expect(stepKey(key('ArrowDown'), input('url'))).toBeNull();
  });
});
