import { createEmptyForm, createField, createOption, type SubmissionRecord } from '@formyx/shared';
import { describe, expect, it } from 'vitest';
import { EMAIL_ANSWER_LIMIT, escapeHtml, renderSubmissionEmail } from './submission-email.js';

const yes = createOption('Yes');
const choice = { ...createField('single_choice'), label: 'Coming?', options: [yes] };
const stars = { ...createField('rating'), label: 'Rating', ratingScale: 5 };
const note = { ...createField('long_text'), label: 'Note <i>' };

function submission(answers: SubmissionRecord['answers']): SubmissionRecord {
  return {
    id: 'sub_1',
    createdAt: '2026-10-01T09:30:00.000Z',
    completionTimeMs: null,
    answers,
    metadata: { userAgent: null, referrer: null },
    outcome: null,
  };
}

const urls = {
  responseUrl: 'https://formyx.app/app/forms/f1/responses?tab=responses&response=sub_1',
  settingsUrl: 'https://formyx.app/app/forms/f1/responses',
  appUrl: 'https://formyx.app',
};

describe('renderSubmissionEmail', () => {
  const schema = { ...createEmptyForm(), fields: [choice, stars, note] };

  it('lists answers the way people read them', () => {
    const email = renderSubmissionEmail({
      formTitle: 'Party',
      schema,
      submission: submission({ [choice.id]: yes.id, [stars.id]: 4, [note.id]: 'Bringing cake' }),
      ...urls,
    });

    expect(email.subject).toBe('New response to Party');
    expect(email.text).toContain('Submitted 1 Oct 2026, 09:30 UTC');
    expect(email.text).toContain('Coming?\nYes');
    expect(email.text).toContain('Rating\n4 / 5');
    expect(email.text).toContain(`View the response: ${urls.responseUrl}`);
    expect(email.html).toContain(`href="${escapeHtml(urls.responseUrl)}"`);
  });

  it('escapes everything people typed', () => {
    const email = renderSubmissionEmail({
      formTitle: '<script>alert(1)</script>',
      schema,
      submission: submission({ [note.id]: '"><img src=x onerror=alert(1)>' }),
      ...urls,
    });

    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<img src=x');
    expect(email.html).not.toContain('<i>');
    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(email.html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
  });

  it('keeps line breaks out of the subject', () => {
    const email = renderSubmissionEmail({
      formTitle: 'Party\r\nBcc: someone@example.com',
      schema,
      submission: submission({}),
      ...urls,
    });
    expect(email.subject).toBe('New response to Party Bcc: someone@example.com');
  });

  it(`shows the first ${EMAIL_ANSWER_LIMIT} answers and says how many more there are`, () => {
    const fields = Array.from({ length: EMAIL_ANSWER_LIMIT + 2 }, (_, index) => ({
      ...createField('short_text'),
      label: `Question ${index + 1}`,
    }));
    const answers = Object.fromEntries(
      fields.map((field, index) => [field.id, `Answer ${index + 1}`]),
    );

    const email = renderSubmissionEmail({
      formTitle: 'Long form',
      schema: { ...createEmptyForm(), fields },
      submission: submission(answers),
      ...urls,
    });

    expect(email.text).toContain(`Answer ${EMAIL_ANSWER_LIMIT}`);
    expect(email.text).not.toContain(`Answer ${EMAIL_ANSWER_LIMIT + 1}`);
    expect(email.text).toContain('…and 2 more answers.');
  });
});
