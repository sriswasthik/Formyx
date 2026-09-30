import { CONDITION_OPERATOR_LABELS, operatorNeedsValue, type Condition } from './conditions.js';
import type { Field } from './fields.js';

const LABEL_MAX_LENGTH = 40;

/** The label, cut at a word boundary when it is too long to quote in a sentence. */
function shortLabel(field: Field): string {
  const label = field.label.trim() || 'Untitled question';
  if (label.length <= LABEL_MAX_LENGTH) return label;
  const wordEnd = label.slice(0, LABEL_MAX_LENGTH + 1).lastIndexOf(' ');
  const end = wordEnd > LABEL_MAX_LENGTH / 2 ? wordEnd : LABEL_MAX_LENGTH;
  return `${label.slice(0, end).trimEnd()}…`;
}

function describeValue(source: Field, value: string | number): string {
  if ('options' in source) {
    const option = source.options.find((item) => item.id === value);
    return `"${option?.label.trim() || 'an option'}"`;
  }
  return typeof value === 'number' || source.type === 'date' ? String(value) : `"${value}"`;
}

/** `"Overall satisfaction" is less than 4`, or `null` while the condition is incomplete. */
export function describeCondition(condition: Condition, source: Field | undefined): string | null {
  if (!source) return null;
  const subject = `"${shortLabel(source)}" ${CONDITION_OPERATOR_LABELS[condition.operator]}`;
  if (!operatorNeedsValue(condition.operator)) return subject;
  return condition.value === undefined
    ? null
    : `${subject} ${describeValue(source, condition.value)}`;
}

/**
 * One sentence saying when `field` is shown, such as `Shown when "Role" is "Other"`, or
 * `null` if it has no complete conditions.
 */
export function describeConditions(field: Field, fields: readonly Field[]): string | null {
  const byId = new Map(fields.map((item) => [item.id, item]));
  const parts = (field.conditions ?? []).flatMap((condition) => {
    const text = describeCondition(condition, byId.get(condition.sourceFieldId));
    return text === null ? [] : [text];
  });
  if (parts.length === 0) return null;
  const joiner = field.conditionMatch === 'any' ? ' or ' : ' and ';
  return `Shown when ${parts.join(joiner)}`;
}
