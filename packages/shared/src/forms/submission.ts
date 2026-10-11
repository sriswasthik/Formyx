import { z } from 'zod';
import type { ValidationIssue } from '../errors.js';
import {
  normalizeHexColor,
  normalizeWebsiteUrl,
  PIN_CODE_PATTERN,
  TIME_PATTERN,
} from './answer-values.js';
import { resolvePath } from '../logic/navigation.js';
import { submissionOutcomeSchema } from './outcome-schema.js';
import { isAnswered, type AnswerValue, type Answers } from './answers.js';
import { MAX_MATRIX_ROWS, MAX_OPTIONS, type Field, type FieldOfType } from './fields.js';
import {
  fileAnswerSchema,
  isFileAnswer,
  uploadProblem,
  uploadRules,
  type FileAnswer,
} from './files.js';
import { compactPhone, phoneNumberProblem } from './phone.js';
import { MAX_FIELDS } from './form-schema-shape.js';
import type { FormSchema } from './form-schema.js';
import { NODE_ID_PATTERN } from './ids.js';

const REQUIRED = 'This question is required';

/** Longest answers accepted when a question sets no maximum of its own. */
export const ANSWER_MAX_LENGTH = { short_text: 1000, long_text: 10_000 } as const;

const EMAIL_MAX_LENGTH = 254;
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

/** The longest value a hidden field keeps from the link. */
export const HIDDEN_VALUE_MAX_LENGTH = 500;
/** Amounts are money: at most two decimal places. */
const CENTS = /^-?\d+(\.\d{1,2})?$/;

function integerIn(min: number, max: number, message: string) {
  return z.number({ error: message }).int(message).min(min, message).max(max, message);
}

function sliderSchema(field: FieldOfType<'slider'>) {
  const message = `Pick a value from ${field.min} to ${field.max}`;
  return z
    .number({ error: message })
    .min(field.min, message)
    .max(field.max, message)
    .refine((value) => {
      // Within floating-point noise of a step from the minimum.
      const steps = (value - field.min) / field.step;
      return Math.abs(steps - Math.round(steps)) < 1e-6;
    }, `Pick a value in steps of ${field.step}`);
}

function currencySchema(field: FieldOfType<'currency'>) {
  const message = 'Enter an amount';
  const { min, max } = field.validation ?? {};
  let amount = z
    .number({ error: message })
    .refine((value) => CENTS.test(String(value)), 'Use at most two decimal places');
  if (min !== undefined) amount = amount.refine((value) => value >= min, `Enter at least ${min}`);
  if (max !== undefined) amount = amount.refine((value) => value <= max, `Enter at most ${max}`);
  // Typed amounts arrive as text, perhaps with grouping commas: "1,25,000.50".
  return z
    .union([z.number(), z.string().trim()], { error: message })
    .transform((value, ctx) => {
      if (typeof value === 'number') return value;
      const text = value.replace(/,/g, '');
      if (!DECIMAL_PATTERN.test(text)) {
        ctx.addIssue({ code: 'custom', message });
        return z.NEVER;
      }
      return Number(text);
    })
    .pipe(amount);
}

function rankingSchema(field: FieldOfType<'ranking'>) {
  const ids = optionIds(field);
  const message = 'Put every option in order';
  return z
    .array(z.string(), { error: message })
    .refine(
      (order) =>
        order.length === ids.size &&
        new Set(order).size === order.length &&
        order.every((id) => ids.has(id)),
      message,
    );
}

