import type { LogicGraph, LogicWarning } from '@formyx/shared';

/** What a logic warning is about, as the map names it: "Page 3" or an end screen's name. */
export function warningSubject(graph: LogicGraph, warning: LogicWarning): string {
  const subject =
    'pageKey' in warning
      ? graph.nodes.find((node) => node.kind === 'page' && node.key === warning.pageKey)
      : graph.nodes.find((node) => node.kind === 'end' && node.id === warning.endScreenId);
  if (!subject) return '';
  return subject.kind === 'page' ? `Page ${subject.index + 1}` : subject.name;
}
