import { z } from 'zod';
import { pageTitle } from '../logic/logic-graph.js';
import { PIPE_PATTERN } from '../logic/piping.js';
import { isShownQuestionType } from './field-types.js';
import type { FormSchema } from './form-schema.js';
import { formPages } from './page-layout.js';

/*
 * Drop-off: how far visitors got before leaving. Each visit reports, anonymously, the page
 * it reached and the last question it answered (see `progressInputSchema`); the funnel
 * counts the visits that reached each step.
 */

const count = z.number().int().min(0);

export const dropOffSchema = z.object({
  /** Pages for forms with page breaks, questions otherwise. */
  unit: z.enum(['page', 'question']),
  /** Visits that reported their progress. */
  started: count,
  steps: z.array(z.object({ key: z.string(), label: z.string(), reached: count })),
  /** Visits that ended in a response. */
  completed: count,
});
export type DropOff = z.infer<typeof dropOffSchema>;

/** How far one visit got, as stored. */
export interface VisitProgress {
  furthestPage: string | null;
  furthestField: string | null;
  completed: boolean;
  /** How many visits this stands for (the server groups identical ones); 1 by default. */
  count?: number;
}

/** A label for the funnel: piped answers shown as "…". */
function plainLabel(text: string, fallback: string): string {
  return text.replace(PIPE_PATTERN, '…').trim() || fallback;
}

/**
 * The funnel for `schema` (the published form) from its visits. A visit reached a page when
 * its furthest page is that one or later, finished or not, so pages that jumps skip show
 * fewer visits than the responses sent. On a one-page form, a visit reached the question
 * after the last one it answered, and finished visits saw every question. Progress on pages
 * or questions that are no longer in the form counts as the start.
 */
export function buildDropOff(
  schema: Pick<FormSchema, 'fields' | 'logic'>,
  visits: readonly VisitProgress[],
): DropOff {
  const pages = formPages(schema.fields).filter((page) =>
    page.fields.some((field) => field.type !== 'hidden'),
  );
  const weight = (visit: VisitProgress) => visit.count ?? 1;
  const total = (list: readonly VisitProgress[]) =>
    list.reduce((sum, visit) => sum + weight(visit), 0);
  const completed = total(visits.filter((visit) => visit.completed));

  if (pages.length > 1) {
    const indexByKey = new Map(pages.map((page, index) => [page.key, index]));
    const reachedIndex = (visit: VisitProgress) => indexByKey.get(visit.furthestPage ?? '') ?? 0;
    return {
      unit: 'page',
      started: total(visits),
      steps: pages.map((page, index) => ({
        key: page.key,
        label: plainLabel(pageTitle(schema, page.key), `Page ${index + 1}`),
        reached: total(visits.filter((visit) => reachedIndex(visit) >= index)),
      })),
      completed,
    };
  }

  const questions = schema.fields.filter((field) => isShownQuestionType(field.type));
  const indexById = new Map(questions.map((field, index) => [field.id, index]));
  // A visit "reached" the question after the last one it answered.
  const reachedIndex = (visit: VisitProgress) => {
    if (visit.completed) return Infinity;
    const answered = indexById.get(visit.furthestField ?? '');
    return answered === undefined ? 0 : answered + 1;
  };
  return {
    unit: 'question',
    started: total(visits),
    steps: questions.map((field, index) => ({
      key: field.id,
      label: plainLabel(field.label, `Question ${index + 1}`),
      reached: total(visits.filter((visit) => reachedIndex(visit) >= index)),
    })),
    completed,
  };
}

/**
 * The step most visitors left before, as its index; `null` when nobody left. The drop into
 * the first step is from the visits that started, into "completed" from the last step.
 */
export function biggestDrop(dropOff: DropOff): { index: number; lost: number } | null {
  let best: { index: number; lost: number } | null = null;
  let previous = dropOff.started;
  const counts = [...dropOff.steps.map((step) => step.reached), dropOff.completed];
  counts.forEach((reached, index) => {
    const lost = previous - reached;
    if (lost > 0 && (!best || lost > best.lost)) best = { index, lost };
    previous = reached;
  });
  return best;
}