function matrixSchema(field: FieldOfType<'matrix'>) {
  const rows = new Set(field.rows.map((row) => row.id));
  const columns = new Set(field.columns.map((column) => column.id));
  const message = 'Choose from the columns';
  const fits = (picked: string | string[]) =>
    field.multiple
      ? Array.isArray(picked) && picked.every((id) => columns.has(id))
      : typeof picked === 'string' && columns.has(picked);
  return z
    .record(z.string(), z.union([z.string(), z.array(z.string())]), { error: 'Answer each row' })
    .transform((answer) =>
      // Rows left empty are not answers; several picks lose their duplicates.
      Object.fromEntries(
        Object.entries(answer)
          .filter(([, picked]) => (Array.isArray(picked) ? picked.length > 0 : picked !== ''))
          .map(([rowId, picked]) => [rowId, Array.isArray(picked) ? [...new Set(picked)] : picked]),
      ),
    )
    .superRefine((answer, ctx) => {
      for (const [rowId, picked] of Object.entries(answer)) {
        if (!rows.has(rowId)) {
          ctx.addIssue({ code: 'custom', message: 'Answer the rows shown' });
          return;
        }
        if (!fits(picked)) {
          ctx.addIssue({ code: 'custom', message });
          return;
        }
      }
      if (field.required && field.rows.some((row) => !(row.id in answer))) {
        ctx.addIssue({ code: 'custom', message: 'Answer every row' });
      }
    });
}

const addressText = (message: string, max: number) =>
  z.string({ error: message }).trim().min(1, message).max(max, `Use ${max} characters or fewer`);

const addressSchema = z
  .object(
    {
      line1: addressText('Enter the first line of the address', 200),
      line2: z.string().trim().max(200, 'Use 200 characters or fewer').optional(),
      pin: z.string().trim().regex(PIN_CODE_PATTERN, 'Enter a 6-digit PIN code'),
      city: addressText('Enter the city', 100),
      state: addressText('Enter the state', 100),
    },
    { error: 'Enter the address' },
  )
  .transform(({ line2, ...rest }) => (line2 ? { ...rest, line2 } : rest));

const dateRangeSchema = z
  .object(
    {
      start: z.string().refine(isCalendarDate, 'Enter a valid start date'),
      end: z.string().refine(isCalendarDate, 'Enter a valid end date'),
    },
    { error: 'Enter the dates' },
  )
  .refine(({ start, end }) => end >= start, 'End on or after the start date');

/**
 * An upload: storage checks the file itself on the server; this checks what the browser
 * says about it against the question's limits.
 */
function uploadSchema(field: FieldOfType<'file' | 'signature' | 'voice_note'>) {
  const rules = uploadRules(field);
  return z.custom<FileAnswer>(isFileAnswer, 'Upload the file again').superRefine((file, ctx) => {
    const problem = rules && uploadProblem(file, rules);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });
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
    case 'phone':
      // Stored in E.164 form: "+91 98765-43210" becomes "+919876543210".
      return z
        .string({ error: 'Enter a valid phone number' })
        .transform(compactPhone)
        .superRefine((phone, ctx) => {
          const problem = phoneNumberProblem(phone);
          if (problem) ctx.addIssue({ code: 'custom', message: problem });
        });
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
    case 'signature':
    case 'voice_note':
      return uploadSchema(field);
    case 'picture_choice': {
      const ids = optionIds(field);
      if (!field.multiple) {
        const message = 'Choose a picture';
        return z.string({ error: message }).refine((id) => ids.has(id), message);
      }
      const message = 'Choose from the pictures';
      return z
        .array(z.string(), { error: message })
        .refine((chosen) => chosen.every((id) => ids.has(id)), message)
        .transform((chosen) => [...new Set(chosen)]);
    }
    case 'yes_no':
      return z.enum(['yes', 'no'], { error: 'Choose yes or no' });
    case 'nps':
      return integerIn(0, 10, 'Pick a score from 0 to 10');
    case 'opinion_scale':
      return integerIn(field.start, field.end, `Pick a value from ${field.start} to ${field.end}`);
    case 'slider':
      return sliderSchema(field);
    case 'currency':
      return currencySchema(field);
    case 'ranking':
      return rankingSchema(field);
    case 'matrix':
      return matrixSchema(field);
    case 'address':
      return addressSchema;
    case 'time': {
      const message = 'Enter a valid time';
      return z.string({ error: message }).regex(TIME_PATTERN, message);
    }
    case 'date_range':
      return dateRangeSchema;
    case 'url': {
      const message = 'Enter a website address, such as example.com';
      return z.string({ error: message }).transform((value, ctx) => {
        const url = normalizeWebsiteUrl(value);
        if (url === null || url.length > 2048) {
          ctx.addIssue({ code: 'custom', message });
          return z.NEVER;
        }
        return url;
      });
    }
    case 'color': {
      const message = 'Pick a colour';
      return z.string({ error: message }).transform((value, ctx) => {
        const color = normalizeHexColor(value);
        if (color === null) {
          ctx.addIssue({ code: 'custom', message });
          return z.NEVER;
        }
        return color;
      });
    }
    case 'consent':
      return z.literal(true, 'Tick the box to agree');
    case 'hidden':
      // Whatever the link carried, kept short.
      return z
        .string({ error: 'Not a valid value' })
        .trim()
        .max(HIDDEN_VALUE_MAX_LENGTH, `Use ${HIDDEN_VALUE_MAX_LENGTH} characters or fewer`);
    case 'statement':
    case 'image':
    case 'video':
    case 'divider':
    case 'page_break':
      return null;
  }
}

