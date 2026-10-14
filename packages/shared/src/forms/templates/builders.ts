import type { ThemePresetId } from '../../assets/presets.js';
import { createDefaultSettings, createField, createOption } from '../factories.js';
import type { ChoiceFieldType, FieldType } from '../field-types.js';
import type { Field, FieldOfType } from '../fields.js';
import { FORM_SCHEMA_VERSION, type FormSettings } from '../form-schema-shape.js';
import type { FormSchema } from '../form-schema.js';
import { createDefaultLogic } from '../logic-factories.js';
import type { FormLogic } from '../logic-schema.js';
import type { FormTemplateId } from '../template-ids.js';

/*
 * Helpers the templates are written with: questions with fresh ids on every build, options by
 * label, and conditions pointing at options by label.
 */

/** What a template is for, in the order the gallery lists them. */
export const TEMPLATE_CATEGORIES = [
  'events',
  'feedback',
  'hr',
  'education',
  'business',
  'quizzes',
  'community',
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  events: 'Events',
  feedback: 'Feedback and research',
  hr: 'Hiring and HR',
  education: 'Education',
  business: 'Orders and bookings',
  quizzes: 'Quizzes',
  community: 'Community and non-profit',
};

export interface FormTemplate {
  id: FormTemplateId;
  /** Its page in the gallery: /templates/<slug>. */
  slug: string;
  name: string;
  /** One line, for cards. */
  description: string;
  /** A sentence or two for search results and link previews (about 150 characters). */
  seoDescription: string;
  category: TemplateCategory | null;
  /** The look a form made from it starts with (a workspace's default brand kit wins). */
  presetId: ThemePresetId | null;
  /** Title of a form created from the template. */
  defaultTitle: string;
  /** A fresh schema with new ids on every call. */
  build: () => FormSchema;
}

type FieldProps<T extends FieldType> = Partial<Omit<FieldOfType<T>, 'id' | 'type'>>;

export function field<T extends FieldType>(type: T, props: FieldProps<T>): FieldOfType<T> {
  return { ...createField(type), ...props };
}

export function choice<T extends ChoiceFieldType>(
  type: T,
  labels: string[],
  props: FieldProps<T>,
): FieldOfType<T> {
  return { ...createField(type), options: labels.map(createOption), ...props };
}

/** Options for a matrix's rows or columns. */
export const options = (labels: string[]) => labels.map(createOption);

/** Id of the option labelled `label`; templates use it to point conditions at options. */
export function optionId(
  target: { options: { id: string; label: string }[] },
  label: string,
): string {
  const option = target.options.find((candidate) => candidate.label === label);
  if (!option) throw new Error(`Template option "${label}" does not exist`);
  return option.id;
}

/** "Show only when `source` is `label`". */
export function when(
  source: { id: string; options: { id: string; label: string }[] },
  label: string,
): Field['conditions'] {
  return [{ sourceFieldId: source.id, operator: 'equals', value: optionId(source, label) }];
}

/** A schema from its questions, with the button text and the thank-you message. */
export function form(
  fields: Field[],
  {
    submit,
    thanks,
    settings = {},
    logic,
  }: {
    submit: string;
    thanks: string;
    settings?: Partial<FormSettings>;
    logic?: (logic: FormLogic) => FormLogic;
  },
): FormSchema {
  const base = createDefaultLogic(thanks);
  return {
    version: FORM_SCHEMA_VERSION,
    fields,
    settings: { ...createDefaultSettings(), submitButtonText: submit, ...settings },
    logic: logic ? logic(base) : base,
  };
}
