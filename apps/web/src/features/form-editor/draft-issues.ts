import { toValidationIssues, updateFormInputSchema, type ValidationIssue } from '@formyx/shared';
import { useMemo } from 'react';
import type { EditorState } from './editor-store';
import { useEditorStore } from './editor-store-context';

/**
 * Problems that would make the server reject a save, found with the same shared schema.
 * Paths look like `title` or `draftSchema.fields.2.validation.max`.
 */
export function findDraftIssues({ title, schema }: Pick<EditorState, 'title' | 'schema'>) {
  const result = updateFormInputSchema.safeParse({ version: 1, title, draftSchema: schema });
  return result.success ? [] : toValidationIssues(result.error);
}

export function useDraftIssues(): ValidationIssue[] {
  const title = useEditorStore((state) => state.title);
  const schema = useEditorStore((state) => state.schema);
  return useMemo(() => findDraftIssues({ title, schema }), [title, schema]);
}

/** Problems within one part of the draft, keyed by the rest of their path. */
export function issuesUnder(issues: readonly ValidationIssue[], prefix: string) {
  const found: Record<string, string> = {};
  for (const issue of issues) {
    if (issue.path.startsWith(`${prefix}.`)) {
      found[issue.path.slice(prefix.length + 1)] ??= issue.message;
    }
  }
  return found;
}

/** Index of the first question with a problem, for "Fix issues" to jump to. */
export function firstFieldWithIssue(issues: readonly ValidationIssue[]): number | null {
  for (const issue of issues) {
    const match = /^draftSchema\.fields\.(\d+)\./.exec(issue.path);
    if (match) return Number(match[1]);
  }
  return null;
}
