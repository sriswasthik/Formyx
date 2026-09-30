import { z } from 'zod';

export const FIELD_TYPES = [
  'short_text',
  'long_text',
  'email',
  'number',
  'phone',
  'single_choice',
  'multi_choice',
  'dropdown',
  'rating',
  'date',
  'file',
  'statement',
] as const;

export const fieldTypeSchema = z.enum(FIELD_TYPES);
export type FieldType = z.infer<typeof fieldTypeSchema>;

export const TEXT_FIELD_TYPES = ['short_text', 'long_text', 'email', 'phone'] as const;
export const CHOICE_FIELD_TYPES = ['single_choice', 'multi_choice', 'dropdown'] as const;
export type ChoiceFieldType = (typeof CHOICE_FIELD_TYPES)[number];

export function isChoiceFieldType(type: FieldType): type is ChoiceFieldType {
  return (CHOICE_FIELD_TYPES as readonly FieldType[]).includes(type);
}

/** Every type except `statement` collects an answer. */
export function isAnswerableFieldType(type: FieldType): boolean {
  return type !== 'statement';
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  short_text: 'Short text',
  long_text: 'Long text',
  email: 'Email',
  number: 'Number',
  phone: 'Phone number',
  single_choice: 'Single choice',
  multi_choice: 'Multiple choice',
  dropdown: 'Dropdown',
  rating: 'Rating',
  date: 'Date',
  file: 'File upload',
  statement: 'Statement',
};
