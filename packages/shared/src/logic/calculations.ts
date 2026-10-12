import type { Answers } from '../forms/answers.js';
import type { Field } from '../forms/fields.js';
import type { FormLogic } from '../forms/logic-schema.js';
import { conditionsHold, tidyNumber } from './evaluate.js';

/** A number answer's value, for rules that use it ("add the quantity to the total"). */
function numericAnswer(value: Answers[string]): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * The form's variables worked out from `answers`: each starts at its initial value, then
 * the rules run in order, each seeing the values the ones before it left. A rule whose
 * amount is an unanswered question does nothing. Pass only answers the respondent saw.
 */
export function computeVariables(
  logic: Pick<FormLogic, 'variables' | 'rules'>,
  fieldById: ReadonlyMap<string, Field>,
  answers: Answers,
): Record<string, number> {
  const values: Record<string, number> = {};
  for (const variable of logic.variables) values[variable.id] = variable.initial;

  for (const rule of logic.rules) {
    const current = values[rule.variableId];
    if (current === undefined) continue;
    if (!conditionsHold(rule.when, rule.match, { fieldById, answers, values })) continue;
    const amount =
      rule.amount.kind === 'number'
        ? rule.amount.value
        : numericAnswer(answers[rule.amount.fieldId]);
    if (amount === null) continue;
    const next =
      rule.operation === 'add'
        ? current + amount
        : rule.operation === 'subtract'
          ? current - amount
          : rule.operation === 'multiply'
            ? current * amount
            : amount;
    values[rule.variableId] = tidyNumber(next);
  }
  return values;
}
