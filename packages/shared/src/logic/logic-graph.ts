import type { FormSchema } from '../forms/form-schema.js';
import { QUIZ_VARIABLES, START_PAGE_KEY, type LogicCondition } from '../forms/logic-schema.js';
import { formPages } from '../forms/page-layout.js';

/*
 * The form's logic as a graph of pages and end screens, for the logic map and for warnings
 * about pages nobody can reach, jumps that never run and end screens nothing leads to.
 */

export type LogicNode =
  | { kind: 'page'; key: string; index: number; title: string; questions: number }
  | { kind: 'end'; id: string; index: number; name: string };

export type LogicEdgeKind =
  /** A page's jump. */
  | 'jump'
  /** On to the next page when no jump applies. */
  | 'next'
  /** From the last page to the end screens chosen by their own conditions, or the default. */
  | 'finish';

export interface LogicEdge {
  id: string;
  kind: LogicEdgeKind;
  from: string;
  /** A page key, or an end screen's id (see `toEnd`). */
  to: string;
  toEnd: boolean;
  /** Taken only when its conditions hold. */
  conditional: boolean;
  jumpId?: string;
}

export type LogicWarning =
  | { kind: 'unreachable_page'; pageKey: string; message: string }
  | { kind: 'loop'; pageKey: string; message: string }
  | { kind: 'unused_jump'; pageKey: string; jumpId: string; message: string }
  | { kind: 'unreachable_end_screen'; endScreenId: string; message: string }
  | { kind: 'empty_page'; pageKey: string; message: string }
  | { kind: 'quiz_without_quiz'; endScreenId: string; message: string };

export interface LogicGraph {
  nodes: LogicNode[];
  edges: LogicEdge[];
  warnings: LogicWarning[];
}

const usesQuiz = (conditions: readonly LogicCondition[]) =>
  conditions.some(
    (condition) =>
      condition.kind === 'quiz' ||
      (condition.kind === 'variable' && QUIZ_VARIABLES.includes(condition.variableId)),
  );

/** "Page 2" when a page has no title. */
export function pageTitle(schema: Pick<FormSchema, 'fields' | 'logic'>, key: string): string {
  const pages = formPages(schema.fields);
  const page = pages.find((candidate) => candidate.key === key);
  const title = key === START_PAGE_KEY ? schema.logic.pages[key]?.title : page?.pageBreak?.label;
  return title?.trim() || `Page ${(page?.index ?? 0) + 1}`;
}

export function analyzeLogic(schema: Pick<FormSchema, 'fields' | 'logic'>): LogicGraph {
  const pages = formPages(schema.fields);
  const { endScreens } = schema.logic;
  const nodes: LogicNode[] = [
    ...pages.map((page) => ({
      kind: 'page' as const,
      key: page.key,
      index: page.index,
      title: pageTitle(schema, page.key),
      questions: page.fields.filter((field) => field.type !== 'hidden').length,
    })),
    ...endScreens.map((screen, index) => ({
      kind: 'end' as const,
      id: screen.id,
      index,
      name: screen.name.trim() || (index === 0 ? 'Default end screen' : `End screen ${index + 1}`),
    })),
  ];
  const edges: LogicEdge[] = [];
  const warnings: LogicWarning[] = [];

  for (const page of pages) {
    let blocked = false;
    for (const jump of schema.logic.pages[page.key]?.jumps ?? []) {
      if (blocked) {
        warnings.push({
          kind: 'unused_jump',
          pageKey: page.key,
          jumpId: jump.id,
          message: 'Never runs: a jump before it always applies',
        });
        continue;
      }
      const toEnd = jump.to.kind === 'end';
      edges.push({
        id: `jump:${jump.id}`,
        kind: 'jump',
        from: page.key,
        to: jump.to.kind === 'end' ? jump.to.endScreenId : jump.to.pageKey,
        toEnd,
        conditional: jump.when.length > 0,
        jumpId: jump.id,
      });
      if (jump.when.length === 0) blocked = true;
    }
    if (blocked) continue;
    const next = pages[page.index + 1];
    if (next) {
      edges.push({
        id: `next:${page.key}`,
        kind: 'next',
        from: page.key,
        to: next.key,
        toEnd: false,
        conditional: false,
      });
    } else {
      endScreens.forEach((screen, index) => {
        if (index > 0 && screen.when.length === 0) return;
        edges.push({
          id: `finish:${screen.id}`,
          kind: 'finish',
          from: page.key,
          to: screen.id,
          toEnd: true,
          conditional: index > 0,
        });
      });
    }
  }

  // Reachability from the first page.
  const reached = new Set<string>([START_PAGE_KEY]);
  const queue = [START_PAGE_KEY];
  while (queue.length > 0) {
    const from = queue.shift();
    if (from === undefined) break;
    for (const edge of edges) {
      if (edge.from !== from || reached.has(edge.to)) continue;
      reached.add(edge.to);
      if (!edge.toEnd) queue.push(edge.to);
    }
  }

  // Loops: jumps only go forward, so these come only from schemas edited by hand.
  const pageEdges = edges.filter((edge) => !edge.toEnd);
  const state = new Map<string, 'open' | 'done'>();
  const visit = (key: string): string | null => {
    state.set(key, 'open');
    for (const edge of pageEdges.filter((candidate) => candidate.from === key)) {
      const seen = state.get(edge.to);
      if (seen === 'open') return edge.to;
      if (!seen) {
        const looped = visit(edge.to);
        if (looped) return looped;
      }
    }
    state.set(key, 'done');
    return null;
  };
  const looped = visit(START_PAGE_KEY);
  if (looped) {
    warnings.push({
      kind: 'loop',
      pageKey: looped,
      message: 'Respondents can go round in a loop here',
    });
  }

  for (const page of pages) {
    if (!reached.has(page.key)) {
      warnings.push({
        kind: 'unreachable_page',
        pageKey: page.key,
        message: 'No route leads to this page',
      });
    } else if (page.fields.filter((field) => field.type !== 'hidden').length === 0) {
      warnings.push({ kind: 'empty_page', pageKey: page.key, message: 'This page is empty' });
    }
  }
  endScreens.forEach((screen, index) => {
    if (!reached.has(screen.id)) {
      warnings.push({
        kind: 'unreachable_end_screen',
        endScreenId: screen.id,
        message:
          index > 0 && screen.when.length === 0
            ? 'Nothing leads here: add conditions, or a jump to it'
            : 'No route leads to this end screen',
      });
    }
    if (!schema.logic.quiz?.enabled && usesQuiz(screen.when)) {
      warnings.push({
        kind: 'quiz_without_quiz',
        endScreenId: screen.id,
        message: 'Checks the quiz, but the quiz is off',
      });
    }
  });

  return { nodes, edges, warnings };
}
