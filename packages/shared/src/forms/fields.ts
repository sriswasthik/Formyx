import { z } from 'zod';
import { conditionMatchSchema, conditionSchema } from './conditions.js';
import type { FieldType } from './field-types.js';
import { NODE_ID_PATTERN } from './ids.js';

export const FIELD_LABEL_MAX_LENGTH = 500;
export const MAX_OPTIONS = 100;
export const MAX_CONDITIONS = 20;
export const RATING_SCALE_MIN = 3;
export const RATING_SCALE_MAX = 10;
export const FILE_MAX_SIZE_MB = 25;

export const FILE_CATEGORIES = [
  'image',
  'pdf',
  'document',
  'spreadsheet',
  'presentation',
  'audio',
  'video',
  'archive',
] as const;
export const fileCategorySchema = z.enum(FILE_CATEGORIES);
export type FileCategory = z.infer<typeof fileCategorySchema>;

const nodeIdSchema = z.string().regex(NODE_ID_PATTERN, 'Use letters, numbers, - and _ only');

export const fieldOptionSchema = z.object({
  id: nodeIdSchema,
  label: z.string().max(200, 'Use 200 characters or fewer'),
});
export type FieldOption = z.infer<typeof fieldOptionSchema>;

/**
 * Shared by every field. Labels may be empty: drafts save while they are being written,
 * and completeness is checked when a form is published.
 */
const baseField = {
  id: nodeIdSchema,
  label: z
    .string()
    .max(FIELD_LABEL_MAX_LENGTH, `Use ${FIELD_LABEL_MAX_LENGTH} characters or fewer`),
  description: z.string().max(2000, 'Use 2000 characters or fewer').optional(),
  required: z.boolean(),
  conditions: z.array(conditionSchema).max(MAX_CONDITIONS).optional(),
  conditionMatch: conditionMatchSchema.optional(),
};

const placeholder = z.string().max(200, 'Use 200 characters or fewer').optional();
const options = z.array(fieldOptionSchema).max(MAX_OPTIONS, `Use ${MAX_OPTIONS} options or fewer`);

function textValidation(limit: number) {
  const length = z.number().int().min(0).max(limit);
  return z
    .object({ minLength: length.optional(), maxLength: length.optional() })
    .refine(
      ({ minLength, maxLength }) =>
        minLength === undefined || maxLength === undefined || minLength <= maxLength,
      { message: 'Must be at least the minimum length', path: ['maxLength'] },
    );
}

const numberValidation = z
  .object({ min: z.number().optional(), max: z.number().optional() })
  .refine(({ min, max }) => min === undefined || max === undefined || min <= max, {
    message: 'Must be at least the minimum',
    path: ['max'],
  });

export const shortTextFieldSchema = z.object({
  ...baseField,
  type: z.literal('short_text'),
  placeholder,
  validation: textValidation(1000).optional(),
});

export const longTextFieldSchema = z.object({
  ...baseField,
  type: z.literal('long_text'),
  placeholder,
  validation: textValidation(10_000).optional(),
});

export const emailFieldSchema = z.object({ ...baseField, type: z.literal('email'), placeholder });

export const numberFieldSchema = z.object({
  ...baseField,
  type: z.literal('number'),
  placeholder,
  validation: numberValidation.optional(),
});

export const phoneFieldSchema = z.object({ ...baseField, type: z.literal('phone'), placeholder });

export const singleChoiceFieldSchema = z.object({
  ...baseField,
  type: z.literal('single_choice'),
  options,
});

export const multiChoiceFieldSchema = z.object({
  ...baseField,
  type: z.literal('multi_choice'),
  options,
});

export const dropdownFieldSchema = z.object({
  ...baseField,
  type: z.literal('dropdown'),
  placeholder,
  options,
});

const ratingScaleMessage = `Use a whole number from ${RATING_SCALE_MIN} to ${RATING_SCALE_MAX}`;

export const ratingFieldSchema = z.object({
  ...baseField,
  type: z.literal('rating'),
  ratingScale: z
    .number()
    .int(ratingScaleMessage)
    .min(RATING_SCALE_MIN, ratingScaleMessage)
    .max(RATING_SCALE_MAX, ratingScaleMessage),
});

export const dateFieldSchema = z.object({ ...baseField, type: z.literal('date') });

export const fileFieldSchema = z.object({
  ...baseField,
  type: z.literal('file'),
  fileConfig: z.object({
    maxSizeMb: z
      .number()
      .int()
      .min(1)
      .max(FILE_MAX_SIZE_MB, `Files can be at most ${FILE_MAX_SIZE_MB} MB`),
    allowedTypes: z
      .array(fileCategorySchema)
      .min(1, 'Allow at least one file type')
      .refine((types) => new Set(types).size === types.length, 'List each file type once'),
  }),
});

/** A block of text shown to respondents. It collects no answer, so it is never required. */
export const statementFieldSchema = z.object({
  ...baseField,
  type: z.literal('statement'),
  required: z.literal(false, 'Statements cannot be required'),
});

export const fieldSchema = z.discriminatedUnion('type', [
  shortTextFieldSchema,
  longTextFieldSchema,
  emailFieldSchema,
  numberFieldSchema,
  phoneFieldSchema,
  singleChoiceFieldSchema,
  multiChoiceFieldSchema,
  dropdownFieldSchema,
  ratingFieldSchema,
  dateFieldSchema,
  fileFieldSchema,
  statementFieldSchema,
]);

export type Field = z.infer<typeof fieldSchema>;
export type FieldOfType<T extends FieldType> = Extract<Field, { type: T }>;
export type ChoiceField = FieldOfType<'single_choice' | 'multi_choice' | 'dropdown'>;
