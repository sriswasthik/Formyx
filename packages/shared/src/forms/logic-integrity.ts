import type { z } from 'zod';
import { answerTestProblem } from './condition-checks.js';
import type { FieldType } from './field-types.js';
import type { Field } from './fields.js';
import {
  QUIZ_VARIABLES,
  START_PAGE_KEY,
  type FormLogic,
  type LogicCondition,
} from './logic-schema.js';
import { formPages, pageIndexByField } from './page-layout.js';

/** Questions a quiz can mark. */
export const QUIZ_FIELD_TYPES: readonly FieldType[] = [
  'single_choice',
  'multi_choice',
  'dropdown',
  'picture_choice',
  'yes_no',
  'short_text',
  'number',
];

/** Questions whose answer is a number a rule can use. */
export const NUMERIC_FIELD_TYPES: readonly FieldType[] = [
  'number',
  'rating',
  'nps',
  'opinion_scale',
  'slider',
  'currency',
];

/** Where a condition is used decides what it may look at. */
interface ConditionScope {
  /** The last page whose answers it may check; `Infinity` for any. */
  maxPageIndex: number;
  /** The quiz score and result: end screens only, since only the server marks a quiz. */
  quiz: boolean;
}

type Path = (string | number)[];

/**
 * Rules that span the form's logic and its questions: everything refers to things that
 * exist, jumps only go forward (so a form can never loop), conditions only look at answers
 * already given, and the quiz score is only used where the server works it out.
 */
export function checkLogicIntegrity(
  fields: readonly Field[],
  logic: FormLogic,
  ctx: z.RefinementCtx,
): void {
  const issue = (path: Path, message: string) => {
    ctx.addIssue({ code: 'custom', path: ['logic', ...path], message });
  };
  const pages = formPages(fields);
  const pageIndexByKey = new Map(pages.map((page) => [page.key, page.index]));
  const fieldPage = pageIndexByField(fields);
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const variableIds = new Set(logic.variables.map((variable) => variable.id));
  const endScreenIds = new Set(logic.endScreens.map((screen) => screen.id));

  const unique = (path: Path, items: readonly { id: string }[], noun: string) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.id)) issue([...path, index, 'id'], `Another ${noun} already uses this id`);
      seen.add(item.id);
    });
  };
  unique(['variables'], logic.variables, 'variable');
  unique(['rules'], logic.rules, 'rule');
  unique(['endScreens'], logic.endScreens, 'end screen');
  logic.variables.forEach((variable, index) => {
    if (QUIZ_VARIABLES.includes(variable.id)) {
      issue(['variables', index, 'id'], 'This id is kept for the quiz score');
    }
  });

  const checkConditions = (
    path: Path,
    conditions: readonly LogicCondition[],
    scope: ConditionScope,
  ) => {
    conditions.forEach((condition, index) => {
      const at = [...path, index];
      switch (condition.kind) {
        case 'answer': {
          const source = fieldById.get(condition.sourceFieldId);
          if (!source) {
            issue([...at, 'sourceFieldId'], 'Refers to a question that does not exist');
            return;
          }
          if ((fieldPage.get(source.id) ?? 0) > scope.maxPageIndex) {
            issue([...at, 'sourceFieldId'], 'Can only check questions on this page or earlier');
            return;
          }
          const problem = answerTestProblem(source, condition.operator, condition.value);
          if (problem) issue([...at, problem.key], problem.message);
          return;
        }
        case 'variable':
          if (QUIZ_VARIABLES.includes(condition.variableId)) {
            if (!scope.quiz)
              issue([...at, 'variableId'], 'Only end screens can use the quiz score');
          } else if (!variableIds.has(condition.variableId)) {
            issue([...at, 'variableId'], 'Refers to a variable that does not exist');
          }
          return;
        case 'quiz':
          if (!scope.quiz) issue([...at, 'result'], 'Only end screens can check the quiz result');
          return;
      }
    });
  };

  const jumpIds = new Set<string>();
  for (const [key, settings] of Object.entries(logic.pages)) {
    const pageIndex = pageIndexByKey.get(key);
    if (pageIndex === undefined) {
      issue(['pages', key], 'Refers to a page that no longer exists');
      continue;
    }
    if (key !== START_PAGE_KEY && settings.title !== undefined) {
      issue(['pages', key, 'title'], 'Later pages take their title from their page break');
    }
    settings.jumps?.forEach((jump, index) => {
      const at: Path = ['pages', key, 'jumps', index];
      if (jumpIds.has(jump.id)) issue([...at, 'id'], 'Another jump already uses this id');
      jumpIds.add(jump.id);
      if (jump.to.kind === 'page') {
        const target = pageIndexByKey.get(jump.to.pageKey);
        if (target === undefined) issue([...at, 'to'], 'Refers to a page that does not exist');
        else if (target <= pageIndex) issue([...at, 'to'], 'Can only jump to a later page');
      } else if (!endScreenIds.has(jump.to.endScreenId)) {
        issue([...at, 'to'], 'Refers to an end screen that does not exist');
      }
      checkConditions([...at, 'when'], jump.when, { maxPageIndex: pageIndex, quiz: false });
    });
  }

  logic.rules.forEach((rule, index) => {
    const at: Path = ['rules', index];
    if (!variableIds.has(rule.variableId)) {
      issue([...at, 'variableId'], 'Refers to a variable that does not exist');
    }
    if (rule.amount.kind === 'answer') {
      const source = fieldById.get(rule.amount.fieldId);
      if (!source) issue([...at, 'amount'], 'Refers to a question that does not exist');
      else if (!NUMERIC_FIELD_TYPES.includes(source.type)) {
        issue([...at, 'amount'], 'Use a question whose answer is a number');
      }
    }
    checkConditions([...at, 'when'], rule.when, { maxPageIndex: Infinity, quiz: false });
  });

  for (const [fieldId, answer] of Object.entries(logic.quiz?.answers ?? {})) {
    const at: Path = ['quiz', 'answers', fieldId];
    const field = fieldById.get(fieldId);
    if (!field) {
      issue(at, 'Refers to a question that does not exist');
      continue;
    }
    if (!QUIZ_FIELD_TYPES.includes(field.type)) {
      issue(at, 'A quiz cannot mark this kind of question');
      continue;
    }
    const allowed =
      field.type === 'yes_no'
        ? ['yes', 'no']
        : 'options' in field
          ? field.options.map((option) => option.id)
          : null;
    if (allowed && answer.correct.some((id) => !allowed.includes(id))) {
      issue([...at, 'correct'], "Pick from the question's options");
    }
    if (field.type === 'number' && answer.correct.some((text) => !Number.isFinite(Number(text)))) {
      issue([...at, 'correct'], 'Enter numbers');
    }
  }

  logic.endScreens.forEach((screen, index) => {
    const at: Path = ['endScreens', index];
    checkConditions([...at, 'when'], screen.when, { maxPageIndex: Infinity, quiz: true });
    screen.redirect?.params.forEach((param, paramIndex) => {
      const source = param.source;
      const exists =
        source.kind === 'answer'
          ? fieldById.has(source.fieldId)
          : variableIds.has(source.variableId) || QUIZ_VARIABLES.includes(source.variableId);
      if (!exists) {
        issue(
          [...at, 'redirect', 'params', paramIndex, 'source'],
          source.kind === 'answer'
            ? 'Refers to a question that does not exist'
            : 'Refers to a variable that does not exist',
        );
      }
    });
  });
}
