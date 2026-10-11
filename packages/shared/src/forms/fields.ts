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

/**
 * A block of text shown to respondents, its `label` written in the rich-text subset (see
 * `rich-text.ts`). It collects no answer, so it is never required.
 */
export const statementFieldSchema = z.object({
  ...baseField,
  type: z.literal('statement'),
  required: z.literal(false, 'Statements cannot be required'),
});

/** Blocks that collect nothing are never required. */
const notRequired = z.literal(false, 'Only questions can be required');
const shortLabel = z.string().max(80, 'Use 80 characters or fewer');
const imageUrl = z.url({ protocol: /^https$/, error: 'Use an https:// link' }).max(2048);

export const RATING_STYLES = ['numbers', 'stars', 'hearts', 'faces'] as const;
export const ratingStyleSchema = z.enum(RATING_STYLES);
export type RatingStyle = z.infer<typeof ratingStyleSchema>;

export const ratingFieldWithStyleSchema = ratingFieldSchema.extend({
  /** How the scale is drawn. Faces only suit scales of 3 or 5; other scales show numbers. */
  ratingStyle: ratingStyleSchema,
});

/** ISO 3166-1 alpha-2, such as IN. */
const countryCode = z.string().regex(/^[A-Z]{2}$/, 'Use a two-letter country code');

export const phoneFieldWithCountrySchema = phoneFieldSchema.extend({
  /** The country the picker starts on. */
  defaultCountry: countryCode,
});

export const pictureOptionSchema = fieldOptionSchema.extend({
  /** The picture; required to publish. Its label doubles as its text alternative. */
  imageUrl: imageUrl.optional(),
});
export type PictureOption = z.infer<typeof pictureOptionSchema>;

export const pictureChoiceFieldSchema = z.object({
  ...baseField,
  type: z.literal('picture_choice'),
  options: z.array(pictureOptionSchema).max(MAX_OPTIONS, `Use ${MAX_OPTIONS} options or fewer`),
  /** Several pictures may be picked. */
  multiple: z.boolean(),
});

export const yesNoFieldSchema = z.object({ ...baseField, type: z.literal('yes_no') });

export const npsFieldSchema = z.object({
  ...baseField,
  type: z.literal('nps'),
  /** Under 0 and 10. */
  lowLabel: shortLabel,
  highLabel: shortLabel,
});

export const OPINION_SCALE_MAX = 10;

export const opinionScaleFieldSchema = z.object({
  ...baseField,
  type: z.literal('opinion_scale'),
  start: z.union([z.literal(0), z.literal(1)]),
  end: z.number().int().min(2).max(OPINION_SCALE_MAX),
  lowLabel: shortLabel,
  middleLabel: shortLabel,
  highLabel: shortLabel,
});

export const sliderFieldSchema = z.object({
  ...baseField,
  type: z.literal('slider'),
  min: z.number().min(-1_000_000).max(1_000_000),
  max: z.number().min(-1_000_000).max(1_000_000),
  step: z.number().positive('Use a step above 0').max(1_000_000),
  /** Shown after the value, such as "kg" or "%". */
  unit: z.string().max(12, 'Use 12 characters or fewer'),
});

export const MIN_RANKING_OPTIONS = 2;

export const rankingFieldSchema = z.object({ ...baseField, type: z.literal('ranking'), options });

export const MAX_MATRIX_ROWS = 30;
export const MAX_MATRIX_COLUMNS = 12;

export const matrixFieldSchema = z.object({
  ...baseField,
  type: z.literal('matrix'),
  /** The statements down the side, each answered on its own. */
  rows: z.array(fieldOptionSchema).max(MAX_MATRIX_ROWS, `Use ${MAX_MATRIX_ROWS} rows or fewer`),
  /** The answers across the top. */
  columns: z
    .array(fieldOptionSchema)
    .max(MAX_MATRIX_COLUMNS, `Use ${MAX_MATRIX_COLUMNS} columns or fewer`),
  /** Several answers per row. */
  multiple: z.boolean(),
});

/** An Indian postal address; the PIN code fills in city and state. */
export const addressFieldSchema = z.object({ ...baseField, type: z.literal('address') });

export const timeFieldSchema = z.object({ ...baseField, type: z.literal('time') });

export const dateRangeFieldSchema = z.object({ ...baseField, type: z.literal('date_range') });

