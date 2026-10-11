import { randomUUID } from 'node:crypto';
import {
  answerableFields,
  computeOutcome,
  endScreenLabel,
  formatAnswer,
  type AnswerValue,
  type Field,
  type FormSchema,
  type StoredOutcome,
  type WebhookAnswer,
  type WebhookOutcome,
  type WebhookPayload,
} from '@formyx/shared';
import { toStoredOutcome } from '../services/public-form-service.js';

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
function outcomeFor(
  schema: FormSchema | null,
  outcome: StoredOutcome | null,
): WebhookOutcome | null {
  if (!schema || !outcome) return null;
  return {
    endScreen: { id: outcome.endScreenId, name: endScreenLabel(schema, outcome.endScreenId) },
    variables: schema.logic.variables.flatMap((variable) => {
      const value = outcome.values[variable.id];
      return value === undefined ? [] : [{ id: variable.id, name: variable.name, value }];
    }),
    quiz: outcome.quiz,
  };
}

export function submissionPayload(
  form: FormInfo,
  submission: {
    id: string;
    createdAt: string;
    answers: Record<string, unknown>;
    outcome: StoredOutcome | null;
  },
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
      outcome: outcomeFor(form.schema, submission.outcome),
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
      return '+919876543210';
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
    case 'picture_choice':
      return field.multiple
        ? field.options[0]
          ? [field.options[0].id]
          : undefined
        : field.options[0]?.id;
    case 'ranking':
      return field.options.map((option) => option.id);
    case 'matrix': {
      const column = field.columns[0]?.id;
      return column === undefined
        ? undefined
        : Object.fromEntries(field.rows.map((row) => [row.id, field.multiple ? [column] : column]));
    }
    case 'yes_no':
      return 'yes';
    case 'nps':
      return 9;
    case 'opinion_scale':
      return field.end;
    case 'slider':
      return field.min;
    case 'currency':
      return 1500;
    case 'address':
      return { line1: '1 MG Road', pin: '560001', city: 'Bengaluru', state: 'Karnataka' };
    case 'time':
      return '09:30';
    case 'date_range':
      return { start: today, end: today };
    case 'url':
      return 'https://example.com/';
    case 'color':
      return '#2E5AAC';
    case 'consent':
      return true;
    case 'hidden':
      return 'example';
    case 'signature':
      return {
        url: 'https://example.com/signature.png',
        publicId: 'example',
        name: 'signature.png',
        size: 4_321,
        type: 'image/png',
      };
    case 'voice_note':
      return {
        url: 'https://example.com/voice-note.webm',
        publicId: 'example',
        name: 'voice-note.webm',
        size: 54_321,
        type: 'audio/webm',
      };
    case 'statement':
    case 'image':
    case 'video':
    case 'divider':
    case 'page_break':
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
    submission: {
      id: 'test',
      createdAt: now,
      answers: answersFor(form.schema, answers),
      outcome: form.schema
        ? outcomeFor(form.schema, toStoredOutcome(computeOutcome(form.schema, answers)))
        : null,
    },
  };
}
