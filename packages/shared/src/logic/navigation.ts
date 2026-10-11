import {
  evaluateVisibility,
  isAnswered,
  type AnswerValue,
  type Answers,
} from '../forms/answers.js';
import { isAnswerableFieldType } from '../forms/field-types.js';
import type { FormSchema } from '../forms/form-schema.js';
import { formPages, type PageLayout } from '../forms/page-layout.js';
import { computeVariables } from './calculations.js';
import { conditionsHold } from './evaluate.js';

/** A form's route for one respondent, worked out from their answers. */
export interface ResolvedPath {
  /** Keys of the pages on the way, in order, from the first. Empty pages included. */
  pages: string[];
  /** The end screen a jump sent the respondent to; `null` when they reach the end. */
  endJump: string | null;
  /** Fields the respondent sees: shown by their conditions, on a page on the way. */
  active: Set<string>;
  /** Variable values from the answers on the way. */
  values: Record<string, number>;
}

/** Only the answers to `ids`. */
function answersTo(answers: Answers, ids: ReadonlySet<string>): Record<string, AnswerValue> {
  const kept: Record<string, AnswerValue> = {};
  for (const id of ids) {
    const value = answers[id];
    if (value !== undefined) kept[id] = value;
  }
  return kept;
}

/**
 * The pages a respondent goes through, given their answers. From the first page, each
 * page's jumps are checked in order once its questions are answered: the first that holds
 * sends them to a later page or an end screen; without one, they go on to the next page.
 * Jumps only go forward, so the route always ends.
 *
 * Answers count only where the respondent saw the question: on a page on the route, shown
 * by its conditions. Answers left on pages a jump skipped (say, after going back and
 * changing an earlier answer) count as unanswered, here and on the server.
 */
export function resolvePath(
  schema: Pick<FormSchema, 'fields' | 'logic'>,
  answers: Answers,
): ResolvedPath {
  const layout = formPages(schema.fields);
  const fieldById = new Map(schema.fields.map((field) => [field.id, field]));
  const active = new Set<string>();
  const pages: string[] = [];
  let values: Record<string, number> = {};
  let endJump: string | null = null;
  // Hidden fields come from the link, so they count wherever they sit.
  const hiddenIds = schema.fields
    .filter((field) => field.type === 'hidden')
    .map((field) => field.id);

  let index = 0;
  while (index < layout.length) {
    const page = layout[index];
    if (!page) break;
    pages.push(page.key);
    // Conditions only look back, so what is seen so far decides this page.
    const seen = new Set([...active, ...hiddenIds, ...page.fields.map((field) => field.id)]);
    const visible = evaluateVisibility(schema as FormSchema, answersTo(answers, seen));
    if (page.pageBreak && visible.has(page.pageBreak.id)) active.add(page.pageBreak.id);
    for (const id of [...hiddenIds, ...page.fields.map((field) => field.id)]) {
      if (visible.has(id)) active.add(id);
    }

    const seenAnswers = answersTo(answers, active);
    values = computeVariables(schema.logic, fieldById, seenAnswers);
    const context = { fieldById, answers: seenAnswers, values };
    const jump = schema.logic.pages[page.key]?.jumps?.find((candidate) =>
      conditionsHold(candidate.when, candidate.match, context),
    );
    if (jump?.to.kind === 'end') {
      endJump = jump.to.endScreenId;
      break;
    }
    const to = jump?.to;
    const target = to ? layout.findIndex((candidate) => candidate.key === to.pageKey) : -1;
    // Forward only; anything else (never valid) just moves on.
    index = target > index ? target : index + 1;
  }

  return { pages, endJump, active, values };
}

/** Whether a page shows anything: a visible question or block other than a hidden field. */
export function pageHasContent(page: PageLayout, active: ReadonlySet<string>): boolean {
  return page.fields.some((field) => field.type !== 'hidden' && active.has(field.id));
}

/**
 * Only the answers that count: answered, to questions the respondent saw on their route
 * (see `resolvePath`). Answers to skipped, hidden, unknown or content questions are dropped.
 */
export function sanitizeAnswers(
  schema: Pick<FormSchema, 'fields' | 'logic'>,
  answers: Answers,
): Record<string, AnswerValue> {
  const { active } = resolvePath(schema, answers);
  const kept: Record<string, AnswerValue> = {};
  for (const field of schema.fields) {
    const value = answers[field.id];
    if (!active.has(field.id) || !isAnswerableFieldType(field.type) || !isAnswered(value)) {
      continue;
    }
    if (value !== undefined) kept[field.id] = value;
  }
  return kept;
}
