import {
  accentHasEnoughContrast,
  buildSubmissionValidator,
  findPublishIssues,
  formSchema,
  formThemeSchema,
} from '@formyx/shared';
import { describe, expect, it } from 'vitest';
import { buildDemoContent, DEMO_DAYS } from './demo-content.js';

const NOW = new Date('2026-10-01T14:30:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

describe('buildDemoContent', () => {
  const forms = buildDemoContent(NOW);

  it('makes three complete, publishable forms with readable themes', () => {
    expect(forms.map((form) => form.title)).toEqual([
      'Product feedback',
      'Design Systems Day registration',
      'Product designer application',
    ]);
    for (const form of forms) {
      expect(() => formSchema.parse(form.schema)).not.toThrow();
      expect(findPublishIssues(form.schema)).toEqual([]);
      expect(accentHasEnoughContrast(formThemeSchema.parse(form.theme))).toBe(true);
    }
  });

  it('spreads about 150 responses over the last 30 days, none in the future', () => {
    const submissions = forms.flatMap((form) => form.submissions);
    expect(submissions).toHaveLength(150);

    const oldest = NOW.getTime() - DEMO_DAYS * DAY_MS;
    for (const { createdAt } of submissions) {
      expect(createdAt.getTime()).toBeGreaterThan(oldest);
      expect(createdAt.getTime()).toBeLessThan(NOW.getTime());
    }
  });

  it('only holds answers a real respondent could have sent', () => {
    for (const form of forms) {
      for (const { answers } of form.submissions) {
        expect(buildSubmissionValidator(form.schema, answers).parse(answers)).toEqual(answers);
      }
    }
  });

  it('follows the forms’ logic: follow-up questions only when they would be shown', () => {
    const feedback = forms[0];
    if (!feedback) throw new Error('Expected the feedback form');
    const [satisfaction, , , improve] = feedback.schema.fields;
    if (!satisfaction || !improve) throw new Error('Expected the feedback questions');

    const improvements = feedback.submissions.filter(({ answers }) => improve.id in answers);
    expect(improvements.length).toBeGreaterThan(0);
    for (const { answers } of improvements) {
      expect(answers[satisfaction.id]).toBeLessThan(4);
    }
  });

  it('is busier on weekdays than at weekends', () => {
    const perDay = { weekday: 0, weekend: 0 };
    for (const { createdAt } of forms.flatMap((form) => form.submissions)) {
      const day = createdAt.getUTCDay();
      if (day === 0 || day === 6) perDay.weekend += 1;
      else perDay.weekday += 1;
    }
    // Five weekdays to two weekend days: compare the average day of each.
    expect(perDay.weekday / 5).toBeGreaterThan((perDay.weekend / 2) * 1.5);
  });

  it('records more visits than responses, one before each response', () => {
    for (const form of forms) {
      expect(form.views.length).toBeGreaterThan(form.submissions.length);
      const first = form.submissions[0];
      const firstView = form.views[0];
      if (!first || !firstView) throw new Error('Expected responses and views');
      expect(firstView.getTime()).toBeLessThan(first.createdAt.getTime());
    }
  });

  it('is the same data on every reset, shifted to end at the time it runs', () => {
    const later = new Date(NOW.getTime() + 7 * DAY_MS);
    const again = buildDemoContent(later);

    const times = (content: typeof forms, shift = 0) =>
      content.flatMap((form) =>
        form.submissions.map(({ createdAt, completionTimeMs }) => [
          createdAt.getTime() - shift,
          completionTimeMs,
        ]),
      );
    expect(times(again, 7 * DAY_MS)).toEqual(times(forms));
  });
});
