import {
  answerableFields,
  buildSubmissionValidator,
  createEmptyForm,
  createField,
  FIELD_TYPES,
  type AnswerValue,
  type FormSchema,
} from '@formyx/shared';
import { describe, expect, it } from 'vitest';
import { submissionPayload, testPayload } from './payload.js';

const everyType: FormSchema = {
  ...createEmptyForm(),
  fields: FIELD_TYPES.map((type) => ({ ...createField(type), label: `A ${type} question` })),
};

describe('testPayload', () => {
  it('answers every question with an example that would pass the form’s own checks', () => {
    const payload = testPayload({ id: 'form_1', title: 'Everything', schema: everyType });

    expect(payload.event).toBe('test');
    expect(payload.submission.answers.map(({ type }) => type)).toEqual(
      answerableFields(everyType).map(({ type }) => type),
    );
    // Receivers get values as plain JSON; here they go back through the form's checks.
    const answers = Object.fromEntries(
      payload.submission.answers.map(({ fieldId, value }) => [fieldId, value as AnswerValue]),
    );
    expect(buildSubmissionValidator(everyType, answers).safeParse(answers).success).toBe(true);
    for (const answer of payload.submission.answers) expect(answer.text).not.toBe('');
  });

  it('still works for a form without questions', () => {
    expect(testPayload({ id: 'form_1', title: 'Empty', schema: null }).submission.answers).toEqual(
      [],
    );
  });
});

describe('submissionPayload', () => {
  it('lists the answers given, in question order, leaving out unanswered ones', () => {
    const [first, second] = everyType.fields;
    if (!first || !second) throw new Error('Expected questions');

    const payload = submissionPayload(
      { id: 'form_1', title: 'Survey', schema: everyType },
      {
        id: 'sub_1',
        createdAt: '2026-10-01T10:00:00.000Z',
        answers: { [second.id]: 'Second', [first.id]: 'First', unknown: 'ignored' },
      },
    );

    expect(payload.submission.answers.map(({ fieldId, text }) => [fieldId, text])).toEqual([
      [first.id, 'First'],
      [second.id, 'Second'],
    ]);
    // Each webhook gets its own event id.
    expect(
      submissionPayload(
        { id: 'form_1', title: 'Survey', schema: everyType },
        { id: 'sub_1', createdAt: '2026-10-01T10:00:00.000Z', answers: {} },
      ).id,
    ).not.toBe(payload.id);
  });
});
