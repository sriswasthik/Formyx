import { useMemo } from 'react';
import { issuesUnder, useDraftIssues } from '../draft-issues';
import { usePublishIssues } from '../publish/publish-issues';

/** Problems with the form's logic, keyed by path below `logic`, e.g. `rules.0.variableId`. */
export function useLogicIssues(): Record<string, string> {
  const draft = useDraftIssues();
  const publish = usePublishIssues();
  return useMemo(() => issuesUnder([...draft, ...publish], 'draftSchema.logic'), [draft, publish]);
}

/** The problems under `prefix`, keyed by the rest of their path. */
export function issuesAt(issues: Record<string, string>, prefix: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(issues)
      .filter(([path]) => path.startsWith(`${prefix}.`))
      .map(([path, message]) => [path.slice(prefix.length + 1), message]),
  );
}
