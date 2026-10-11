import { z } from 'zod';
import type { FieldType } from './field-types.js';
import { NODE_ID_PATTERN } from './ids.js';

export const CONDITION_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'is_answered',
  'is_not_answered',
  'greater_than',
  'less_than',
] as const;

export const conditionOperatorSchema = z.enum(CONDITION_OPERATORS);
export type ConditionOperator = z.infer<typeof conditionOperatorSchema>;

/** Whether every condition on a field must hold for it to show, or just one of them. */
export const conditionMatchSchema = z.enum(['all', 'any']);
export type ConditionMatch = z.infer<typeof conditionMatchSchema>;

/**
 * Show a field only when an earlier field's answer satisfies `operator`. `value` holds the
 * text, number, ISO date (YYYY-MM-DD) or option id to compare with, depending on the
 * source field's type; `is_answered` and `is_not_answered` need no value.
 */
export const conditionSchema = z.object({
  sourceFieldId: z.string().regex(NODE_ID_PATTERN, 'Invalid question id'),
  operator: conditionOperatorSchema,
  value: z.union([z.string().max(500), z.number()]).optional(),
});
export type Condition = z.infer<typeof conditionSchema>;

const VALUELESS_OPERATORS: readonly ConditionOperator[] = ['is_answered', 'is_not_answered'];

export function operatorNeedsValue(operator: ConditionOperator): boolean {
  return !VALUELESS_OPERATORS.includes(operator);
}

const PRESENCE = ['is_answered', 'is_not_answered'] as const;
const TEXT_OPERATORS = ['equals', 'not_equals', 'contains', ...PRESENCE] as const;
const ORDERED_OPERATORS = [
  'equals',
  'not_equals',
  'greater_than',
  'less_than',
  ...PRESENCE,
] as const;

/** Which operators make sense for answers of each field type. */
export const OPERATORS_BY_FIELD_TYPE: Record<FieldType, readonly ConditionOperator[]> = {
  short_text: TEXT_OPERATORS,
  long_text: TEXT_OPERATORS,
  email: TEXT_OPERATORS,
  phone: TEXT_OPERATORS,
  number: ORDERED_OPERATORS,
  rating: ORDERED_OPERATORS,
  date: ORDERED_OPERATORS,
  single_choice: ['equals', 'not_equals', ...PRESENCE],
  dropdown: ['equals', 'not_equals', ...PRESENCE],
  multi_choice: ['contains', ...PRESENCE],
  file: PRESENCE,
  statement: [],
  picture_choice: ['equals', 'not_equals', 'contains', ...PRESENCE],
  yes_no: ['equals', 'not_equals', ...PRESENCE],
  nps: ORDERED_OPERATORS,
  opinion_scale: ORDERED_OPERATORS,
  slider: ORDERED_OPERATORS,
  currency: ORDERED_OPERATORS,
  time: ORDERED_OPERATORS,
  url: TEXT_OPERATORS,
  // Hidden fields carry where respondents came from: "source is instagram".
  hidden: TEXT_OPERATORS,
  ranking: PRESENCE,
  matrix: PRESENCE,
  address: PRESENCE,
  date_range: PRESENCE,
  signature: PRESENCE,
  voice_note: PRESENCE,
  color: PRESENCE,
  consent: PRESENCE,
  image: [],
  video: [],
  divider: [],
  page_break: [],
};

export const CONDITION_OPERATOR_LABELS: Record<ConditionOperator, string> = {
  equals: 'is',
  not_equals: 'is not',
  contains: 'contains',
  is_answered: 'is answered',
  is_not_answered: 'is not answered',
  greater_than: 'is greater than',
  less_than: 'is less than',
};
