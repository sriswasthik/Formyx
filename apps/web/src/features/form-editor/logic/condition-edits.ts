import {
  isAnswerableFieldType,
  operatorNeedsValue,
  OPERATORS_BY_FIELD_TYPE,
  type Condition,
  type ConditionOperator,
  type Field,
} from '@formyx/shared';

export interface ConditionSource {
  field: Field;
  /** 1-based position on the form, as the canvas numbers questions. */
  position: number;
}

/** The questions a condition on `fields[index]` may check: earlier ones that take answers. */
export function conditionSources(fields: readonly Field[], index: number): ConditionSource[] {
  return fields
    .slice(0, Math.max(index, 0))
    .map((field, position) => ({ field, position: position + 1 }))
    .filter(({ field }) => isAnswerableFieldType(field.type));
}

/** A starting value that fits the source: its first option (or Yes), otherwise none yet. */
function defaultValue(source: Field, operator: ConditionOperator): string | undefined {
  if (!operatorNeedsValue(operator)) return undefined;
  if (source.type === 'yes_no') return 'yes';
  return 'options' in source ? source.options[0]?.id : undefined;
}

function withValue(
  sourceFieldId: string,
  operator: ConditionOperator,
  value: string | number | undefined,
): Condition {
  return value === undefined ? { sourceFieldId, operator } : { sourceFieldId, operator, value };
}

/** A new condition on `source`, with the first operator it offers. */
export function createCondition(source: Field): Condition {
  const operator = OPERATORS_BY_FIELD_TYPE[source.type][0] ?? 'is_answered';
  return withValue(source.id, operator, defaultValue(source, operator));
}

/**
 * Points a condition at another question. The comparison stays if the new question offers
 * it; the value never carries over, since it described the old question's answer.
 */
export function changeSource(condition: Condition, source: Field): Condition {
  const operators = OPERATORS_BY_FIELD_TYPE[source.type];
  const operator = operators.includes(condition.operator)
    ? condition.operator
    : (operators[0] ?? 'is_answered');
  return withValue(source.id, operator, defaultValue(source, operator));
}

/** Switches the comparison, keeping the value when the new one still compares against it. */
export function changeOperator(
  condition: Condition,
  operator: ConditionOperator,
  source: Field,
): Condition {
  if (!operatorNeedsValue(operator)) return withValue(condition.sourceFieldId, operator, undefined);
  const value = condition.value ?? defaultValue(source, operator);
  return withValue(condition.sourceFieldId, operator, value);
}

/** Sets or clears the value compared against. */
export function changeValue(condition: Condition, value: string | number | undefined): Condition {
  return withValue(condition.sourceFieldId, condition.operator, value);
}
