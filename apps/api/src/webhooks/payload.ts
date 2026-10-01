import { randomUUID } from 'node:crypto';
import {
  answerableFields,
  formatAnswer,
  type AnswerValue,
  type Field,
  type FormSchema,
  type WebhookAnswer,
  type WebhookPayload,
} from '@formyx/shared';

interface FormInfo {
  id: string;
  title: string;
  /** The published questions, for labels. `null` if the form was never published. */
  schema: FormSchema | null;
}

function answersFor(schema: FormSchema | null, answers: Record<string, unknown>): WebhookAnswer[] {
  if (!schema) return [];
  return answerableFields(schema).flatMap((field) => {
    const value = answers[field.id];
    if (value === undefined || value === null) return [];
    return [
      {
        fieldId: field.id,
        label: field.label.trim() || 'Untitled question',
        type: field.type,
        value,
        text: formatAnswer(field, value),
      },
    ];
  });
}

/** The event sent when a response is saved. Each webhook gets its own event id. */
export function submissionPayload(
  form: FormInfo,
  submission: { id: string; createdAt: string; answers: Record<string, unknown> },
): WebhookPayload {
  return {
    id: randomUUID(),
    event: 'submission.created',
    createdAt: new Date().toISOString(),
    form: { id: form.id, title: form.title },
    submission: {
      id: submission.id,
      createdAt: submission.createdAt,
      answers: answersFor(form.schema, submission.answers),
    },
  };
}

/** A made-up answer to `field`, of the right shape, for test events. */
function sampleAnswer(field: Field, today: string): AnswerValue | undefined {
  switch (field.type) {
    case 'short_text':
    case 'long_text':
      return 'Example answer';
    case 'email':
      return 'someone@example.com';
    case 'phone':
      return '+44 20 7946 0000';
    case 'number':
      return 42;
    case 'date':
      return today;
    case 'rating':
      return field.ratingScale;
    case 'single_choice':
    case 'dropdown':
      return field.options[0]?.id;
    case 'multi_choice':
      return field.options[0] ? [field.options[0].id] : undefined;
    case 'file':
      return {
        url: 'https://example.com/example.pdf',
        publicId: 'example',
        name: 'example.pdf',
        size: 12_345,
        type: 'application/pdf',
      };
    case 'statement':
      return undefined;
  }
}

/** "Send test event": shaped like a real response, with example answers to each question. */
export function testPayload(form: FormInfo): WebhookPayload {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const answers = Object.fromEntries(
    (form.schema ? answerableFields(form.schema) : []).flatMap((field) => {
      const value = sampleAnswer(field, today);
      return value === undefined ? [] : [[field.id, value]];
    }),
  );
  return {
    id: randomUUID(),
    event: 'test',
    createdAt: now,
    form: { id: form.id, title: form.title },
    submission: { id: 'test', createdAt: now, answers: answersFor(form.schema, answers) },
  };
}
