import { z } from 'zod';
import type { ValidationIssue } from '../errors.js';
import { evaluateVisibility, type AnswerValue, type Answers } from './answers.js';
import { MAX_OPTIONS, type Field } from './fields.js';
import { MAX_FIELDS, type FormSchema } from './form-schema.js';
import { NODE_ID_PATTERN } from './ids.js';

const REQUIRED = 'This question is required';

/** Longest answers accepted when a question sets no maximum of its own. */
export const ANSWER_MAX_LENGTH = { short_text: 1000, long_text: 10_000 } as const;

const EMAIL_MAX_LENGTH = 254;
const FILE_NAME_MAX_LENGTH = 255;
const PHONE_PATTERN = /^\+?[\d\s().-]{5,25}$/;
const DECIMAL_PATTERN = /^[-+]?(\d+(\.\d*)?|\.\d+)(e[-+]?\d+)?$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function textSchema(field: Extract<Field, { type: 'short_text' | 'long_text' }>) {
  const { minLength, maxLength = ANSWER_MAX_LENGTH[field.type] } = field.validation ?? {};
  const text = z
    .string({ error: 'Enter text' })
    .trim()
    .max(maxLength, `Use ${plural(maxLength, 'character')} or fewer`);
  return minLength === undefined
    ? text
    : text.min(minLength, `Use at least ${plural(minLength, 'character')}`);
}

function numberSchema(field: Extract<Field, { type: 'number' }>) {
  const message = 'Enter a number';
  const { min, max } = field.validation ?? {};
  let number = z.number({ error: message });
  if (min !== undefined) number = number.min(min, `Enter a number of at least ${min}`);
  if (max !== undefined) number = number.max(max, `Enter a number of at most ${max}`);
  // Number inputs hand over text; "12.5" becomes 12.5, while "12abc" or "0x10" are refused.
  return z
    .union([z.number(), z.string().trim().regex(DECIMAL_PATTERN, message)], { error: message })
    .transform(Number)
    .pipe(number);
}

function optionIds(field: Extract<Field, { options: unknown }>): Set<string> {
  return new Set(field.options.map((option) => option.id));
}

/** What a present (non-empty) answer to `field` must look like, or `null` if it takes none. */
function answerValueSchema(field: Field): z.ZodType<Exclude<AnswerValue, null>> | null {
  switch (field.type) {
    case 'short_text':
    case 'long_text':
      return textSchema(field);
    case 'email': {
      const message = 'Enter a valid email address';
      return z
        .string({ error: message })
        .trim()
        .max(EMAIL_MAX_LENGTH, message)
        .pipe(z.email({ error: message }));
    }
    case 'phone': {
      const message = 'Enter a valid phone number';
      return z
        .string({ error: message })
        .trim()
        .regex(PHONE_PATTERN, message)
        .refine((value) => value.replace(/\D/g, '').length >= 5, message);
    }
    case 'number':
      return numberSchema(field);
    case 'rating': {
      const message = `Pick a rating from 1 to ${field.ratingScale}`;
      return z
        .number({ error: message })
        .int(message)
        .min(1, message)
        .max(field.ratingScale, message);
    }
    case 'date': {
      const message = 'Enter a valid date';
      return z.string({ error: message }).refine(isCalendarDate, message);
    }
    case 'single_choice':
    case 'dropdown': {
      const ids = optionIds(field);
      const message = 'Choose an option';
      return z.string({ error: message }).refine((id) => ids.has(id), message);
    }
    case 'multi_choice': {
      const ids = optionIds(field);
      const message = 'Choose from the options';
      return z
        .array(z.string(), { error: message })
        .refine((chosen) => chosen.every((id) => ids.has(id)), message)
        .transform((chosen) => [...new Set(chosen)]);
    }
    case 'file':
      // Uploads arrive in a later sprint. Until then the answer is the chosen file's name.
      return z.string({ error: 'Choose a file' }).trim().max(FILE_NAME_MAX_LENGTH);
    case 'statement':
      return null;
  }
}

/** Blank text, an empty selection and `null` all mean "not answered". */
function emptyToUndefined(value: unknown): unknown {
  if (value === null) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  if (Array.isArray(value) && value.length === 0) return undefined;
  return value;
}

const present = z.custom<unknown>((value) => value !== undefined, REQUIRED);

