import type { z } from 'zod';
import type { Field } from './fields.js';
import { checkLogicIntegrity } from './logic-integrity.js';
import type { FormLogic } from './logic-schema.js';

/**
 * Drops the parts of the form's logic that no longer hold together after the questions
 * changed: a jump, rule or redirect parameter that refers to something gone (or a page
 * now after it) goes as a whole, since a jump or rule with fewer conditions would apply
 * more often than intended; an end screen only loses the broken conditions. Returns the
 * same object when nothing was broken.
 */
export function repairLogic(
  fields: readonly Field[],
  logic: FormLogic,
): { logic: FormLogic; removed: number } {
  const paths: (string | number)[][] = [];
  const collector = {
    addIssue: (issue: { path?: PropertyKey[] }) => {
      // Paths start with 'logic'.
      paths.push((issue.path ?? []).slice(1) as (string | number)[]);
    },
  } as unknown as z.RefinementCtx;
  checkLogicIntegrity(fields, logic, collector);
  if (paths.length === 0) return { logic, removed: 0 };

  const has = (prefix: (string | number)[]) =>
    paths.some((path) => prefix.every((part, index) => path[index] === part));

  let removed = 0;
  const pages: FormLogic['pages'] = {};
  for (const [key, settings] of Object.entries(logic.pages)) {
    if (paths.some((path) => path[0] === 'pages' && path[1] === key && path.length === 2)) {
      removed += 1 + (settings.jumps?.length ?? 0);
      continue;
    }
    const jumps = settings.jumps?.filter((_jump, index) => {
      const broken = has(['pages', key, 'jumps', index]);
      if (broken) removed += 1;
      return !broken;
    });
    const { title, ...rest } = settings;
    const keepTitle = !has(['pages', key, 'title']);
    if (!keepTitle) removed += 1;
    pages[key] = {
      ...rest,
      ...(keepTitle && title !== undefined && { title }),
      ...(jumps && { jumps }),
    };
  }

  const rules = logic.rules.filter((_rule, index) => {
    const broken = has(['rules', index]);
    if (broken) removed += 1;
    return !broken;
  });

  const quiz = logic.quiz && {
    ...logic.quiz,
    answers: Object.fromEntries(
      Object.entries(logic.quiz.answers).flatMap(([fieldId, answer]) => {
        if (paths.some((path) => path[0] === 'quiz' && path[2] === fieldId && path.length === 3)) {
          removed += 1;
          return [];
        }
        if (!has(['quiz', 'answers', fieldId, 'correct'])) return [[fieldId, answer]];
        // Keep the right answers that are still options.
        const field = fields.find((candidate) => candidate.id === fieldId);
        const options =
          field?.type === 'yes_no'
            ? ['yes', 'no']
            : field && 'options' in field
              ? field.options.map((option) => option.id)
              : null;
        const correct = options
          ? answer.correct.filter((id) => options.includes(id))
          : answer.correct.filter((text) => Number.isFinite(Number(text)));
        removed += answer.correct.length - correct.length;
        return [[fieldId, { ...answer, correct }]];
      }),
    ),
  };

  const endScreens = logic.endScreens.map((screen, index) => {
    const when = screen.when.filter((_condition, conditionIndex) => {
      const broken = has(['endScreens', index, 'when', conditionIndex]);
      if (broken) removed += 1;
      return !broken;
    });
    const redirect = screen.redirect && {
      ...screen.redirect,
      params: screen.redirect.params.filter((_param, paramIndex) => {
        const broken = has(['endScreens', index, 'redirect', 'params', paramIndex]);
        if (broken) removed += 1;
        return !broken;
      }),
    };
    return { ...screen, when, ...(redirect && { redirect }) };
  });

  return {
    logic: { ...logic, pages, rules, ...(quiz && { quiz }), endScreens },
    removed,
  };
}
