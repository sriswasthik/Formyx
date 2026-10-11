import { z } from 'zod';

/** Every question and block type. Stored in forms, so never rename or remove one. */
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
  // Sprint 12
  'picture_choice',
  'yes_no',
  'nps',
  'opinion_scale',
  'slider',
  'ranking',
  'matrix',
  'address',
  'time',
  'date_range',
  'url',
  'currency',
  'signature',
  'color',
  'image',
  'video',
  'divider',
  'page_break',
  'consent',
  'hidden',
  'voice_note',
] as const;

export const fieldTypeSchema = z.enum(FIELD_TYPES);
export type FieldType = z.infer<typeof fieldTypeSchema>;

export const TEXT_FIELD_TYPES = ['short_text', 'long_text', 'email', 'phone'] as const;
export const CHOICE_FIELD_TYPES = ['single_choice', 'multi_choice', 'dropdown'] as const;
export type ChoiceFieldType = (typeof CHOICE_FIELD_TYPES)[number];

/** Blocks that show something and collect no answer. */
export const CONTENT_FIELD_TYPES = [
  'statement',
  'image',
  'video',
  'divider',
  'page_break',
] as const satisfies readonly FieldType[];
export type ContentFieldType = (typeof CONTENT_FIELD_TYPES)[number];

/** Answers that are files in storage: checked against storage when a response arrives. */
export const UPLOAD_FIELD_TYPES = [
  'file',
  'signature',
  'voice_note',
] as const satisfies readonly FieldType[];
export type UploadFieldType = (typeof UPLOAD_FIELD_TYPES)[number];

export function isChoiceFieldType(type: FieldType): type is ChoiceFieldType {
  return (CHOICE_FIELD_TYPES as readonly FieldType[]).includes(type);
}

export function isContentFieldType(type: FieldType): type is ContentFieldType {
  return (CONTENT_FIELD_TYPES as readonly FieldType[]).includes(type);
}

export function isUploadFieldType(type: FieldType): type is UploadFieldType {
  return (UPLOAD_FIELD_TYPES as readonly FieldType[]).includes(type);
}

/** Everything but content blocks collects an answer (hidden fields from the link). */
export function isAnswerableFieldType(type: FieldType): boolean {
  return !isContentFieldType(type);
}

/** Questions respondents see and answer; hidden fields are filled from the link instead. */
export function isShownQuestionType(type: FieldType): boolean {
  return isAnswerableFieldType(type) && type !== 'hidden';
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
  picture_choice: 'Picture choice',
  yes_no: 'Yes or no',
  nps: 'Net Promoter Score',
  opinion_scale: 'Opinion scale',
  slider: 'Slider',
  ranking: 'Ranking',
  matrix: 'Matrix',
  address: 'Address',
  time: 'Time',
  date_range: 'Date range',
  url: 'Website',
  currency: 'Amount',
  signature: 'Signature',
  color: 'Colour',
  image: 'Image',
  video: 'Video',
  divider: 'Divider',
  page_break: 'Page break',
  consent: 'Consent',
  hidden: 'Hidden field',
  voice_note: 'Voice note',
};
