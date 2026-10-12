import {
  CONDITION_OPERATOR_LABELS,
  OPERATORS_BY_FIELD_TYPE,
  operatorNeedsValue,
  type Condition,
  type ConditionOperator,
} from './conditions.js';
import { FIELD_TYPE_LABELS, isAnswerableFieldType } from './field-types.js';
import { TIME_PATTERN } from './answer-values.js';
import type { Field } from './fields.js';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
  return date.getUTCMonth() === (month ?? 0) - 1 && date.getUTCDate() === day;
}

/** Why `condition.value` does not fit its source field, or `null` if it does (or is not set yet). */
export function conditionValueProblem(
  source: Field,
  { operator, value }: Pick<Condition, 'operator' | 'value'>,
): string | null {
  if (!operatorNeedsValue(operator) || value === undefined) return null;

  switch (source.type) {
    case 'number':
      return typeof value === 'number' ? null : 'Enter a number';
    case 'rating':
      return typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 1 &&
        value <= source.ratingScale
        ? null
        : `Pick a rating from 1 to ${source.ratingScale}`;
    case 'date':
      return typeof value === 'string' && isIsoDate(value) ? null : 'Use a date such as 2026-09-30';
    case 'nps':
      return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10
        ? null
        : 'Pick a score from 0 to 10';
    case 'opinion_scale':
      return typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= source.start &&
        value <= source.end
        ? null
        : `Pick a value from ${source.start} to ${source.end}`;
    case 'slider':
    case 'currency':
      return typeof value === 'number' ? null : 'Enter a number';
    case 'time':
      return typeof value === 'string' && TIME_PATTERN.test(value)
        ? null
        : 'Use a time such as 14:30';
    case 'yes_no':
      return value === 'yes' || value === 'no' ? null : 'Choose yes or no';
    case 'picture_choice':
    case 'single_choice':
    case 'multi_choice':
    case 'dropdown':
      return source.options.some((option) => option.id === value)
        ? null
        : "Pick one of the question's options";
    default:
      return typeof value === 'string' ? null : 'Enter text';
  }
}

/**
 * Why `operator` and `value` cannot test `source`'s answer, or `null` if they can (or the
 * value is not set yet). Shared by questions' conditions and the form's logic.
 */
export function answerTestProblem(
  source: Field,
  operator: ConditionOperator,
  value: Condition['value'],
): { key: 'sourceFieldId' | 'operator' | 'value'; message: string } | null {
  if (!isAnswerableFieldType(source.type)) {
    return { key: 'sourceFieldId', message: 'Content blocks have no answer to check' };
  }
  if (!OPERATORS_BY_FIELD_TYPE[source.type].includes(operator)) {
    const type = FIELD_TYPE_LABELS[source.type].toLowerCase();
    return {
      key: 'operator',
      message: `"${CONDITION_OPERATOR_LABELS[operator]}" does not apply to ${type} questions`,
    };
  }
  const problem = conditionValueProblem(source, { operator, value });
  return problem ? { key: 'value', message: problem } : null;
}
