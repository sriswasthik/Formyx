import { describe, expect, it } from 'vitest';
import { questionCountLabel, responseCountLabel } from './format';

describe('count labels', () => {
  it.each([
    [0, 'No responses', 'No questions'],
    [1, '1 response', '1 question'],
    [12, '12 responses', '12 questions'],
  ])('%i', (count, responses, questions) => {
    expect(responseCountLabel(count)).toBe(responses);
    expect(questionCountLabel(count)).toBe(questions);
  });

  it('groups large numbers', () => {
    expect(responseCountLabel(12_345)).toBe(`${new Intl.NumberFormat().format(12_345)} responses`);
  });
});