/** The schema for one question's answer, including whether it may be left empty. */
function answerSchema(field: Field) {
  const value = answerValueSchema(field);
  if (!value) return null;
  return z.preprocess(emptyToUndefined, field.required ? present.pipe(value) : value.optional());
}

/** Answers after validation: trimmed, numbers as numbers, and nothing left empty. */
export type SubmittedAnswers = Record<string, Exclude<AnswerValue, null>>;

function withoutEmpty(answers: Record<string, unknown>): SubmittedAnswers {
  return Object.fromEntries(
    Object.entries(answers).filter(([, value]) => value !== undefined),
  ) as SubmittedAnswers;
}

/**
 * A Zod schema for the answers to `schema`, built for the questions visible with `answers`.
 * Hidden questions are skipped, so their required flag does not apply, and answers to them,
 * to unknown questions or to statements are stripped. Parsing returns the normalised answers.
 */
export function buildSubmissionValidator(
  schema: FormSchema,
  answers: Answers,
): z.ZodType<SubmittedAnswers> {
  const visible = evaluateVisibility(schema, answers);
  const shape: Record<string, z.ZodType> = {};
  for (const field of schema.fields) {
    const fieldSchema = visible.has(field.id) ? answerSchema(field) : null;
    if (fieldSchema) shape[field.id] = fieldSchema;
  }
  return z.object(shape).transform(withoutEmpty);
}

/** The problem with one answer, or `null` if it is fine. Assumes the question is visible. */
export function validateAnswer(field: Field, value: AnswerValue | undefined): string | null {
  const result = answerSchema(field)?.safeParse(value);
  return result && !result.success ? (result.error.issues[0]?.message ?? REQUIRED) : null;
}

/** The first problem with each answer, keyed by field id. Empty when everything is fine. */
export function validateAnswers(schema: FormSchema, answers: Answers): Record<string, string> {
  const result = buildSubmissionValidator(schema, answers).safeParse(answers);
  if (result.success) return {};

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const fieldId = issue.path[0];
    if (typeof fieldId === 'string' && !(fieldId in errors)) errors[fieldId] = issue.message;
  }
  return errors;
}

/** Name of the honeypot input. People never see it, so only bots fill it in. */
export const HONEYPOT_FIELD = 'website';

/** Time spent on a form, capped so a tab left open for days does not skew averages. */
export const MAX_COMPLETION_TIME_MS = 24 * 60 * 60 * 1000;

const answerValueInput = z.union([
  z.string().max(ANSWER_MAX_LENGTH.long_text * 2),
  z.number(),
  z.array(z.string().max(64)).max(MAX_OPTIONS),
  z.null(),
]);

/** Body of `POST /api/public/forms/:slug/submissions`. Answers are checked separately. */
export const submissionInputSchema = z.object({
  answers: z
    .record(z.string().regex(NODE_ID_PATTERN), answerValueInput)
    .refine((answers) => Object.keys(answers).length <= MAX_FIELDS, 'Too many answers'),
  completionTimeMs: z
    .number()
    .int()
    .min(0)
    .transform((value) => Math.min(value, MAX_COMPLETION_TIME_MS))
    .optional(),
  referrer: z
    .string()
    .max(4096)
    .transform((value) => value.slice(0, 2048))
    .optional(),
  [HONEYPOT_FIELD]: z.string().max(1000).optional(),
});
export type SubmissionInput = z.input<typeof submissionInputSchema>;

export const submissionResponseSchema = z.object({ id: z.string() });
export type SubmissionResponse = z.infer<typeof submissionResponseSchema>;

/** Where answer problems appear in a rejected submission's issues: `answers.<fieldId>`. */
const ANSWERS_PATH_PREFIX = 'answers.';

/** Validation issues for `answers.<fieldId>`, as the field id → message map forms show. */
export function answerErrorsFromIssues(issues: readonly ValidationIssue[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const { path, message } of issues) {
    if (!path.startsWith(ANSWERS_PATH_PREFIX)) continue;
    const fieldId = path.slice(ANSWERS_PATH_PREFIX.length).split('.')[0];
    if (fieldId && !(fieldId in errors)) errors[fieldId] = message;
  }
  return errors;
}

/** Issues for a submission whose answers failed `buildSubmissionValidator`. */
export function toAnswerIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: [ANSWERS_PATH_PREFIX.slice(0, -1), ...issue.path.map(String)].join('.'),
    message: issue.message,
  }));
}
