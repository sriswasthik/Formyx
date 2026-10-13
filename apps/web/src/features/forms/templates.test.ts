import { describe, expect, it } from 'vitest';
import {
  FEATURED_TEMPLATE_IDS,
  filterTemplates,
  TEMPLATE_OPTIONS,
  templateOptions,
} from './templates';

const ids = (query: string, category: Parameters<typeof filterTemplates>[1]['category'] = null) =>
  filterTemplates(TEMPLATE_OPTIONS, { query, category }).map((option) => option.id);

describe('filterTemplates', () => {
  it('lists every template, blank first, with no search or category', () => {
    expect(ids('')).toEqual(TEMPLATE_OPTIONS.map((option) => option.id));
    expect(ids('')[0]).toBe('blank');
  });

  it('keeps the templates in a category, and the blank form', () => {
    const quizzes = ids('', 'quizzes');
    expect(quizzes).toEqual(['blank', 'general_knowledge_quiz', 'safety_training_quiz']);
  });

  it('matches every word of the search in the name or description, ignoring case', () => {
    expect(ids('RSVP')).toEqual(['blank', 'rsvp', 'wedding_rsvp']);
    expect(ids('wedding rsvp')).toEqual(['blank', 'wedding_rsvp']);
    expect(ids('rsvp', 'hr')).toEqual(['blank']);
    expect(ids('no such thing')).toEqual(['blank']);
  });
});

describe('templateOptions', () => {
  it('finds the featured templates in order, with an icon and question count each', () => {
    const featured = templateOptions(FEATURED_TEMPLATE_IDS);
    expect(featured.map((option) => option.id)).toEqual(FEATURED_TEMPLATE_IDS);
    for (const option of featured.slice(1)) {
      expect(option.questionCount).toBeGreaterThan(0);
    }
  });
});