export const urlFieldSchema = z.object({ ...baseField, type: z.literal('url'), placeholder });

export const currencyFieldSchema = z.object({
  ...baseField,
  type: z.literal('currency'),
  /** ISO 4217, such as INR. */
  currency: z.string().regex(/^[A-Z]{3}$/, 'Use a three-letter currency code'),
  validation: numberValidation.optional(),
});

export const signatureFieldSchema = z.object({ ...baseField, type: z.literal('signature') });

export const colorFieldSchema = z.object({ ...baseField, type: z.literal('color') });

export const IMAGE_BLOCK_WIDTHS = ['small', 'medium', 'full'] as const;

/** A picture in the form; `description` is its caption. */
export const imageFieldSchema = z.object({
  ...baseField,
  type: z.literal('image'),
  required: notRequired,
  imageUrl: imageUrl.optional(),
  /** What the picture shows, for people who cannot see it; required to publish. */
  alt: z.string().max(300, 'Use 300 characters or fewer'),
  width: z.enum(IMAGE_BLOCK_WIDTHS),
});

/** A YouTube or Vimeo video; `description` is its caption. */
export const videoFieldSchema = z.object({
  ...baseField,
  type: z.literal('video'),
  required: notRequired,
  videoUrl: z.string().max(2048, 'Use a shorter link'),
});

export const dividerFieldSchema = z.object({
  ...baseField,
  type: z.literal('divider'),
  required: notRequired,
});

/** Starts a new page; its `label`, if any, titles the page. */
export const pageBreakFieldSchema = z.object({
  ...baseField,
  type: z.literal('page_break'),
  required: notRequired,
});

/** A checkbox to agree to `terms`; `label` is the checkbox's text. */
export const consentFieldSchema = z.object({
  ...baseField,
  type: z.literal('consent'),
  /** In the rich-text subset, shown above the checkbox. */
  terms: z.string().max(5000, 'Use 5000 characters or fewer'),
});

/** Letters, digits, - and _: what a link's `?name=` may use. */
export const URL_PARAM_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Filled from the form link's query string (`?source=instagram`); respondents never see it. */
export const hiddenFieldSchema = z.object({
  ...baseField,
  type: z.literal('hidden'),
  required: z.literal(false, 'Hidden fields cannot be required'),
  /** Drafts may leave it empty; publishing needs a valid name. */
  paramName: z.string().max(64, 'Use 64 characters or fewer'),
});

export const VOICE_NOTE_MAX_SECONDS = 300;

export const voiceNoteFieldSchema = z.object({
  ...baseField,
  type: z.literal('voice_note'),
  maxDurationSeconds: z
    .number()
    .int()
    .min(5, 'Allow at least 5 seconds')
    .max(VOICE_NOTE_MAX_SECONDS, `Allow at most ${VOICE_NOTE_MAX_SECONDS / 60} minutes`),
});

export const fieldSchema = z.discriminatedUnion('type', [
  shortTextFieldSchema,
  longTextFieldSchema,
  emailFieldSchema,
  numberFieldSchema,
  phoneFieldWithCountrySchema,
  singleChoiceFieldSchema,
  multiChoiceFieldSchema,
  dropdownFieldSchema,
  ratingFieldWithStyleSchema,
  dateFieldSchema,
  fileFieldSchema,
  statementFieldSchema,
  pictureChoiceFieldSchema,
  yesNoFieldSchema,
  npsFieldSchema,
  opinionScaleFieldSchema,
  sliderFieldSchema,
  rankingFieldSchema,
  matrixFieldSchema,
  addressFieldSchema,
  timeFieldSchema,
  dateRangeFieldSchema,
  urlFieldSchema,
  currencyFieldSchema,
  signatureFieldSchema,
  colorFieldSchema,
  imageFieldSchema,
  videoFieldSchema,
  dividerFieldSchema,
  pageBreakFieldSchema,
  consentFieldSchema,
  hiddenFieldSchema,
  voiceNoteFieldSchema,
]);

export type Field = z.infer<typeof fieldSchema>;
export type FieldOfType<T extends FieldType> = Extract<Field, { type: T }>;
export type ChoiceField = FieldOfType<'single_choice' | 'multi_choice' | 'dropdown'>;
/** Questions whose answers are option ids. */
export type OptionField = FieldOfType<
  'single_choice' | 'multi_choice' | 'dropdown' | 'picture_choice' | 'ranking'
>;
