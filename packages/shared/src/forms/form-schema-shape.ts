import { z } from 'zod';
import { dateFormatSchema, formLanguageSchema, numberFormatSchema } from '../i18n/languages.js';
import { fieldSchema } from './fields.js';
import { formLogicSchema } from './logic-schema.js';

// The form schema's structure, apart from the checks that span it (form-schema.ts), so code
// that only reads published forms, such as the public form, can leave those checks out.

/**
 * 2: Sprint 12's question types, rich-text statements and phone country codes.
 * 3: Sprint 13's logic: page jumps, variables, quizzes and end screens.
 * 4: Sprint 14's language and formats; the response limit and closing time moved to the
 *    form's live settings, which take effect without publishing.
 */
export const FORM_SCHEMA_VERSION = 4;
export const MAX_FIELDS = 250;
export const FORM_DESCRIPTION_MAX_LENGTH = 2000;

export const formSettingsSchema = z.object({
  submitButtonText: z
    .string()
    .trim()
    .min(1, 'Enter the button text')
    .max(40, 'Use 40 characters or fewer'),
  /**
   * Keeping respondents' answers while they fill the form in: `browser` keeps them on their
   * device, `email` also lets them email themselves a link to finish later.
   */
  saveProgress: z.enum(['off', 'browser', 'email']),
  /** The language of everything Formyx says on the form: buttons, checks, dates. */
  language: formLanguageSchema,
  dateFormat: dateFormatSchema,
  numberFormat: numberFormatSchema,
});
export type FormSettings = z.infer<typeof formSettingsSchema>;

/**
 * The shape of a form schema without the checks that span it (references, jumps, ids).
 * For reading forms the server has already checked, such as a published form in the
 * respondent's browser, where those checks would only add weight.
 */
export const formSchemaShape = z.object({
  version: z.literal(FORM_SCHEMA_VERSION),
  /** Shown under the title, to introduce the form. */
  description: z
    .string()
    .max(FORM_DESCRIPTION_MAX_LENGTH, `Use ${FORM_DESCRIPTION_MAX_LENGTH} characters or fewer`)
    .optional(),
  fields: z.array(fieldSchema).max(MAX_FIELDS, `Forms can have at most ${MAX_FIELDS} questions`),
  settings: formSettingsSchema,
  logic: formLogicSchema,
});
