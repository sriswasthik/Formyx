import { evaluateCondition, type Answers } from '../forms/answers.js';
import type { ConditionMatch } from '../forms/conditions.js';
import type { Field } from '../forms/fields.js';
import type { LogicCondition, VariableOperator } from '../forms/logic-schema.js';

/** What logic conditions are checked against. */
export interface LogicContext {
  fieldById: ReadonlyMap<string, Field>;
  /** Answers to the questions the respondent has seen; others count as unanswered. */
  answers: Answers;
  /** Variable values, and the quiz score once the server has marked it. */
  values: Readonly<Record<string, number>>;
  /** Whether the quiz was passed; `undefined` where it is not known (in the browser). */
  quizPassed?: boolean | null | undefined;
}

/** Rounds away floating-point dust (0.1 + 0.2), keeping six decimals. */
export function tidyNumber(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function compareVariable(operator: VariableOperator, actual: number, expected: number): boolean {
  switch (operator) {
    case 'equals':
      return actual === expected;
    case 'not_equals':
      return actual !== expected;
    case 'greater_than':
      return actual > expected;
    case 'at_least':
      return actual >= expected;
    case 'less_than':
      return actual < expected;
    case 'at_most':
      return actual <= expected;
  }
}

/**
 * Whether one condition holds, or `null` when it cannot be decided yet: a value still to be
 * entered, or the quiz result where only the server knows it.
 */
export function evaluateLogicCondition(
  condition: LogicCondition,
  context: LogicContext,
): boolean | null {
  switch (condition.kind) {
    case 'answer': {
      const source = context.fieldById.get(condition.sourceFieldId);
      if (!source) return null;
      return evaluateCondition(
        { sourceFieldId: source.id, operator: condition.operator, value: condition.value },
        source,
        context.answers[source.id],
      );
    }
    case 'variable': {
      if (condition.value === undefined) return null;
      const actual = context.values[condition.variableId];
      if (actual === undefined) return null;
      return compareVariable(condition.operator, actual, condition.value);
    }
    case 'quiz':
      if (context.quizPassed === undefined || context.quizPassed === null) return null;
      return context.quizPassed === (condition.result === 'passed');
  }
}

/**
 * Whether a jump, rule or end screen's conditions hold. None means "always". Conditions that
 * cannot be decided are left out; if none can be, the whole set does not hold, so a
 * half-written jump never fires.
 */
export function conditionsHold(
  conditions: readonly LogicCondition[],
  match: ConditionMatch,
  context: LogicContext,
): boolean {
  if (conditions.length === 0) return true;
  const results = conditions.flatMap((condition) => {
    const result = evaluateLogicCondition(condition, context);
    return result === null ? [] : [result];
  });
  if (results.length === 0) return false;
  return match === 'any' ? results.some(Boolean) : results.every(Boolean);
}