/**
 * Blank text, an empty selection, an unticked box, an address or date range left blank, a
 * matrix with no row answered and `null` all mean "not answered".
 */
function emptyToUndefined(value: unknown): unknown {
  if (value === null || value === false) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  if (Array.isArray(value) && value.length === 0) return undefined;
  if (typeof value === 'object' && !isFileAnswer(value) && !isAnswered(value as AnswerValue)) {
    return undefined;
  }
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
 * A Zod schema for the answers to `schema`, built for the questions the respondent saw:
 * shown by their conditions, on a page on their route (see `resolvePath`). Other questions
 * are skipped, so their required flag does not apply, and answers to them, to unknown
 * questions or to statements are stripped. Parsing returns the normalised answers.
 */
export function buildSubmissionValidator(
  schema: FormSchema,
  answers: Answers,
): z.ZodType<SubmittedAnswers> {
  const { active } = resolvePath(schema, answers);
  const shape: Record<string, z.ZodType> = {};
  for (const field of schema.fields) {
    const fieldSchema = active.has(field.id) ? answerSchema(field) : null;
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

const shortText = z.string().max(500);
const optionList = z.array(z.string().max(64)).max(MAX_OPTIONS);

/** The shape of any answer, before it is checked against its question. */
const answerValueInput = z.union([
  fileAnswerSchema,
  z.string().max(ANSWER_MAX_LENGTH.long_text * 2),
  z.number(),
  z.boolean(),
  optionList,
  // An address.
  z.object({
    line1: shortText,
    line2: shortText.optional(),
    pin: shortText,
    city: shortText,
    state: shortText,
  }),
  // A date range.
  z.object({ start: shortText, end: shortText }),
  // A matrix: rows to the columns picked in them.
  z
    .record(z.string().max(64), z.union([z.string().max(64), optionList]))
    .refine((rows) => Object.keys(rows).length <= MAX_MATRIX_ROWS, 'Too many rows'),
  z.null(),
]);

/** Answers keyed by field id, in any shape an answer can take; checked separately. */
export const submissionAnswersSchema = z
  .record(z.string().regex(NODE_ID_PATTERN), answerValueInput)
  .refine((answers) => Object.keys(answers).length <= MAX_FIELDS, 'Too many answers');

/**
 * Body of `POST /api/public/forms/:slug/submissions`. Answers are checked separately; the
 * route, values, quiz score and end screen are always worked out again on the server.
 */
export const submissionInputSchema = z.object({
  answers: submissionAnswersSchema,
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
  /** The visit's token (see `viewResponseSchema`), marking it finished for drop-off. */
  viewToken: z.string().max(64).optional(),
  /** The saved draft this response finishes, which is then deleted. */
  resumeToken: z.string().max(64).optional(),
});
export type SubmissionInput = z.input<typeof submissionInputSchema>;

export const submissionResponseSchema = z.object({
  id: z.string(),
  outcome: submissionOutcomeSchema,
});
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
