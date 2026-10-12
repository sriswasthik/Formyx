import type { ValidationIssue } from '../errors.js';
import { findPipeTokens, pipeTokenProblem } from '../logic/piping.js';
import { operatorNeedsValue } from './conditions.js';
import { isAnswerableFieldType } from './field-types.js';
import type { FormSchema } from './form-schema.js';
import { START_PAGE_KEY, type LogicCondition } from './logic-schema.js';

/** A query parameter name that survives any URL: letters, digits, `-`, `_` and `.`. */
export const REDIRECT_PARAM_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

function isHttpsUrl(text: string): boolean {
  try {
    return new URL(text.trim()).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * What the form's logic still needs before publishing: names, condition values, end
 * screen content, working links, the quiz's right answers, and answers piped in only from
 * questions that come before. Paths match the draft's, so editors can point at the input.
 */
export function findLogicPublishIssues(schema: FormSchema): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const issue = (path: string, message: string) => {
    issues.push({ path, message });
  };
  const { logic, fields } = schema;

  const checkConditions = (path: string, conditions: readonly LogicCondition[]) => {
    conditions.forEach((condition, index) => {
      const missing =
        condition.kind === 'answer'
          ? operatorNeedsValue(condition.operator) &&
            (condition.value === undefined ||
              (typeof condition.value === 'string' && condition.value.trim() === ''))
          : condition.kind === 'variable' && condition.value === undefined;
      if (missing) issue(`${path}.${index}.value`, 'Choose a value for this condition');
    });
  };

  const names = new Set<string>();
  logic.variables.forEach((variable, index) => {
    const name = variable.name.trim().toLowerCase();
    if (name === '') issue(`logic.variables.${index}.name`, 'Name this variable');
    else if (names.has(name)) {
      issue(`logic.variables.${index}.name`, 'Another variable has this name');
    }
    names.add(name);
  });

  for (const [key, page] of Object.entries(logic.pages)) {
    page.jumps?.forEach((jump, index) => {
      checkConditions(`logic.pages.${key}.jumps.${index}.when`, jump.when);
    });
  }
  logic.rules.forEach((rule, index) => {
    checkConditions(`logic.rules.${index}.when`, rule.when);
  });

  logic.endScreens.forEach((screen, index) => {
    const at = `logic.endScreens.${index}`;
    checkConditions(`${at}.when`, screen.when);
    if (screen.title.trim() === '' && screen.message.trim() === '') {
      issue(`${at}.message`, 'Write a title or a message');
    }
    if (screen.button) {
      if (screen.button.label.trim() === '') issue(`${at}.button.label`, 'Write the button text');
      if (!isHttpsUrl(screen.button.url)) issue(`${at}.button.url`, 'Use an https:// link');
    }
    if (screen.redirect) {
      if (!isHttpsUrl(screen.redirect.url)) issue(`${at}.redirect.url`, 'Use an https:// link');
      const params = new Set<string>();
      screen.redirect.params.forEach((param, paramIndex) => {
        const path = `${at}.redirect.params.${paramIndex}.name`;
        if (!REDIRECT_PARAM_PATTERN.test(param.name)) {
          issue(path, 'Use letters, digits, -, _ and . for the parameter');
        } else if (params.has(param.name)) {
          issue(path, 'Another parameter has this name');
        }
        params.add(param.name);
      });
    }
  });

  if (logic.quiz?.enabled) {
    const entries = Object.entries(logic.quiz.answers);
    if (entries.length === 0) {
      issue('logic.quiz', 'Mark the right answer to at least one question');
    }
    for (const [fieldId, answer] of entries) {
      if (answer.correct.length === 0) {
        issue(`logic.quiz.answers.${fieldId}.correct`, 'Choose the right answer');
      }
    }
  }

  // Piped answers must come from questions before the text.
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const earlier = new Set<string>();
  const checkPiping = (path: string, text: string | undefined, quiz: boolean) => {
    for (const token of findPipeTokens(text ?? '')) {
      const problem = pipeTokenProblem(token, fieldById, earlier, logic.variables, { quiz });
      if (problem) {
        issue(path, problem);
        return;
      }
    }
  };
  checkPiping(`logic.pages.${START_PAGE_KEY}.title`, logic.pages[START_PAGE_KEY]?.title, false);
  fields.forEach((field, index) => {
    checkPiping(`fields.${index}.label`, field.label, false);
    checkPiping(`fields.${index}.description`, field.description, false);
    if (isAnswerableFieldType(field.type)) earlier.add(field.id);
  });
  logic.endScreens.forEach((screen, index) => {
    checkPiping(`logic.endScreens.${index}.title`, screen.title, true);
    checkPiping(`logic.endScreens.${index}.message`, screen.message, true);
  });

  return issues;
}
